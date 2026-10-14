import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { collectAssetRefs, isLocked, makeManifest, packBundle, unpackBundle, verifyProtection } from '../src/core';
import type { Author, Campaign, GameSystem } from '../src/core';
import { ImportError, buildBundle, fileSafeName, importData } from '../src/renderer/exchange';
import type { ExchangeApi } from '../src/renderer/exchange';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureAuthor, signPayload, verifyPayload } from '../src/main/lib/keys';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 5]);
const idOf = (b: Uint8Array) => createHash('sha256').update(b).digest('hex') + '.png';
const ID = idOf(PNG);
const system = (): GameSystem => ({ schema: 2, id: 's1', name: 'Космос', version: '1.0.0', entityTypes: [{ id: 't', label: 'T', category: 'custom', fields: [], cardViews: [{ id: 'v', name: 'V', background: { image: `asset:${ID}` }, blocks: [] }] }] });
const campaign = (): Campaign => ({ schema: 2, id: 'c1', name: 'Поход', systemId: 's1', notes: [], entities: [] });

function fakeApi(over: Partial<ExchangeApi> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-ex-'));
  const files = new Map<string, Uint8Array>([[ID, PNG]]);
  const calls = { backup: 0 };
  const api: ExchangeApi = {
    readAsset: async (id) => files.get(id) ?? null,
    putAsset: async (bytes) => { const id = idOf(bytes); files.set(id, bytes); return { ok: true, id }; },
    ensureAuthor: async (name) => ensureAuthor(dir, name) as Author,
    sign: async (p) => signPayload(dir, p),
    verify: async (k, p, s) => verifyPayload(k, p, s),
    backup: async () => { calls.backup++; },
    ...over,
  };
  return { api, files, calls, dir };
}
const ctx = (existing: GameSystem[] = []) => { let n = 0; return { existingSystems: existing, newId: (p: string) => `${p}_new${++n}` }; };

describe('export', () => {
  it('packs a system with its pictures', async () => {
    const { api } = fakeApi();
    const { bytes, filename } = await buildBundle({ kind: 'system', system: system(), appVersion: '0.2.0', title: 'Космос' }, api);
    expect(filename).toBe('Космос.rolepi');
    const out = unpackBundle(bytes);
    expect(Object.keys(out.assets)).toEqual([ID]);
    expect(out.manifest.protected).toBe(false);
  });
  it('protects only the exported copy and signs it with the author key', async () => {
    const { api } = fakeApi(), original = system();
    const { bytes } = await buildBundle({ kind: 'system', system: original, appVersion: '0.2.0', title: 'Космос', protect: { author: 'Мастер', license: 'CC BY 4.0', allowFork: false } }, api);
    const out = unpackBundle(bytes);
    expect(out.manifest.protected).toBe(true);
    expect(isLocked(out.system)).toBe(true);
    expect((await verifyProtection(out.system!, api.verify)).state).toBe('valid');
    expect(original.protection).toBeUndefined();
  });
  it('a campaign can carry its system; an already protected system is not re-signed', async () => {
    const { api } = fakeApi();
    const { bytes } = await buildBundle({ kind: 'campaign', campaign: campaign(), system: system(), includeSystem: true, appVersion: '0.2.0', title: 'Поход' }, api);
    const out = unpackBundle(bytes);
    expect(out.system && out.campaign).toBeTruthy();
    const protectedSys = unpackBundle((await buildBundle({ kind: 'system', system: system(), appVersion: '1', title: 'x', protect: { author: 'A', license: 'L', allowFork: true } }, api)).bytes).system!;
    await expect(buildBundle({ kind: 'system', system: protectedSys, appVersion: '1', title: 'x', protect: { author: 'A', license: 'L', allowFork: true } }, api)).rejects.toThrow('already-protected');
  });
  it('makes safe file names', () => {
    expect(fileSafeName('a/b:c*?"<>|')).toBe('a_b_c_');
    expect(fileSafeName('   ')).toBe('rolepi');
  });
});

