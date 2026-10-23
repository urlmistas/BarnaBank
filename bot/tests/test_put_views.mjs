// O app novo manda só o snapshot no PUT /api/state: o worker precisa recalcular resumo e links
// com o motor, sem subir a versão (rev) por causa disso.
// Uso: node bot/tests/test_put_views.mjs
import assert from 'node:assert/strict';
import worker from '../worker.js';

const store = new Map();
const KEY = 'chave-de-teste-1234567890';
const env = {
  TELEGRAM_TOKEN: '123:TEST', SYNC_KEY: KEY,
  BB: { get: async k => store.has(k) ? store.get(k) : null, put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } }
};
const tasks = [];
const ctx = {waitUntil: p => tasks.push(p)};
globalThis.fetch = async () => new Response(JSON.stringify({ok: true, result: {}}), {headers: {'Content-Type': 'application/json'}});

const T = 'A'.repeat(22);
const today = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const snapshot = {
  app: 'BarnaBank', version: 2,
  debts: [{id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, rate: 0, installments: 1, days: 30, date: today, dueDay: 1, payments: [], notes: ''}],
  contacts: {}, wallets: [], transactions: [],
  shares: {[T]: {type: 'person', ref: 'ana'}}
};

const put = async body => {
  const res = await worker.fetch(new Request('https://x.workers.dev/api/state', {
    method: 'PUT', headers: {Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(body)
  }), env, ctx);
  await Promise.all(tasks.splice(0));
  return res.json();
};

const first = await put({snapshot});
assert.equal(first.ok, true);
const summary = JSON.parse(store.get('summary') || 'null');
assert.ok(summary && typeof summary.today === 'string', 'resumo calculado pelo motor');
assert.ok(store.has('share:' + T), 'link calculado pelo motor');

const second = await put({snapshot});
assert.equal(second.rev, first.rev, 'mandar o mesmo snapshot não sobe a versão');

// app antigo: manda resumo e links prontos, o worker usa o que veio
store.delete('summary');
const sent = {at: new Date().toISOString(), today, balance: 1, wallets: [], people: [], stats: {}, alerts: [], late: []};
await put({snapshot, summary: sent, shares: {}});
assert.equal(JSON.parse(store.get('summary')).balance, 1, 'resumo enviado pelo app é mantido');
console.log('ok test_put_views');
