// Web Push (notificação no celular/computador) sem biblioteca: só WebCrypto, que o Cloudflare Worker já tem.
// - VAPID (RFC 8292): o Worker tem um par de chaves próprio e assina um JWT que prova ao serviço de push quem está enviando.
// - Criptografia da mensagem (RFC 8291, aes128gcm): só o aparelho inscrito consegue ler o texto.
// Nada aqui toca em KV nem em rede: quem chama passa o `fetch` e guarda as chaves.

const enc = new TextEncoder();

export const b64u = bytes => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = str => {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/** par de chaves VAPID novo: `pub` (65 bytes, base64url) vai para o navegador; `jwk` (privada) fica só no Worker */
export async function gerarVapid() {
  const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return {pub: b64u(pub), jwk};
}

/** cabeçalho Authorization (VAPID) para um endpoint de push */
export async function cabecalhoVapid(vapid, endpoint, subject, agora = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const body = b64u(enc.encode(JSON.stringify({aud, exp: Math.floor(agora / 1000) + 12 * 3600, sub: subject})));
  const key = await crypto.subtle.importKey('jwk', vapid.jwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, enc.encode(head + '.' + body)));
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + vapid.pub;
}

const hkdf = async (ikm, salt, info, bytes) => {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt, info}, k, bytes * 8));
};

/** corpo cifrado (aes128gcm) de `texto` para a inscrição `sub` = {endpoint, keys: {p256dh, auth}} */
export async function cifrar(texto, sub) {
  const uaPub = unb64u(sub.keys.p256dh);
  const auth = unb64u(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: uaKey}, eph.privateKey, 256));
  const ikm = await hkdf(shared, auth, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(texto), Uint8Array.of(2)); // 2 = último (e único) bloco
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, aes, plain));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, Uint8Array.of(asPub.length), asPub, cipher);
}

/**
 * Envia uma notificação. Devolve {ok, status, gone}: `gone` = a inscrição não existe mais (404/410) e deve ser apagada.
 * `payload` vira JSON: {title, body, url}.
 */
export async function enviarPush(fetcher, vapid, sub, payload, {subject, ttl = 86400} = {}) {
  try {
    const body = await cifrar(JSON.stringify(payload), sub);
    const r = await fetcher(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await cabecalhoVapid(vapid, sub.endpoint, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: 'normal'
      },
      body
    });
    return {ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410};
  } catch (e) {
    return {ok: false, status: 0, gone: false};
  }
}

/** a inscrição que o navegador manda é aceitável? (endereço https e chaves no tamanho certo) */
export function inscricaoValida(sub) {
  try {
    if (!sub || typeof sub !== 'object') return false;
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:' || String(sub.endpoint).length > 600) return false;
    return unb64u(sub.keys.p256dh).length === 65 && unb64u(sub.keys.auth).length === 16;
  } catch (e) {
    return false;
  }
}
