// Conta Mercado Pago: saldo e caixinhas estimados pelas movimentações. Formatos copiados de respostas reais da API.
// Uso: node bot/tests/test_mpconta.mjs
import assert from 'node:assert/strict';
import {efeito, estadoNovo, aplicar, rendimento, visao, descobrirCaixinhas, lerCdi} from '../mpconta.mjs';

const ME = 1000;
const DG = 'b9b9156a-4fa7-495b-9d8d-7c3230cba756'; // recebe R$ 3 a cada gasto
const EM = '58c6a5ff-df90-46e4-b716-2a7530119379'; // recebe R$ 2 a cada gasto
let n = 0;
const pag = (o) => ({id: ++n, status: 'approved', date_created: '2026-11-07T10:00:00.000-04:00', date_approved: '2026-11-07T10:00:00.000-04:00', transaction_amount: 10, collector_id: 999, payment_type_id: 'bank_transfer', operation_type: 'money_transfer', ...o});
const pot = (id, resto, valor, quando) => pag({operation_type: 'partition_transfer', payment_type_id: 'account_money', collector_id: ME, transaction_amount: valor, external_reference: 'POTS3_' + id + '_' + (++n) + 'Xy' + '_' + resto, date_approved: quando, date_created: quando});

// ---- classificação
assert.deepEqual(efeito(pag({transaction_amount: 530}), ME), {b: -530, tipo: 'saida', label: 'Pix enviado'});
assert.equal(efeito(pag({collector_id: ME, operation_type: 'regular_payment', transaction_amount: 100, transaction_details: {net_received_amount: 99.01}}), ME).b, 99.01, 'recebido entra líquido');
assert.equal(efeito(pag({collector_id: ME, operation_type: 'regular_payment', transaction_amount: 50}), ME).b, 50);
assert.equal(efeito(pag({operation_type: 'regular_payment', payment_type_id: 'credit_card'}), ME), null, 'cartão de crédito de fora não mexe na conta');
assert.equal(efeito(pag({operation_type: 'regular_payment', payment_type_id: 'debit_card'}), ME).b, -10);
assert.equal(efeito(pag({status: 'refunded'}), ME), null);
assert.equal(efeito(pag({status: 'cancelled'}), ME), null);
assert.equal(efeito(pag({transaction_amount: 0, operation_type: 'card_validation'}), ME), null);
assert.equal(efeito(pag({operation_type: 'account_fund', collector_id: ME, payment_type_id: 'credit_card', transaction_amount: 14.14}), ME).b, 14.14);
assert.ok(efeito(pag({operation_type: 'money_exchange', collector_id: ME}), ME).ignorar);
const g3 = efeito(pot(DG, '0_2', 3), ME);
assert.deepEqual([g3.b, g3.pot, g3.tipo], [-3, {id: DG, v: 3}, 'guardar'], 'guardar ao pagar: sai da conta, entra na caixinha');
const fund = efeito(pot(DG, 'fund_manual', 2000), ME);
assert.deepEqual([fund.b, fund.pot.v, fund.tipo], [-2000, 2000, 'guardado']);
const tira = efeito(pot(DG, 'withdraw_manual', 2000), ME);
assert.deepEqual([tira.b, tira.pot.v, tira.tipo], [2000, -2000, 'resgate']);
assert.equal(efeito(pot(DG, '1_0', 40), ME).b, 40, '1_0 = tirou da caixinha');
assert.equal(efeito(pot(DG, '0_0', 50), ME).b, -50, '0_0 = guardou');
assert.ok(efeito(pot(DG, 'novo', 5), ME).ignorar, 'formato desconhecido não mexe no saldo');
assert.ok(efeito(pag({operation_type: 'partition_transfer', collector_id: ME, external_reference: 'xyz'}), ME).ignorar);

