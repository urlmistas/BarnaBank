// Conta Mercado Pago: saldo e caixinhas estimados a partir das movimentações que a API devolve.
// Funções puras e sem estado: o worker.js só busca os pagamentos, o CDI e grava o resultado.
//
// A API não entrega saldo nem rendimento. O dono informa o saldo e as caixinhas num ponto de partida (a "âncora");
// dali em diante o que entra na conta, o que sai e o que vai para as caixinhas vem dos pagamentos, e o rendimento
// vem do CDI (série 12 do Banco Central) vezes a porcentagem de cada caixinha.
//
// Como o Mercado Pago descreve cada movimentação (conferido nas respostas reais de /v1/payments/search):
//  - partition_transfer, external_reference "POTS<n>_<id da caixinha>_<código>_<resto>": dinheiro entre a conta e uma caixinha.
//    "<resto>" é "fund_manual" / "withdraw_manual" (aporte e resgate à mão) ou "<0|1>_<n>": 0 = guardou, 1 = tirou;
//    n = 2 é o "Guardar ao pagar" (os R$ 3 e R$ 2 por gasto). Os valores 0/1 foram deduzidos dos pares de dados reais;
//    se aparecer outro formato, a movimentação vai para "ignoradas" em vez de mexer no saldo.
//  - account_fund: dinheiro que entra na conta (cartão ou Pix). Entra o valor.
//  - collector_id = você e não é transferência interna: você recebeu. Entra o valor líquido (depois da tarifa).
//  - collector_id = outra pessoa, pago com saldo/Pix/débito: você pagou. Sai o valor.
//  - pago com cartão de crédito de fora: não mexe no saldo da conta.
//  - só conta o que está "approved"; cancelado, recusado e estornado valem zero (e desfazem o que já tinha entrado).

const dois = v => Math.round(Number(v) * 100) / 100;
const quatro = v => Math.round(Number(v) * 10000) / 10000;

export const POT_REF = /^POTS\d*_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(.+)$/i;

// o que um pagamento muda: {b: saldo da conta, pot: {id, v}, tipo, label} ou {ignorar: motivo} ou null (não vale nada)
export function efeito(p, me) {
  if (!p || p.id == null) return null;
  if (p.status !== 'approved') return null;
  const valor = dois(p.transaction_amount);
  if (!(valor > 0)) return null;
  const op = String(p.operation_type || '');
  const euRecebi = Number(p.collector_id) === Number(me);

  if (op === 'partition_transfer') {
    const m = POT_REF.exec(String(p.external_reference || ''));
    if (!m) return {ignorar: 'caixinha sem identificação'};
    const resto = m[2];
    const fim = /(?:^|_)(0|1)_(\d)$/.exec(resto); // ...<código>_<0|1>_<n>
    const auto = !!fim && fim[2] === '2';
    if (/(?:^|_)fund_manual$/.test(resto) || (fim && fim[1] === '0')) return {b: -valor, pot: {id: m[1].toLowerCase(), v: valor}, tipo: auto ? 'guardar' : 'guardado', label: auto ? 'Guardar ao pagar' : 'Guardado na caixinha'};
    if (/(?:^|_)withdraw_manual$/.test(resto) || (fim && fim[1] === '1')) return {b: valor, pot: {id: m[1].toLowerCase(), v: -valor}, tipo: 'resgate', label: 'Tirado da caixinha'};
    return {ignorar: 'movimento de caixinha em formato novo (' + resto + ')'};
  }
  if (op === 'account_fund') return {b: valor, tipo: 'aporte', label: 'Dinheiro colocado na conta'};
  if (op === 'money_exchange' || op === 'card_validation') return {ignorar: op};

  const tipo = String(p.payment_type_id || '');
  if (euRecebi) {
    const liquido = dois(p.transaction_details && p.transaction_details.net_received_amount);
    return {b: liquido > 0 ? liquido : valor, tipo: 'entrada', label: tipo === 'bank_transfer' ? 'Pix recebido' : 'Recebido'};
  }
  // eu paguei: cartão de crédito de fora não sai da conta
  if (tipo === 'credit_card') return null;
  return {b: -valor, tipo: 'saida', label: tipo === 'bank_transfer' ? 'Pix enviado' : tipo === 'debit_card' ? 'Compra no débito' : 'Pagamento'};
}

// instante em milissegundos (a API devolve com fuso, como -04:00; comparar texto daria errado)
const quando = p => Date.parse(p.date_approved || p.date_created || '') || 0;
const iso = ms => new Date(ms).toISOString();

export function estadoNovo({agora, hoje, saldo, saldoPct = 0, pots = {}}) {
  const ps = {};
  for (const id of Object.keys(pots)) {
    const x = pots[id] || {};
    ps[id.toLowerCase()] = {name: String(x.name || 'Caixinha').slice(0, 40), valor: dois(x.valor), pct: Math.max(0, Math.min(300, Number(x.pct) || 0))};
  }
  return {anchor: agora.toISOString(), yieldDate: hoje, saldo: dois(saldo), saldoPct: Math.max(0, Math.min(300, Number(saldoPct) || 0)), pots: ps, seen: {}, movs: [], ignoradas: [], syncedAt: null};
}

