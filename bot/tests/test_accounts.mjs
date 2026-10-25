// Várias contas no mesmo bot: vínculo por código, dados separados e chat desconhecido.
// Uso: node bot/tests/test_accounts.mjs
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../worker.js';

const store = new Map();
const kv = {
  get: async k => store.has(k) ? store.get(k) : null,
  put: async (k, v) => { store.set(k, v); },
  delete: async k => { store.delete(k); },
  list: async ({prefix = ''} = {}) => ({keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete: true})
};
const env = {TELEGRAM_TOKEN: '123:TEST', SYNC_KEY: 'chave-de-teste-1234567890', SB_URL: 'https://sb.test', SB_KEY: 'pub', BB: kv};
const tasks = [];
const ctx = {waitUntil: p => tasks.push(p)};

const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';
const users = {'a.a.a': UID_A, 'b.b.b': UID_B};
const sent = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url === 'https://sb.test/auth/v1/user') {
    const id = users[String(init.headers.Authorization).replace('Bearer ', '')];
    return id ? Response.json({id, email: id.slice(0, 2) + '@x.com'}) : new Response('{}', {status: 401});
  }
  if (url.includes('api.telegram.org')) {
    const method = url.split('/').pop();
    if (method === 'getMe') return Response.json({ok: true, result: {username: 'barna_test_bot'}});
    if (method === 'sendMessage') sent.push(JSON.parse(init.body));
    return Response.json({ok: true, result: {message_id: 1}});
  }
  return Response.json({ok: true, result: {}});
};

const call = async (path, method, token, body) => {
  const res = await worker.fetch(new Request('https://x.workers.dev' + path, {
    method, headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined
  }), env, ctx);
  await Promise.all(tasks.splice(0));
  return {status: res.status, body: await res.json().catch(() => ({}))};
};
const secret = createHash('sha256').update('barnabank:123:TEST').digest('hex').slice(0, 40);
let upd = 1;
const say = async (chat, text) => {
  sent.length = 0;
  const res = await worker.fetch(new Request('https://x.workers.dev/tg/' + secret, {
    method: 'POST', headers: {'X-Telegram-Bot-Api-Secret-Token': secret, 'Content-Type': 'application/json'},
    body: JSON.stringify({update_id: upd++, message: {message_id: upd, chat: {id: chat}, from: {first_name: 'T'}, text}})
  }), env, ctx);
  await Promise.all(tasks.splice(0));
  assert.equal(res.status, 200);
  return sent.filter(m => String(m.chat_id) === String(chat)).map(m => m.text).join('\n');
};

const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const snap = name => ({
  app: 'BarnaBank', version: 2, contacts: {}, wallets: [], transactions: [], shares: {},
  debts: [{id: 'd1', name, kind: 'receivable', principal: 100, rate: 0, installments: 1, days: 30, date: today, dueDay: 1, payments: [], notes: ''}]
});

// sem login ou com token inválido: nada
assert.equal((await call('/api/link', 'POST', null)).status, 401);
assert.equal((await call('/api/link', 'POST', 'x.y.z')).status, 401);
assert.equal((await call('/api/state', 'GET', 'x.y.z')).status, 401);

// A pede o código
const a = await call('/api/link', 'POST', 'a.a.a');
assert.equal(a.status, 200);
assert.match(a.body.code, /^[A-HJ-NP-Z2-9]{8}$/);
assert.equal(a.body.url, 'https://t.me/barna_test_bot?start=BB' + a.body.code);
assert.equal((await call('/api/link', 'GET', 'a.a.a')).body.linked, false);

// chat desconhecido recebe a orientação e não vira dono
assert.match(await say(999, '/start'), /vincule sua conta/);
assert.match(await say(999, 'Vini me deve 50'), /vincule sua conta/);
assert.equal(store.has('owner'), false, 'não vira dono do bot antigo');

// código errado com formato explícito
assert.match(await say(111, '/vincular ZZZZ2222'), /não vale mais/);

// A vincula pelo link (/start BB<código>)
assert.match(await say(111, '/start BB' + a.body.code), /Conta vinculada/);
assert.equal(store.get('u:' + UID_A + ':owner'), '111');
assert.equal(store.has('link:' + a.body.code), false, 'código é de uso único');
assert.equal((await call('/api/link', 'GET', 'a.a.a')).body.linked, true);
assert.match(await say(111, '/start BB' + a.body.code), /não vale mais/, 'não dá para reusar');

// B vincula mandando só o código
const b = await call('/api/link', 'POST', 'b.b.b');
assert.match(await say(222, b.body.code), /Conta vinculada/);
assert.equal(store.get('u:' + UID_B + ':owner'), '222');

// dados separados por conta
assert.equal((await call('/api/state', 'PUT', 'a.a.a', {snapshot: snap('Ana')})).body.ok, true);
assert.equal((await call('/api/state', 'PUT', 'b.b.b', {snapshot: snap('Beto')})).body.ok, true);
const ga = (await call('/api/state', 'GET', 'a.a.a')).body, gb = (await call('/api/state', 'GET', 'b.b.b')).body;
assert.equal(ga.snapshot.debts[0].name, 'Ana');
assert.equal(gb.snapshot.debts[0].name, 'Beto');
assert.equal(store.has('snapshot'), false, 'nada gravado sem prefixo');

// o que chega pelo Telegram entra só na conta do chat
assert.match(await say(111, 'Vini me deve 50'), /Vini/);
const sa = JSON.parse(store.get('u:' + UID_A + ':snapshot')), sb = JSON.parse(store.get('u:' + UID_B + ':snapshot'));
assert.ok(sa.debts.some(d => d.name === 'Vini'), 'A recebeu a dívida do Vini');
assert.ok(!sb.debts.some(d => d.name === 'Vini'), 'B não recebeu');

// cron diário passa por todas as contas sem derrubar uma por causa da outra
await worker.scheduled({}, env, ctx);
assert.equal(store.has('u:' + UID_A + ':lastError'), false, JSON.stringify(store.get('u:' + UID_A + ':lastError')));

// desvincular
assert.equal((await call('/api/link', 'DELETE', 'a.a.a')).body.ok, true);
assert.equal((await call('/api/link', 'GET', 'a.a.a')).body.linked, false);
assert.match(await say(111, 'Vini me deve 50'), /vincule sua conta/);
assert.ok(store.has('u:' + UID_A + ':snapshot'), 'os dados continuam na nuvem');

// o bot antigo (SYNC_KEY) segue funcionando, sem prefixo
assert.equal((await call('/api/state', 'PUT', env.SYNC_KEY, {snapshot: snap('Legado')})).body.ok, true);
assert.ok(store.has('snapshot'));

console.log('ok test_accounts');