describe('import', () => {
  it('imports a bundle: new ids, pictures saved, a backup taken first', async () => {
    const { api, calls, files } = fakeApi();
    files.clear();
    const bytes = packBundle({ manifest: makeManifest('campaign', 'Поход', '0.2.0'), system: system(), campaign: campaign(), assets: { [ID]: PNG } });
    const r = await importData(bytes, ctx(), api);
    expect(calls.backup).toBe(1);
    expect(files.has(ID)).toBe(true);
    expect(r.systems[0].id).toBe('system_new1');
    expect(r.campaigns[0]).toMatchObject({ id: 'campaign_new2', systemId: 'system_new1' });
    expect(r.focus).toEqual({ kind: 'campaign', id: 'campaign_new2' });
    expect(r.missingSystem).toBe(false);
  });
  it('re-links references when a picture name does not match its content (tampered pack)', async () => {
    const { api, files } = fakeApi();
    files.clear();
    const fake = 'f'.repeat(64) + '.png';
    const sys = JSON.parse(JSON.stringify(system()).replace(ID, fake));
    const bytes = packBundle({ manifest: makeManifest('system', 'X', '1'), system: sys, assets: { [fake]: PNG } });
    const r = await importData(bytes, ctx(), api);
    expect(collectAssetRefs(r.systems[0])).toEqual([ID]);
  });
  it('an imported protected system keeps a valid signature even though its id changed', async () => {
    const { api } = fakeApi();
    const { bytes } = await buildBundle({ kind: 'system', system: system(), appVersion: '1', title: 'x', protect: { author: 'A', license: 'L', allowFork: true } }, api);
    const r = await importData(bytes, ctx(), api);
    expect(r.protectedSystem).toBe(true);
    expect(r.systems[0].id).toBe('system_new1');
    expect((await verifyProtection(r.systems[0], api.verify)).state).toBe('valid');
  });
  it('does not duplicate a protected system that is already in the library', async () => {
    const { api } = fakeApi();
    const first = await importData((await buildBundle({ kind: 'system', system: system(), appVersion: '1', title: 'x', protect: { author: 'A', license: 'L', allowFork: true } }, api)).bytes, ctx(), api);
    const bundle = packBundle({ manifest: makeManifest('campaign', 'Поход', '1'), system: first.systems[0], campaign: { ...campaign(), systemId: first.systems[0].id }, assets: { [ID]: PNG } });
    const again = await importData(bundle, ctx(first.systems), api);
    expect(again.duplicateSystem).toBe(true);
    expect(again.systems).toHaveLength(0);
    expect(again.campaigns[0].systemId).toBe(first.systems[0].id);
  });
  it('warns when a campaign has no system in the library', async () => {
    const { api } = fakeApi();
    const r = await importData(packBundle({ manifest: makeManifest('campaign', 'x', '1'), campaign: campaign(), assets: {} }), ctx(), api);
    expect(r.missingSystem).toBe(true);
  });
  it('reads legacy JSON (v1, embedded pictures) and migrates it', async () => {
    const { api, files } = fakeApi();
    files.clear();
    const url = 'data:image/png;base64,' + Buffer.from(PNG).toString('base64');
    const legacy = { ...system(), schema: 1, entityTypes: [{ ...system().entityTypes[0], cardViews: [{ id: 'v', name: 'V', background: { image: url }, blocks: [] }] }] };
    const r = await importData(JSON.stringify(legacy), ctx(), api);
    expect(r.systems[0].schema).toBe(2);
    expect(JSON.stringify(r.systems[0])).not.toContain('data:image');
    expect(files.has(ID)).toBe(true);
  });
  it('rejects unknown, broken and newer files without touching anything', async () => {
    const { api, calls } = fakeApi();
    await expect(importData('{"hello":1}', ctx(), api)).rejects.toBeInstanceOf(ImportError);
    await expect(importData('not json', ctx(), api)).rejects.toMatchObject({ code: 'not-recognized' });
    await expect(importData(JSON.stringify({ ...system(), schema: 9 }), ctx(), api)).rejects.toMatchObject({ code: 'newer' });
    await expect(importData(JSON.stringify({ ...system(), id: '' }), ctx(), api)).rejects.toMatchObject({ code: 'broken' });
    await expect(importData(zipSync({ 'x.txt': strToU8('1') }), ctx(), api)).rejects.toMatchObject({ code: 'bad-manifest' });
    expect(calls.backup).toBe(0);
  });
  it('counts pictures that could not be saved', async () => {
    const { api } = fakeApi({ putAsset: async () => ({ ok: false }) });
    const r = await importData(packBundle({ manifest: makeManifest('system', 'x', '1'), system: system(), assets: { [ID]: PNG } }), ctx(), api);
    expect(r.lostAssets).toBe(1);
  });
});
