// Preferências dos lembretes: o app lê e grava (/api/prefs) e o cron só avisa na hora escolhida.
// Uso: node bot/tests/test_prefs.mjs
import assert from 'node:assert/strict';
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
    return id ? Response.json({id, email: 'x@x.com'}) : new Response('{}', {status: 401});
  }
  if (url.includes('api.telegram.org')) {
    if (url.endsWith('/sendMessage')) sent.push(JSON.parse(init.body));
    return Response.json({ok: true, result: {username: 'barna_test_bot', message_id: 1}});
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

// sem login: nada
assert.equal((await call('/api/prefs', 'GET', null)).status, 401);
assert.equal((await call('/api/prefs', 'GET', 'x.y.z')).status, 401);

// padrão: tudo ligado, 9h, resumo no domingo
const def = (await call('/api/prefs', 'GET', 'a.a.a')).body;
assert.deepEqual(def.prefs, {daily: true, weekly: true, monthly: true, friends: true, hour: 9, weekday: 0});
assert.equal(def.linked, false);

// valores inválidos são recusados e nada muda
for (const bad of [{hour: 24}, {hour: -1}, {hour: 8.5}, {hour: '8'}, {weekday: 7}, {daily: 'sim'}, {friends: 1}]) {
  assert.equal((await call('/api/prefs', 'PUT', 'a.a.a', bad)).status, 400, JSON.stringify(bad));
}
assert.deepEqual((await call('/api/prefs', 'GET', 'a.a.a')).body.prefs, def.prefs);

// grava só o que veio e guarda por conta
const put = await call('/api/prefs', 'PUT', 'a.a.a', {hour: 7, weekday: 5, monthly: false});
assert.equal(put.status, 200);
assert.deepEqual(put.body.prefs, {daily: true, weekly: true, monthly: false, friends: true, hour: 7, weekday: 5});
assert.deepEqual((await call('/api/prefs', 'GET', 'b.b.b')).body.prefs, def.prefs, 'a outra conta não muda');
assert.ok(store.has('u:' + UID_A + ':prefs'));
assert.equal(store.has('prefs'), false);

// o bot antigo (SYNC_KEY) também tem as suas
assert.equal((await call('/api/prefs', 'PUT', env.SYNC_KEY, {hour: 20})).body.prefs.hour, 20);
assert.ok(store.has('prefs'));

// cron de hora em hora: o lembrete só sai na hora escolhida
const today = '2026-10-21'; // o dia fixo que o relógio de mentira usa abaixo
store.set('u:' + UID_A + ':owner', '111');
store.set('acct:' + UID_A, JSON.stringify({chat: '111'}));
store.set('u:' + UID_A + ':summary', JSON.stringify({due: [{title: 'Aluguel', date: today, dir: 'out', amount: 100}]}));
const realNow = Date.now;
const atHourBR = h => { Date.now = () => Date.UTC(2026, 9, 21, h + 3, 5, 0); };
const reminded = async h => {
  sent.length = 0;
  atHourBR(h);
  await worker.scheduled({}, env, ctx);
  await Promise.all(tasks.splice(0));
  return sent.some(m => String(m.chat_id) === '111' && /Bom dia/.test(m.text));
};
assert.equal(await reminded(9), false, 'não é a hora escolhida (7h)');
assert.equal(await reminded(8), false);
assert.equal(await reminded(7), true, 'na hora escolhida');
await call('/api/prefs', 'PUT', 'a.a.a', {daily: false});
assert.equal(await reminded(7), false, 'diário desligado');
await call('/api/prefs', 'PUT', 'a.a.a', {daily: true, hour: 9});
assert.equal(await reminded(9), true, 'padrão: 9h');
Date.now = realNow;

console.log('ok test_prefs');
