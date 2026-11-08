// Notificação no aparelho (Web Push): /api/push guarda a inscrição por conta, testa, apaga, e o cron manda o aviso do dia.
// Uso: node bot/tests/test_push_api.mjs
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {b64u} from '../push.mjs';

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
const pushed = [];
let pushStatus = 201;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url === 'https://sb.test/auth/v1/user') {
    const id = users[String(init.headers.Authorization).replace('Bearer ', '')];
    return id ? Response.json({id, email: 'x@x.com'}) : new Response('{}', {status: 401});
  }
  if (url.includes('api.telegram.org')) {
    if (url.endsWith('/sendMessage')) sent.push(JSON.parse(init.body));
    return Response.json({ok: true, result: {username: 'barna_test_bot', message_id: 1}});
  }
  if (url.startsWith('https://push.test/')) {
    pushed.push({url, headers: init.headers, size: init.body.length});
    return new Response(null, {status: pushStatus});
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

// uma inscrição de verdade (chaves P-256 válidas), como o navegador manda
const mkSub = async name => {
  const kp = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  return {endpoint: 'https://push.test/send/' + name, keys: {p256dh: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16)))}};
};

// sem login: nada
assert.equal((await call('/api/push', 'GET', null)).status, 401);
assert.equal((await call('/api/push', 'POST', 'x.y.z', {})).status, 401);

// a chave pública sai (65 bytes), é sempre a mesma, e a privada nunca sai
const k1 = (await call('/api/push', 'GET', 'a.a.a')).body;
assert.equal(Buffer.from(k1.key.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length, 65);
assert.equal(k1.devices, 0);
assert.equal((await call('/api/push', 'GET', 'b.b.b')).body.key, k1.key);
assert.ok(store.has('vapid'), 'o par de chaves fica no KV, sem prefixo de conta');
assert.ok(!JSON.stringify(k1).includes('"d"'), 'a chave privada não sai');

// inscrição inválida é recusada
assert.equal((await call('/api/push', 'POST', 'a.a.a', {subscription: {endpoint: 'http://push.test/x', keys: {p256dh: 'a', auth: 'b'}}})).status, 400);
assert.equal((await call('/api/push', 'POST', 'a.a.a', {})).status, 400);

// inscreve dois aparelhos na conta A; reenviar o mesmo não duplica; a conta B não vê
const s1 = await mkSub('um'), s2 = await mkSub('dois');
assert.equal((await call('/api/push', 'POST', 'a.a.a', {subscription: s1})).body.devices, 1);
assert.equal((await call('/api/push', 'POST', 'a.a.a', {subscription: s2})).body.devices, 2);
assert.equal((await call('/api/push', 'POST', 'a.a.a', {subscription: s1})).body.devices, 2);
assert.equal((await call('/api/push', 'GET', 'b.b.b')).body.devices, 0);
assert.ok(store.has('u:' + UID_A + ':push'));

// teste: sai para os dois aparelhos, com os cabeçalhos do Web Push
pushed.length = 0;
const t = await call('/api/push', 'POST', 'a.a.a', {test: true});
assert.equal(t.body.sent, 2);
assert.equal(pushed.length, 2);
assert.match(pushed[0].headers.Authorization, /^vapid t=.+, k=.+$/);
assert.equal(pushed[0].headers['Content-Encoding'], 'aes128gcm');
// a conta B não tem aparelhos: nada sai
pushed.length = 0;
assert.equal((await call('/api/push', 'POST', 'b.b.b', {test: true})).body.sent, 0);
assert.equal(pushed.length, 0);

// aparelho que o serviço de push diz que morreu (410) é apagado
pushStatus = 410;
await call('/api/push', 'POST', 'a.a.a', {test: true});
assert.equal((await call('/api/push', 'GET', 'a.a.a')).body.devices, 0);
pushStatus = 201;

// cancelar um aparelho
await call('/api/push', 'POST', 'a.a.a', {subscription: s1});
await call('/api/push', 'POST', 'a.a.a', {subscription: s2});
assert.equal((await call('/api/push', 'DELETE', 'a.a.a', {endpoint: s1.endpoint})).body.devices, 1);

// cron das 9h: o resumo do dia também vira notificação (e não quebra sem aparelho)
const today = '2026-10-21';
store.set('u:' + UID_A + ':owner', '111');
store.set('acct:' + UID_A, JSON.stringify({chat: '111'}));
store.set('u:' + UID_A + ':summary', JSON.stringify({due: [{title: 'Aluguel', date: today, dir: 'out', amount: 100}]}));
const realNow = Date.now;
Date.now = () => Date.UTC(2026, 9, 21, 9 + 3, 5, 0);
pushed.length = 0;
sent.length = 0;
const run = worker.scheduled({}, env, ctx);
await run;
await Promise.all(tasks.splice(0));
Date.now = realNow;
assert.ok(sent.some(m => /Bom dia/.test(m.text)), 'Telegram continua avisando');
assert.equal(pushed.length, 1, 'e o aparelho restante recebe a notificação');

console.log('push api: ok');
