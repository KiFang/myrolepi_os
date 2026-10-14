import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Ключ автора (Ed25519). Создаётся один раз и хранится в папке данных рядом с проектами.
 * Закрытый ключ не покидает главный процесс: приложение просит подписать текст и получает подпись.
 * Файл ключа не зашифрован — храните его копию (раздел «Данные»), как любой личный ключ.
 */
export interface AuthorFile { publicKey: string; privateKey: string; name?: string; createdAt: string }
export interface AuthorInfo { publicKey: string; keyId: string; name?: string }

const MAX_PAYLOAD = 25 * 1024 * 1024;
export const keysFile = (dataDir: string) => path.join(dataDir, 'keys', 'author.json');

/** Короткий отпечаток: первые 16 символов sha256 от открытого ключа (DER). */
export function keyIdOf(publicKeyB64: string): string {
  return crypto.createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 16);
}

function read(dataDir: string): AuthorFile | null {
  const f = keysFile(dataDir);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as AuthorFile;
    return typeof j.publicKey === 'string' && typeof j.privateKey === 'string' ? j : null;
  } catch { return null; }
}
function write(dataDir: string, a: AuthorFile) {
  const f = keysFile(dataDir);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(a, null, 2), { mode: 0o600 });
  fs.renameSync(f + '.tmp', f);
  try { fs.chmodSync(f, 0o600); } catch { /* на Windows права задаются иначе */ }
}
const info = (a: AuthorFile): AuthorInfo => ({ publicKey: a.publicKey, keyId: keyIdOf(a.publicKey), name: a.name });

export const getAuthor = (dataDir: string): AuthorInfo | null => { const a = read(dataDir); return a ? info(a) : null; };

/** Возвращает ключ автора, создавая его при первом обращении. */
export function ensureAuthor(dataDir: string, name?: string): AuthorInfo {
  let a = read(dataDir);
  if (!a) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    a = { publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), name: name?.trim() || undefined, createdAt: new Date().toISOString() };
    write(dataDir, a);
  } else if (name?.trim() && name.trim() !== a.name) {
    a = { ...a, name: name.trim().slice(0, 80) };
    write(dataDir, a);
  }
  return info(a);
}

export function setAuthorName(dataDir: string, name: string): AuthorInfo | null {
  const a = read(dataDir);
  if (!a) return null;
  const next = { ...a, name: name.trim().slice(0, 80) || undefined };
  write(dataDir, next);
  return info(next);
}

const privateOf = (a: AuthorFile) => crypto.createPrivateKey({ key: Buffer.from(a.privateKey, 'base64'), format: 'der', type: 'pkcs8' });

export function signPayload(dataDir: string, payload: string): string {
  const a = read(dataDir);
  if (!a) throw new Error('no-key');
  if (payload.length > MAX_PAYLOAD) throw new Error('too-big');
  return crypto.sign(null, Buffer.from(payload), privateOf(a)).toString('base64');
}

export function verifyPayload(publicKeyB64: string, payload: string, signatureB64: string): boolean {
  try {
    if (typeof publicKeyB64 !== 'string' || publicKeyB64.length > 300 || typeof signatureB64 !== 'string' || signatureB64.length > 200 || payload.length > MAX_PAYLOAD) return false;
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(payload), key, Buffer.from(signatureB64, 'base64'));
  } catch { return false; }
}

export function exportAuthorKey(dataDir: string): string | null {
  const a = read(dataDir);
  return a ? JSON.stringify({ format: 'rolepi-author-key', version: 1, ...a }, null, 2) : null;
}

/** Загружает ключ из файла-копии. Пара проверяется (подпись → проверка), чтобы не принять подмену. */
export function importAuthorKey(dataDir: string, text: string): AuthorInfo | null {
  try {
    const j = JSON.parse(text) as Partial<AuthorFile> & { format?: string };
    if (j.format !== 'rolepi-author-key' || typeof j.publicKey !== 'string' || typeof j.privateKey !== 'string') return null;
    const cand: AuthorFile = { publicKey: j.publicKey, privateKey: j.privateKey, name: typeof j.name === 'string' ? j.name.slice(0, 80) : undefined, createdAt: typeof j.createdAt === 'string' ? j.createdAt : new Date().toISOString() };
    const probe = 'rolepi-key-check';
    const sig = crypto.sign(null, Buffer.from(probe), privateOf(cand)).toString('base64');
    if (!verifyPayload(cand.publicKey, probe, sig)) return null;
    write(dataDir, cand);
    return info(cand);
  } catch { return null; }
}
