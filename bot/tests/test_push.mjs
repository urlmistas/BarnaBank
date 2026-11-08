// Web Push: criptografia (RFC 8291), assinatura VAPID e envio. Decifra do lado do "navegador" para provar o formato.
// Uso: node bot/tests/test_push.mjs
import assert from 'node:assert/strict';
import {gerarVapid, cabecalhoVapid, cifrar, enviarPush, inscricaoValida, b64u, unb64u} from '../push.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const hkdf = async (ikm, salt, info, n) => new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));

// "navegador": par de chaves + segredo de autenticação
const ua = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = {endpoint: 'https://push.example.com/send/abc', keys: {p256dh: b64u(uaPub), auth: b64u(authSecret)}};

// decifra como o navegador faria
async function decifrar(body) {
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20];
  assert.equal(rs, 4096);
  const asPub = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: asKey}, ua.privateKey, 256));
  const ikm = await hkdf(shared, authSecret, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce}, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  assert.equal(plain[plain.length - 1], 2, 'delimitador do último bloco');
  return dec.decode(plain.slice(0, -1));
}

// 1) cifra e decifra, com acento
const texto = JSON.stringify({title: 'Pix recebido', body: 'R$ 50,00 — Vini ✓'});
assert.equal(await decifrar(await cifrar(texto, sub)), texto);
// cada envio usa sal e chave novos
const a = await cifrar('x', sub), b = await cifrar('x', sub);
assert.notDeepEqual(a, b);

// 2) VAPID: JWT com aud do endpoint, validade < 24h e assinatura que confere com a chave pública
const vapid = await gerarVapid();
assert.equal(unb64u(vapid.pub).length, 65);
const h = await cabecalhoVapid(vapid, sub.endpoint, 'https://exemplo.test/', 1_700_000_000_000);
const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
assert.ok(m, 'formato do cabeçalho');
const claims = JSON.parse(dec.decode(unb64u(m[2])));
assert.equal(claims.aud, 'https://push.example.com');
assert.equal(claims.sub, 'https://exemplo.test/');
assert.equal(claims.exp, 1_700_000_000 + 12 * 3600);
const pubKey = await crypto.subtle.importKey('raw', unb64u(m[4]), {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']);
assert.ok(await crypto.subtle.verify({name: 'ECDSA', hash: 'SHA-256'}, pubKey, unb64u(m[3]), enc.encode(m[1] + '.' + m[2])), 'assinatura válida');

// 3) envio: cabeçalhos certos, corpo decifrável; 410 = inscrição morta
let seen;
const ok = await enviarPush(async (url, init) => { seen = {url, init}; return new Response(null, {status: 201}); }, vapid, sub, {title: 'Oi', body: 'corpo'}, {subject: 'https://exemplo.test/'});
assert.deepEqual(ok, {ok: true, status: 201, gone: false});
assert.equal(seen.url, sub.endpoint);
assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
assert.equal(JSON.parse(await decifrar(seen.init.body)).title, 'Oi');
assert.equal((await enviarPush(async () => new Response(null, {status: 410}), vapid, sub, {})).gone, true);
assert.equal((await enviarPush(async () => new Response(null, {status: 500}), vapid, sub, {})).gone, false);
assert.equal((await enviarPush(async () => { throw new Error('rede'); }, vapid, sub, {})).ok, false);

// 4) validação da inscrição
assert.ok(inscricaoValida(sub));
assert.ok(!inscricaoValida({...sub, endpoint: 'http://push.example.com/x'}));
assert.ok(!inscricaoValida({endpoint: sub.endpoint, keys: {p256dh: 'abc', auth: 'abc'}}));
assert.ok(!inscricaoValida(null));

console.log('push: ok');
