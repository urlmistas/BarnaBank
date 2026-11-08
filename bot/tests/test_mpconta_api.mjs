// Rota /api/mpconta: só o dono vê, ponto de partida, movimentações novas e rendimento do CDI.
// Uso: node bot/tests/test_mpconta_api.mjs
import assert from 'node:assert/strict';
import worker from '../worker.js';

const store = new Map();
const kv = {
  get: async k => store.has(k) ? store.get(k) : null,
  put: async (k, v) => { store.set(k, v); },
  delete: async k => { store.delete(k); },
  list: async ({prefix = ''} = {}) => ({keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete: true})
};
const FAKE = 'segredo-falso-de-teste';
const env = {TELEGRAM_TOKEN: '123:TEST', SYNC_KEY: 'chave-de-teste-1234567890', SB_URL: 'https://sb.test', SB_KEY: 'pub', MP_ACCESS_TOKEN: FAKE, BB: kv};
const ctx = {waitUntil: () => {}};
const UID_A = '11111111-1111-4111-8111-111111111111';
const UID_B = '22222222-2222-4222-8222-222222222222';
const users = {'a.a.a': UID_A, 'b.b.b': UID_B};
const ME = 4242;
const DG = 'b9b9156a-4fa7-495b-9d8d-7c3230cba756';
const EM = '58c6a5ff-df90-46e4-b716-2a7530119379';

let pagamentos = [];
let cdi = [];
let mpFora = false;
const enviadas = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url === 'https://sb.test/auth/v1/user') {
    const id = users[String(init.headers.Authorization).replace('Bearer ', '')];
    return id ? Response.json({id, email: 'x@x.com'}) : new Response('{}', {status: 401});
  }
  if (url.startsWith('https://api.mercadopago.com/')) {
    assert.equal(init.headers.Authorization, 'Bearer ' + FAKE);
    if (url.includes('/users/me')) return Response.json({id: ME});
    if (mpFora) return new Response('{}', {status: 500});
    return Response.json({paging: {total: pagamentos.length}, results: pagamentos});
  }
  if (url.startsWith('https://api.bcb.gov.br/')) return Response.json(cdi);
  if (url.includes('api.telegram.org') && url.endsWith('/sendMessage')) enviadas.push(JSON.parse(init.body));
  return Response.json({ok: true, result: {message_id: 1}});
};
const call = async (method, token, body) => {
  const res = await worker.fetch(new Request('https://x.workers.dev/api/mpconta', {method, headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined}), env, ctx);
  return {status: res.status, body: await res.json()};
};
let n = 0;
const pot = (id, resto, valor, quando) => ({id: ++n, status: 'approved', operation_type: 'partition_transfer', payment_type_id: 'account_money', collector_id: ME, transaction_amount: valor, external_reference: 'POTS3_' + id + '_x' + n + '_' + resto, date_created: quando, date_approved: quando});
const saida = (valor, quando) => ({id: ++n, status: 'approved', operation_type: 'money_transfer', payment_type_id: 'bank_transfer', collector_id: 999, transaction_amount: valor, date_created: quando, date_approved: quando});

// sem login
assert.equal((await call('GET')).status, 401);
// ninguém configurou ainda: GET não mostra nada (nem para quem está logado)
assert.deepEqual((await call('GET', 'a.a.a')).body, {configured: false});
// salvar sem descobrir antes não vale (ainda não há dono)
assert.equal((await call('POST', 'a.a.a', {saldo: 1, pots: {}})).status, 409);

// histórico antigo: o dono "descobre" os porquinhos e a primeira conta que pedir vira a dona
pagamentos = [pot(DG, '0_2', 3, '2026-11-01T10:00:00.000-04:00'), pot(EM, '0_2', 2, '2026-11-01T10:00:00.000-04:00')];
const desc = await call('POST', 'a.a.a', {acao: 'descobrir'});
assert.equal(desc.status, 200);
assert.deepEqual(desc.body.pots.map(p => [p.id, p.porGasto]).sort(), [[DG, 3], [EM, 2]].sort());
// outra conta: barrada
assert.equal((await call('GET', 'b.b.b')).status, 403);
assert.equal((await call('POST', 'b.b.b', {acao: 'descobrir'})).status, 403);

// valida o que vem do app
assert.equal((await call('POST', 'a.a.a', {saldo: 'x', pots: {}})).status, 400);
assert.equal((await call('POST', 'a.a.a', {saldo: 10, pots: {'nao-e-id': {valor: 1}}})).status, 400);

// ponto de partida: nada do histórico entra, só o que vier depois
const ini = await call('POST', 'a.a.a', {saldo: 100, saldoPct: 0, pots: {[DG]: {name: 'Deutschland', valor: 50, pct: 120, meta: 500}, [EM]: {name: 'Emergências', valor: 30, pct: 120}}, carteira: 'w1'});
assert.equal(ini.status, 200);
assert.equal(ini.body.carteira, 'w1');
assert.equal(ini.body.avisos, true);
assert.equal(ini.body.pots.find(p => p.id === DG).meta, 500);
assert.equal(ini.body.pots.find(p => p.id === EM).meta, 0);
assert.equal(ini.body.conferencia, null, 'primeira vez: nada para conferir');
assert.equal((await call('POST', 'a.a.a', {saldo: 1, pots: {[DG]: {valor: 1, meta: -5}}})).status, 400, 'meta negativa não vale');
// o dono já tem o Telegram vinculado: o bot avisa o que for chegando
store.set('u:' + UID_A + ':owner', '999');
assert.equal(ini.body.saldo, 100);
assert.deepEqual(ini.body.pots.map(p => [p.name, p.valor]).sort(), [['Deutschland', 50], ['Emergências', 30]]);

