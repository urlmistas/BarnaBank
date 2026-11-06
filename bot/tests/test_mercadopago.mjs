// Pix pelo Mercado Pago: gerar a cobrança, conferir o aviso (assinatura, repetição, status) e dar baixa na dívida.
// Uso: node bot/tests/test_mercadopago.mjs
import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import worker from '../worker.js';
import {lerRef, montarRef, vencimento} from '../mercadopago.mjs';

const store = new Map();
const kv = {
  get: async k => store.has(k) ? store.get(k) : null,
  put: async (k, v) => { store.set(k, v); },
  delete: async k => { store.delete(k); },
  list: async ({prefix = ''} = {}) => ({keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete: true})
};
const env = {TELEGRAM_TOKEN: '123:TEST', SYNC_KEY: 'chave-de-teste-1234567890', BB: kv, MP_ACCESS_TOKEN: 'APP_USR-teste', MP_WEBHOOK_SECRET: 'segredo-do-webhook'};
const tasks = [];
const ctx = {waitUntil: p => tasks.push(p)};

const sent = [];
const mpCalls = [];
let pagamento = null; // o que GET /v1/payments/<id> devolve
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('api.telegram.org')) {
    const method = url.split('/').pop();
    if (method === 'getMe') return Response.json({ok: true, result: {username: 'barna_test_bot'}});
    if (method === 'sendMessage') sent.push(JSON.parse(init.body));
    return Response.json({ok: true, result: {message_id: 1}});
  }
  if (url === 'https://api.mercadopago.com/v1/payments' && init && init.method === 'POST') {
    mpCalls.push({headers: init.headers, body: JSON.parse(init.body)});
    return Response.json({id: 777, status: 'pending', point_of_interaction: {transaction_data: {qr_code: '00020126PIXCOPIAECOLA', ticket_url: 'https://mp/ticket'}}}, {status: 201});
  }
  if (url.startsWith('https://api.mercadopago.com/v1/payments/')) return pagamento ? Response.json(pagamento) : new Response('{}', {status: 404});
  return Response.json({ok: true, result: {}});
};

const call = async (path, method, headers, body) => {
  const res = await worker.fetch(new Request('https://x.workers.dev' + path, {method, headers: {'Content-Type': 'application/json', ...headers}, body: body ? JSON.stringify(body) : undefined}), env, ctx);
  await Promise.all(tasks.splice(0));
  return {status: res.status, body: await res.json().catch(() => ({}))};
};
const secret = createHash('sha256').update('barnabank:123:TEST').digest('hex').slice(0, 40);
let upd = 1;
const tgUpdate = async (update) => {
  sent.length = 0;
  const res = await worker.fetch(new Request('https://x.workers.dev/tg/' + secret, {
    method: 'POST', headers: {'X-Telegram-Bot-Api-Secret-Token': secret, 'Content-Type': 'application/json'}, body: JSON.stringify({update_id: upd++, ...update})
  }), env, ctx);
  await Promise.all(tasks.splice(0));
  assert.equal(res.status, 200);
  return sent;
};
const assinar = (id, requestId, ts = '1700000000') => 'ts=' + ts + ',v1=' + createHmac('sha256', env.MP_WEBHOOK_SECRET).update('id:' + String(id).toLowerCase() + ';request-id:' + requestId + ';ts:' + ts + ';').digest('hex');
const aviso = (id, assinatura, requestId = 'req-1') => call('/mp?data.id=' + id + '&type=payment', 'POST', {'x-signature': assinatura, 'x-request-id': requestId}, {type: 'payment', data: {id: String(id)}});

// ---- funções puras
assert.deepEqual(lerRef('bb:-:ana'), {uid: '', key: 'ana'});
assert.deepEqual(lerRef(montarRef('u-1', 'ana:x')), {uid: 'u-1', key: 'ana:x'});
assert.equal(lerRef('outra-coisa'), null);
assert.equal(vencimento(new Date('2026-11-06T15:00:00Z'), 48), '2026-11-08T12:00:00.000-03:00');

// ---- dados: conta antiga (sem prefixo), dona já vinculada
const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
store.set('owner', '111');
store.set('origin', 'https://x.workers.dev');
const snap = {app: 'BarnaBank', version: 2, contacts: {}, wallets: [], transactions: [], shares: {},
  debts: [{id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, rate: 0, installments: 1, days: 30, date: today, dueDay: 1, payments: [], notes: ''}]};
assert.equal((await call('/api/state', 'PUT', {Authorization: 'Bearer ' + env.SYNC_KEY}, {snapshot: snap})).body.ok, true);
const key = JSON.parse(store.get('summary')).charges[0].key;

