const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64e(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64d(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(b64key: string): Promise<CryptoKey> {
  const raw = b64d(b64key);
  if (raw.length !== 32) throw new Error("TOKEN_KEY 32 bayt (base64) bo'lishi kerak");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(b64key: string, plain: string): Promise<string> {
  const key = await importKey(b64key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${b64e(iv)}.${b64e(ct)}`;
}

export async function decryptToken(b64key: string, stored: string): Promise<string> {
  const [ivB64, ctB64] = stored.split(".");
  if (!ivB64 || !ctB64) throw new Error("noto'g'ri shifrlangan qiymat");
  const key = await importKey(b64key);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(ivB64) }, key, b64d(ctB64));
  return dec.decode(pt);
}

/** Uzunligidan qat'i nazar taxminan doimiy vaqtda solishtirish. */
export function timingSafeEqual(a: string, b: string): boolean {
  const A = enc.encode(a);
  const B = enc.encode(b);
  const n = Math.max(A.length, B.length);
  let diff = A.length ^ B.length;
  for (let i = 0; i < n; i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0);
  return diff === 0;
}

export function randomSecret(bytes = 32): string {
  return b64e(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