// uma saída com os dois guardados
const agora = new Date(Date.now() + 1000).toISOString();
pagamentos = [...pagamentos, saida(40, agora), pot(DG, '0_2', 3, agora), pot(EM, '0_2', 2, agora)];
const um = await call('GET', 'a.a.a', null);
const forcar = async () => { const s = JSON.parse(store.get('mpconta')); s.syncedAt = new Date(Date.now() - 3600000).toISOString(); store.set('mpconta', JSON.stringify(s)); };
await forcar();
const dois = await call('GET', 'a.a.a');
assert.equal(dois.body.saldo, 100 - 40 - 3 - 2);
assert.deepEqual(dois.body.pots.map(p => [p.name, p.valor]).sort(), [['Deutschland', 53], ['Emergências', 32]]);
assert.equal(dois.body.movs.length, 3);
assert.equal(dois.body.lancar.length, 1, 'só entrada e saída vão para as carteiras, o guardado não');
assert.equal(dois.body.lancar[0].sinal, -1);
const aviso = enviadas.map(m => m.text).join('|');
assert.ok(aviso.includes('Pix enviado') && aviso.includes('Deutschland') && aviso.includes('Emergências') && aviso.includes('guardar ao pagar'), 'avisou no Telegram: ' + aviso);
assert.equal(enviadas.length, 1, 'uma mensagem só por busca');
assert.equal(um.status, 200);

// buscar de novo (passou o intervalo) não duplica
await forcar();
assert.equal((await call('GET', 'a.a.a')).body.saldo, 55);

// buscar de novo não avisa de novo
await forcar();
await call('GET', 'a.a.a');
assert.equal(enviadas.length, 1, 'não repete aviso');

// conferência: informa valores reais e vê o quanto a estimativa se afastou
await new Promise(r => setTimeout(r, 1300)); // os pagamentos acima são de 1s à frente: o novo ponto de partida tem que vir depois deles
const conf = await call('POST', 'a.a.a', {saldo: 60, saldoPct: 0, avisos: false, pots: {[DG]: {name: 'Deutschland', valor: 55, pct: 120, meta: 500}, [EM]: {name: 'Emergências', valor: 32, pct: 120}}, carteira: 'w1'});
assert.equal(conf.status, 200);
assert.equal(conf.body.avisos, false);
assert.deepEqual([conf.body.conferencia.saldo.est, conf.body.conferencia.saldo.real, conf.body.conferencia.diff], [55, 60, 5]);
assert.deepEqual(conf.body.conferencia.pots.map(p => [p.name, p.est, p.real]).sort(), [['Deutschland', 53, 55], ['Emergências', 32, 32]].sort());
assert.equal(conf.body.saldo, 60, 'recomeça dos valores informados');
pagamentos = [...pagamentos, saida(10, new Date(Date.now() + 1000).toISOString())];
await forcar();
assert.equal((await call('GET', 'a.a.a')).body.saldo, 50);
assert.equal(enviadas.length, 1, 'com os avisos desligados não manda nada');

// Mercado Pago fora do ar: devolve o último estado, sem erro
await forcar();
mpFora = true;
const fora = await call('GET', 'a.a.a');
assert.equal(fora.status, 200);
assert.equal(fora.body.saldo, 50);
mpFora = false;

// cron: aplica o rendimento do CDI (120%) nos dias úteis depois do ponto de partida
const brasilia = new Date(Date.now() - 3 * 3600000);
const hoje = brasilia.toISOString().slice(0, 10);
const ontem = new Date(brasilia.getTime() - 86400000).toISOString().slice(0, 10);
const s2 = JSON.parse(store.get('mpconta')); s2.yieldDate = ontem; store.set('mpconta', JSON.stringify(s2));
cdi = [{data: hoje.slice(8, 10) + '/' + hoje.slice(5, 7) + '/' + hoje.slice(0, 4), valor: '0.05'}];
await worker.scheduled({}, env, ctx);
const dep = await call('GET', 'a.a.a');
const dg = dep.body.pots.find(p => p.name === 'Deutschland').valor;
assert.ok(Math.abs(dg - 55 * (1 + 1.2 * 0.05 / 100)) < 0.01, 'rendeu 120% do CDI: ' + dg);
assert.equal(dep.body.yieldDate, hoje);

// apagar
assert.equal((await call('DELETE', 'a.a.a')).status, 200);
assert.deepEqual((await call('GET', 'a.a.a')).body, {configured: false});

// sem token do Mercado Pago a rota fica desligada
delete env.MP_ACCESS_TOKEN;
assert.equal((await call('GET', 'a.a.a')).status, 404);

console.log('mpconta api ok');