// ---- /cobrar mostra o botão do Pix só quando o recurso está ligado
let out = await tgUpdate({message: {message_id: 1, chat: {id: 111}, from: {first_name: 'T'}, text: '/cobrar Ana'}});
const botoes = out.flatMap(m => (m.reply_markup && m.reply_markup.inline_keyboard || []).flat()).map(b => b.callback_data).filter(Boolean);
assert.ok(botoes.includes('pix:' + key), 'botão do Pix aparece: ' + JSON.stringify(botoes));

// ---- gerar o Pix: valor da parcela, referência e aviso apontando para /mp
out = await tgUpdate({callback_query: {id: 'cb1', data: 'pix:' + key, from: {id: 111}, message: {message_id: 5, chat: {id: 111}}}});
assert.equal(mpCalls.length, 1);
assert.equal(mpCalls[0].body.transaction_amount, 100);
assert.equal(mpCalls[0].body.payment_method_id, 'pix');
assert.equal(mpCalls[0].body.external_reference, 'bb:-:' + key);
assert.equal(mpCalls[0].body.notification_url, 'https://x.workers.dev/mp');
assert.match(mpCalls[0].headers.Authorization, /^Bearer APP_USR-teste$/);
assert.ok(mpCalls[0].headers['X-Idempotency-Key'].includes('100.00'));
const msgPix = out.map(m => m.text).join('\n');
assert.match(msgPix, /00020126PIXCOPIAECOLA/);
assert.match(msgPix, /R\$ 100,00/);

// ---- aviso sem assinatura ou com assinatura errada: recusado, nada muda
assert.equal((await call('/mp?data.id=777', 'POST', {}, {type: 'payment', data: {id: '777'}})).status, 403);
assert.equal((await aviso(777, 'ts=1700000000,v1=' + '0'.repeat(64))).status, 403);
assert.equal(JSON.parse(store.get('snapshot')).debts[0].payments.length, 0);

// ---- pagamento ainda pendente: ignora
pagamento = {id: 777, status: 'pending', transaction_amount: 100, external_reference: 'bb:-:' + key};
let r = await aviso(777, assinar(777, 'req-1'));
assert.equal(r.status, 200);
assert.equal(r.body.ignored, 'pending');
assert.equal(JSON.parse(store.get('snapshot')).debts[0].payments.length, 0);

// ---- aprovado: dá baixa na dívida e avisa a dona no Telegram
pagamento = {id: 777, status: 'approved', transaction_amount: 100, external_reference: 'bb:-:' + key};
sent.length = 0;
r = await aviso(777, assinar(777, 'req-2'), 'req-2');
assert.equal(r.status, 200);
const dep = JSON.parse(store.get('snapshot')).debts[0];
assert.equal(dep.payments.length, 1);
assert.equal(dep.payments[0].amount, 100);
assert.ok(sent.some(m => String(m.chat_id) === '111' && /Recebido/.test(m.text)), 'avisou no Telegram: ' + JSON.stringify(sent.map(m => m.text)));

// ---- o Mercado Pago repete o aviso: não dá baixa duas vezes
r = await aviso(777, assinar(777, 'req-3'), 'req-3');
assert.equal(r.body.duplicate, true);
assert.equal(JSON.parse(store.get('snapshot')).debts[0].payments.length, 1);

// ---- referência que não é nossa: ignora
pagamento = {id: 888, status: 'approved', transaction_amount: 10, external_reference: 'de-outro-sistema'};
r = await aviso(888, assinar(888, 'req-4'), 'req-4');
assert.equal(r.body.ignored, 'sem referência');

// ---- recurso desligado (sem segredos): sem botão e o /mp recusa
const ligado = {t: env.MP_ACCESS_TOKEN, s: env.MP_WEBHOOK_SECRET};
delete env.MP_ACCESS_TOKEN; delete env.MP_WEBHOOK_SECRET;
assert.equal((await aviso(999, 'ts=1,v1=aa')).status, 403);
out = await tgUpdate({message: {message_id: 2, chat: {id: 111}, from: {first_name: 'T'}, text: '/cobrar Ana'}});
assert.ok(!out.flatMap(m => (m.reply_markup && m.reply_markup.inline_keyboard || []).flat()).some(b => /^pix:/.test(b.callback_data || '')), 'sem botão quando desligado');
env.MP_ACCESS_TOKEN = ligado.t; env.MP_WEBHOOK_SECRET = ligado.s;

console.log('ok test_mercadopago');