// ---- ponto de partida + movimentações novas
const agora = new Date('2026-11-07T14:00:00Z'); // 10h em Brasília (-04:00 na API)
const st = estadoNovo({agora, hoje: '2026-11-07', saldo: 100, pots: {[DG]: {name: 'Deutschland', valor: 50, pct: 120}, [EM]: {name: 'Emergências', valor: 30, pct: 120}}});
const antes = pag({transaction_amount: 999, date_approved: '2026-11-07T09:00:00.000-04:00', date_created: '2026-11-07T09:00:00.000-04:00'}); // 13h UTC: antes da âncora (14h UTC)
const saida = pag({transaction_amount: 40, date_approved: '2026-11-07T10:30:00.000-04:00', date_created: '2026-11-07T10:30:00.000-04:00'}); // 14h30 UTC
const g = pot(DG, '0_2', 3, '2026-11-07T10:30:01.000-04:00');
const e = pot(EM, '0_2', 2, '2026-11-07T10:30:01.000-04:00');
const entrada = pag({collector_id: ME, operation_type: 'regular_payment', transaction_amount: 25, date_approved: '2026-11-07T11:00:00.000-04:00', date_created: '2026-11-07T11:00:00.000-04:00'});
aplicar(st, [antes, saida, g, e, entrada], ME);
assert.equal(st.saldo, 100 - 40 - 3 - 2 + 25, 'saldo: saída, guardados e entrada');
assert.equal(st.pots[DG].valor, 53);
assert.equal(st.pots[EM].valor, 32);
assert.equal(st.movs.length, 4, 'o que veio antes da âncora não conta');

// o mesmo pagamento duas vezes não duplica
aplicar(st, [saida, g, e, entrada], ME);
assert.equal(st.saldo, 80);
assert.equal(st.pots[DG].valor, 53);

// estorno depois: só a diferença volta
aplicar(st, [{...saida, status: 'refunded'}], ME);
assert.equal(st.saldo, 120, 'pagamento estornado devolve o valor');
aplicar(st, [{...saida, status: 'refunded'}], ME);
assert.equal(st.saldo, 120, 'estorno repetido não devolve de novo');

// caixinha nova que o estado não conhecia aparece com nome provisório
const nova = pot('d033f47f-330d-45a6-8890-3d429a2702bf', '0_0', 20, '2026-11-07T12:00:00.000-04:00');
aplicar(st, [nova], ME);
assert.equal(st.pots['d033f47f-330d-45a6-8890-3d429a2702bf'].valor, 20);
assert.equal(st.pots['d033f47f-330d-45a6-8890-3d429a2702bf'].name, 'Caixinha d033');

// ---- rendimento: 120% do CDI nos dias úteis depois da última vez
const r = estadoNovo({agora, hoje: '2026-11-07', saldo: 0, pots: {[DG]: {name: 'D', valor: 1000, pct: 120}}});
rendimento(r, [{date: '2026-11-06', pct: 0.05}, {date: '2026-11-07', pct: 0.05}, {date: '2026-11-10', pct: 0.05}, {date: '2026-11-11', pct: 0.05}]);
const esperado = 1000 * (1 + 1.2 * 0.05 / 100) ** 2; // só 10 e 11: 06 e 07 não entram (já estavam no ponto de partida)
assert.ok(Math.abs(r.pots[DG].valor - esperado) < 0.01, 'rende só depois do ponto de partida: ' + r.pots[DG].valor);
assert.equal(r.yieldDate, '2026-11-11');
rendimento(r, [{date: '2026-11-11', pct: 0.05}]);
assert.ok(Math.abs(r.pots[DG].valor - esperado) < 0.01, 'o mesmo dia não rende duas vezes');
const s0 = estadoNovo({agora, hoje: '2026-11-07', saldo: 100, saldoPct: 0, pots: {}});
rendimento(s0, [{date: '2026-11-10', pct: 0.05}]);
assert.equal(s0.saldo, 100, 'saldo da conta só rende se o dono ligar');

// ---- CDI do Banco Central
assert.deepEqual(lerCdi([{data: '10/11/2026', valor: '0.055131'}, {data: 'x', valor: '1'}, {data: '11/11/2026', valor: 'abc'}]), [{date: '2026-11-10', pct: 0.055131}]);

// ---- descoberta das caixinhas no histórico
const hist = [pot(DG, '0_2', 3, '2026-11-06T10:00:00.000-04:00'), pot(DG, '0_2', 3, '2026-11-06T12:00:00.000-04:00'), pot(DG, 'fund_manual', 2000, '2026-02-06T10:00:00.000-04:00'), pot(EM, '0_2', 2, '2026-11-06T12:00:00.000-04:00')];
const d = descobrirCaixinhas(hist);
assert.equal(d.find(x => x.id === DG).porGasto, 3);
assert.equal(d.find(x => x.id === EM).porGasto, 2);

// ---- visão para o app
const v = visao(st);
assert.equal(v.configured, true);
assert.equal(v.total, Math.round((v.saldo + v.pots.reduce((s, p) => s + p.valor, 0)) * 100) / 100);
assert.ok(!('seen' in v));

console.log('mpconta ok');