// aplica os pagamentos ao estado (mexe no objeto). Cada pagamento conta uma vez; se mudar (estorno), só a diferença entra.
export function aplicar(st, pagamentos, me) {
  const lista = (pagamentos || []).filter(p => p && p.id != null && quando(p) > Date.parse(st.anchor)).sort((a, b) => quando(a) - quando(b));
  for (const p of lista) {
    const id = String(p.id);
    const e = efeito(p, me);
    if (e && e.ignorar) {
      if (!st.ignoradas.some(x => x.id === id)) st.ignoradas = [...st.ignoradas, {id, at: iso(quando(p)), valor: dois(p.transaction_amount), motivo: e.ignorar}].slice(-30);
      continue;
    }
    const novo = e ? {b: e.b || 0, pot: e.pot ? {id: e.pot.id, v: e.pot.v} : null} : {b: 0, pot: null};
    const velho = st.seen[id] || {b: 0, pot: null};
    const db = dois(novo.b - velho.b);
    if (db) st.saldo = dois(st.saldo + db);
    const potSoma = o => o.pot ? {[o.pot.id]: o.pot.v} : {};
    const ids = new Set([...Object.keys(potSoma(novo)), ...Object.keys(potSoma(velho))]);
    for (const pid of ids) {
      const dp = dois((potSoma(novo)[pid] || 0) - (potSoma(velho)[pid] || 0));
      if (!dp) continue;
      if (!st.pots[pid]) st.pots[pid] = {name: 'Caixinha ' + pid.slice(0, 4), valor: 0, pct: 120};
      st.pots[pid].valor = dois(st.pots[pid].valor + dp);
    }
    st.seen[id] = novo;
    if (e && !st.movs.some(m => m.id === id)) st.movs = [...st.movs, {id, at: iso(quando(p)), tipo: e.tipo, label: e.label, valor: dois(Math.abs(e.b || (e.pot && e.pot.v) || 0)), sinal: (e.b || 0) > 0 ? 1 : (e.b || 0) < 0 ? -1 : 0, pot: e.pot ? e.pot.id : ''}].slice(-60);
  }
  // não deixa o registro de "já contei" crescer sem fim: guarda só os pagamentos mais recentes
  const ids = Object.keys(st.seen);
  if (ids.length > 400) for (const k of ids.slice(0, ids.length - 400)) delete st.seen[k];
  return st;
}

// rendimento: para cada dia útil do CDI depois da última vez, saldo e caixinhas crescem pct% do CDI do dia
// serie: [{date:'AAAA-MM-DD', pct: CDI do dia em %}] (ex.: 0.055131)
export function rendimento(st, serie) {
  const dias = (serie || []).filter(d => d && d.date > st.yieldDate && Number.isFinite(d.pct)).sort((a, b) => a.date < b.date ? -1 : 1);
  for (const d of dias) {
    for (const p of Object.values(st.pots)) if (p.pct > 0) p.valor = quatro(p.valor * (1 + p.pct / 100 * d.pct / 100));
    if (st.saldoPct > 0 && st.saldo > 0) st.saldo = quatro(st.saldo * (1 + st.saldoPct / 100 * d.pct / 100));
    st.yieldDate = d.date;
  }
  return st;
}

// o que o app mostra (sem o registro interno)
export function visao(st) {
  const pots = Object.entries(st.pots).map(([id, p]) => ({id, name: p.name, valor: dois(p.valor), pct: p.pct}));
  return {
    configured: true,
    saldo: dois(st.saldo), saldoPct: st.saldoPct, since: st.anchor, syncedAt: st.syncedAt, yieldDate: st.yieldDate,
    pots, total: dois(st.saldo + pots.reduce((s, p) => s + p.valor, 0)),
    movs: [...st.movs].reverse().slice(0, 30), ignoradas: st.ignoradas.slice(-10)
  };
}

// caixinhas que aparecem no histórico (para o dono dar nome e valor na primeira vez)
export function descobrirCaixinhas(pagamentos) {
  const mapa = {};
  for (const p of pagamentos || []) {
    if (!p || p.operation_type !== 'partition_transfer' || p.status !== 'approved') continue;
    const m = POT_REF.exec(String(p.external_reference || ''));
    if (!m) continue;
    const id = m[1].toLowerCase();
    const x = mapa[id] || (mapa[id] = {id, movimentos: 0, ultimo: 0, autos: {}});
    x.movimentos++;
    if (quando(p) > x.ultimo) x.ultimo = quando(p);
    if (/_0_2$/.test(m[2])) { const k = dois(p.transaction_amount); x.autos[k] = (x.autos[k] || 0) + 1; }
  }
  return Object.values(mapa).map(x => {
    const top = Object.entries(x.autos).sort((a, b) => b[1] - a[1])[0];
    return {id: x.id, movimentos: x.movimentos, ultimo: x.ultimo ? iso(x.ultimo) : '', porGasto: top ? Number(top[0]) : 0};
  }).sort((a, b) => a.ultimo < b.ultimo ? 1 : -1);
}

// série 12 do Banco Central ("dd/MM/aaaa", valor em %/dia) → [{date, pct}]
export function lerCdi(json) {
  return (Array.isArray(json) ? json : []).map(r => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r && r.data));
    return m ? {date: m[3] + '-' + m[2] + '-' + m[1], pct: Number(r.valor)} : null;
  }).filter(d => d && Number.isFinite(d.pct) && d.pct >= 0);
}
