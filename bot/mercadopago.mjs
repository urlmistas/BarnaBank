// Pix pelo Mercado Pago: criar a cobrança, conferir o aviso (webhook) e ler a referência.
// Funções puras e sem estado: o worker.js só liga isto ao Telegram e às dívidas.
// Segredos do worker (opcionais; sem eles o recurso fica desligado): MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET.

export const MP_API = 'https://api.mercadopago.com';

// "bb:<conta ou ->:<chave da pessoa>" vai em external_reference e volta no pagamento
export function montarRef(uid, key) { return 'bb:' + (uid || '-') + ':' + key; }
export function lerRef(ref) {
  const p = String(ref || '').split(':');
  if (p[0] !== 'bb' || p.length < 3 || !p[2]) return null;
  return {uid: p[1] === '-' ? '' : p[1], key: p.slice(2).join(':')};
}

// o Mercado Pago pede data com fuso: vence em `horas` horas, no horário de Brasília
export function vencimento(agora, horas) {
  const t = new Date(agora.getTime() + horas * 3600000 - 3 * 3600000);
  return t.toISOString().slice(0, 23) + '-03:00';
}

const dois = v => Math.round(Number(v) * 100) / 100;

// Pix com valor fixo. Devolve {id, qr, ticket} ou {erro}
export async function criarPix(env, {valor, descricao, ref, aviso, email, agora = new Date(), horas = 48, fetchFn = fetch}) {
  const token = String(env.MP_ACCESS_TOKEN || '').trim();
  if (!token) return {erro: 'Pix do Mercado Pago não está ligado (falta o MP_ACCESS_TOKEN).'};
  const v = dois(valor);
  if (!(v >= 0.01)) return {erro: 'Valor inválido para o Pix.'};
  const dia = new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const res = await fetchFn(MP_API + '/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      // mesmo valor, mesma pessoa, mesmo dia: devolve o mesmo Pix em vez de criar outro
      'X-Idempotency-Key': 'bb-' + ref + '-' + v.toFixed(2) + '-' + dia
    },
    body: JSON.stringify({
      transaction_amount: v,
      description: String(descricao || 'Cobrança BarnaBank').slice(0, 200),
      payment_method_id: 'pix',
      payer: {email: email || 'cobranca@barnabank.app'},
      external_reference: ref,
      notification_url: aviso,
      date_of_expiration: vencimento(agora, horas)
    })
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return {erro: 'Mercado Pago recusou (' + res.status + '): ' + String(d.message || d.error || 'sem detalhe').slice(0, 160)};
  const td = d.point_of_interaction && d.point_of_interaction.transaction_data;
  if (!td || !td.qr_code) return {erro: 'O Mercado Pago não devolveu o código Pix.'};
  return {id: String(d.id), qr: td.qr_code, ticket: td.ticket_url || '', valor: v};
}

export async function buscarPagamento(env, id, fetchFn = fetch) {
  const token = String(env.MP_ACCESS_TOKEN || '').trim();
  if (!token || !/^\d+$/.test(String(id))) return null;
  const res = await fetchFn(MP_API + '/v1/payments/' + id, {headers: {Authorization: 'Bearer ' + token}});
  if (!res.ok) return {falhou: res.status};
  return res.json();
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
// confere o x-signature do aviso: HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export async function assinaturaOk({secret, assinatura, requestId, dataId}) {
  if (!secret || !assinatura || !dataId) return false;
  const partes = {};
  for (const kv of String(assinatura).split(',')) { const i = kv.indexOf('='); if (i > 0) partes[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  if (!partes.ts || !partes.v1) return false;
  const id = /^[A-Za-z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = 'id:' + id + ';' + (requestId ? 'request-id:' + requestId + ';' : '') + 'ts:' + partes.ts + ';';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const esperado = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifesto)));
  if (esperado.length !== partes.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return diff === 0;
}
