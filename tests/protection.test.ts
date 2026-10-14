import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BUNDLE_LIMITS, BundleError, canFork, canonicalize, collectAssetRefs, forkSystem, isLocked, makeManifest, packBundle, protectSystem, protectionPayload, remapAssetRefs, unpackBundle, verifyProtection } from '../src/core';
import type { GameSystem, ProtectionStatus } from '../src/core';
import { ensureAuthor, exportAuthorKey, getAuthor, importAuthorKey, keyIdOf, signPayload, verifyPayload } from '../src/main/lib/keys';
import { strToU8, zipSync } from 'fflate';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-keys-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const sys = (): GameSystem => ({ schema: 2, id: 'local-1', name: 'Космос', version: '1.0.0', entityTypes: [{ id: 't', label: 'Тип', category: 'custom', fields: [{ id: 'hp', label: 'HP', type: 'number', default: 5 }], cardViews: [] }] });
const crypt = () => ({ author: ensureAuthor(dir, 'Мастер'), sign: async (p: string) => signPayload(dir, p), verify: async (k: string, p: string, s: string) => verifyPayload(k, p, s) });
const opts = { author: 'Мастер', license: 'CC BY 4.0', allowFork: true };

describe('canonical form', () => {
  it('does not depend on key order or undefined values', () => {
    expect(canonicalize({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(canonicalize({ a: [2, { c: undefined, d: 1 }], b: 1 }));
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });
});

describe('author keys', () => {
  it('creates a key once, signs and verifies; wrong data fails', () => {
    const a = ensureAuthor(dir, 'Мастер');
    expect(ensureAuthor(dir).keyId).toBe(a.keyId);
    expect(getAuthor(dir)!.name).toBe('Мастер');
    expect(a.keyId).toBe(keyIdOf(a.publicKey));
    const sig = signPayload(dir, 'hello');
    expect(verifyPayload(a.publicKey, 'hello', sig)).toBe(true);
    expect(verifyPayload(a.publicKey, 'hellO', sig)).toBe(false);
    expect(verifyPayload(a.publicKey, 'hello', sig.slice(2) + 'AA')).toBe(false);
    expect(verifyPayload('garbage', 'hello', sig)).toBe(false);
  });
  it('keeps the private key file private on POSIX', () => {
    ensureAuthor(dir);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'keys', 'author.json')).mode & 0o077).toBe(0);
  });
  it('exports and imports a key, rejects forged key files', () => {
    const a = ensureAuthor(dir, 'Мастер');
    const text = exportAuthorKey(dir)!;
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-keys2-'));
    try {
      expect(importAuthorKey(other, text)!.keyId).toBe(a.keyId);
      expect(verifyPayload(a.publicKey, 'x', signPayload(other, 'x'))).toBe(true);
      const forged = JSON.parse(text); forged.publicKey = ensureAuthor(fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-keys3-'))).publicKey; // чужой открытый ключ к нашему закрытому
      expect(importAuthorKey(other, JSON.stringify(forged))).toBeNull();
      expect(importAuthorKey(other, 'not json')).toBeNull();
    } finally { fs.rmSync(other, { recursive: true, force: true }); }
  });
});

describe('protected systems', () => {
  it('signs a copy and verifies it; the original stays untouched and editable', async () => {
    const c = crypt(), original = sys();
    const shared = await protectSystem(original, opts, c.author, c.sign);
    expect(original.protection).toBeUndefined();
    expect(isLocked(shared)).toBe(true);
    const status = await verifyProtection(shared, c.verify);
    expect(status).toMatchObject({ state: 'valid', author: 'Мастер', license: 'CC BY 4.0', allowFork: true, keyId: c.author.keyId });
  });
  it('detects any edit after signing: content, metadata, the lock itself', async () => {
    const c = crypt(), shared = await protectSystem(sys(), opts, c.author, c.sign);
    const edits: ((s: GameSystem) => GameSystem)[] = [
      (s) => ({ ...s, name: 'Взлом' }),
      (s) => ({ ...s, entityTypes: [{ ...s.entityTypes[0], fields: [{ ...s.entityTypes[0].fields[0], default: 999 }] }] }),
      (s) => ({ ...s, meta: { ...s.meta, license: 'Public domain' } }),
      (s) => ({ ...s, meta: { ...s.meta, author: 'Другой' } }),
      (s) => ({ ...s, protection: { ...s.protection!, locked: false as unknown as true } }),
      (s) => { const { protection, ...rest } = s; void protection; return { ...rest, protection: undefined } as unknown as GameSystem; },
    ];
    const results: ProtectionStatus['state'][] = [];
    for (const e of edits.slice(0, 5)) results.push((await verifyProtection(e(shared), c.verify)).state);
    expect(results).toEqual(['tampered', 'tampered', 'tampered', 'tampered', 'tampered']);
    expect((await verifyProtection(edits[5](shared), c.verify)).state).toBe('none'); // защиту можно просто убрать — это уже обычная правимая копия без подписи
  });
  it('a signature by another key does not validate for a substituted author key', async () => {
    const c = crypt(), shared = await protectSystem(sys(), opts, c.author, c.sign);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-keys4-'));
    try { const imposter = ensureAuthor(other, 'Самозванец'); const swapped = { ...shared, protection: { ...shared.protection!, publicKey: imposter.publicKey, keyId: imposter.keyId } }; expect((await verifyProtection(swapped, c.verify)).state).toBe('tampered'); }
    finally { fs.rmSync(other, { recursive: true, force: true }); }
  });
  it('survives a local id change and a schema bump (import / migration)', async () => {
    const c = crypt(), shared = await protectSystem(sys(), opts, c.author, c.sign);
    expect((await verifyProtection({ ...shared, id: 'another-local-id', schema: 3 }, c.verify)).state).toBe('valid');
    expect(protectionPayload(shared)).toBe(protectionPayload({ ...shared, id: 'x', schema: 9 }));
  });
  it('without a verifier the state is "unverified", never "valid"', async () => {
    const c = crypt(), shared = await protectSystem(sys(), opts, c.author, c.sign);
    expect((await verifyProtection(shared, null)).state).toBe('unverified');
  });
  it('fork rules: allowed by author or for own key; derivedFrom keeps the origin', async () => {
    const c = crypt();
    const closed = await protectSystem(sys(), { ...opts, allowFork: false }, c.author, c.sign);
    const st = await verifyProtection(closed, c.verify);
    expect(canFork(closed, st, undefined)).toBe(false);
    expect(canFork(closed, st, c.author.keyId)).toBe(true);
    const open = await protectSystem(sys(), opts, c.author, c.sign);
    expect(canFork(open, await verifyProtection(open, c.verify), undefined)).toBe(true);
    const fork = forkSystem(open);
    expect(fork.protection).toBeUndefined();
    expect(fork.meta?.derivedFrom).toMatchObject({ author: 'Мастер', keyId: c.author.keyId });
    expect(isLocked(fork)).toBe(false);
  });
});

describe('bundles (.rolepi)', () => {
  const ID = 'a'.repeat(64) + '.png', ID2 = 'b'.repeat(64) + '.png';
  const withImage = (): GameSystem => ({ ...sys(), entityTypes: [{ ...sys().entityTypes[0], cardViews: [{ id: 'v', name: 'V', background: { image: `asset:${ID}` }, blocks: [] }] }] });
  it('round-trips a system with its pictures and ignores unreferenced files', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const packed = packBundle({ manifest: makeManifest('system', 'Космос', '0.2.0'), system: withImage(), assets: { [ID]: png, [ID2]: png } });
    const out = unpackBundle(packed);
    expect(out.manifest).toMatchObject({ kind: 'system', title: 'Космос', formatVersion: 1 });
    expect(out.system!.name).toBe('Космос');
    expect(Object.keys(out.assets)).toEqual([ID]);
    expect([...out.assets[ID]]).toEqual([...png]);
  });
  it('rejects non-archives, foreign archives and unsafe entries', () => {
    expect(() => unpackBundle(strToU8('hello'))).toThrow(BundleError);
    expect(() => unpackBundle(zipSync({ 'readme.txt': strToU8('x') }))).toThrowError(/нет описания/);
    const base = { 'manifest.json': strToU8(JSON.stringify(makeManifest('system', 'X', '1'))), 'system.json': strToU8(JSON.stringify(sys())) };
    expect(() => unpackBundle(zipSync({ ...base, 'assets/../evil.png': strToU8('x') }))).toThrow(/Недопустимый/);
    expect(() => unpackBundle(zipSync({ ...base, 'assets/script.js': strToU8('x') }))).toThrow(/Недопустимый/);
    expect(() => unpackBundle(zipSync({ ...base, 'other.json': strToU8('{}') }))).toThrow(/Недопустимый/);
    expect(() => unpackBundle(zipSync({ 'manifest.json': base['manifest.json'] }))).toThrow(/ни системы, ни кампании/);
    expect(() => unpackBundle(zipSync({ ...base, 'system.json': strToU8('{broken') }))).toThrow(/повреждён/);
    const newer = JSON.stringify({ ...makeManifest('system', 'X', '1'), formatVersion: 99 });
    expect(() => unpackBundle(zipSync({ ...base, 'manifest.json': strToU8(newer) }))).toThrow(/более новой/);
  });
  it('refuses oversized content before unpacking it', () => {
    const big = new Uint8Array(BUNDLE_LIMITS.maxFileBytes + 1);
    const z = zipSync({ 'manifest.json': strToU8(JSON.stringify(makeManifest('system', 'X', '1'))), 'system.json': strToU8(JSON.stringify(sys())), [`assets/${ID}`]: big });
    expect(() => unpackBundle(z)).toThrow(/слишком большой/);
  });
  it('collects and remaps picture references', () => {
    const s = withImage();
    expect(collectAssetRefs(s)).toEqual([ID]);
    expect(JSON.stringify(remapAssetRefs(s, { [ID]: ID2 }))).toContain(`asset:${ID2}`);
    expect(remapAssetRefs(s, {})).toBe(s);
  });
});
