import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AssetError, collectRefs, gcAssets, listAssets, putAsset, readAsset, sniffImage } from '../src/main/lib/assets';
import { autoBackup, createBackup, deleteBackup, listBackups, pruneBackups, restoreBackup } from '../src/main/lib/backups';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolepi-lib-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const png = (n: number) => Uint8Array.from([...PNG, n]);
const write = (rel: string, data: unknown) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)); };

describe('asset store', () => {
  it('stores by content: the same bytes give the same id and one file', () => {
    const a = putAsset(dir, PNG), b = putAsset(dir, PNG);
    expect(a.id).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(b).toMatchObject({ id: a.id, existed: true });
    expect(listAssets(dir)).toHaveLength(1);
    expect(readAsset(dir, a.id)!.equals(Buffer.from(PNG))).toBe(true);
  });
  it('trusts bytes, not names: rejects non-images, empty and oversized files', () => {
    expect(() => putAsset(dir, new TextEncoder().encode('<svg onload=alert(1)>'))).toThrow(AssetError);
    expect(() => putAsset(dir, new Uint8Array())).toThrow(/Пустой/);
    expect(() => putAsset(dir, new Uint8Array(10 * 1024 * 1024 + 1))).toThrow(/слишком большой/);
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImage(new TextEncoder().encode('RIFFxxxxWEBP'))).toBe('webp');
    expect(sniffImage(new TextEncoder().encode('GIF89a'))).toBe('gif');
  });
  it('refuses path traversal ids', () => {
    expect(readAsset(dir, '../../etc/passwd')).toBeNull();
    expect(readAsset(dir, 'a'.repeat(64) + '.svg')).toBeNull();
  });
  it('collects references and garbage-collects only unreferenced files', () => {
    const keep = putAsset(dir, png(1)).id, inBackup = putAsset(dir, png(2)).id, unused = putAsset(dir, png(3)).id, pending = putAsset(dir, png(4)).id;
    write('systems/s.json', { card: { background: { image: `asset:${keep}` } } });
    write(`backups/20260101-000000-000-manual/campaigns/c.json`, { img: `asset:${inBackup}` });
    expect([...collectRefs(`x asset:${keep} y`)]).toEqual([keep]);
    const r = gcAssets(dir, [pending]);
    expect(r).toMatchObject({ deleted: 1, kept: 3 });
    expect(listAssets(dir).map((a) => a.id).sort()).toEqual([keep, inBackup, pending].sort());
    expect(listAssets(dir).some((a) => a.id === unused)).toBe(false);
  });
});

describe('backups', () => {
  const seed = () => { write('systems/s1.json', { v: 1 }); write('campaigns/c1.json', { v: 1 }); write('app/plugins.json', { approved: {} }); };
  it('snapshots documents with a manifest and lists newest first', () => {
    seed();
    const a = createBackup(dir, 'manual', '0.2.0', 'до экспериментов', new Date('2026-01-01T10:00:00'));
    const b = createBackup(dir, 'auto', '0.2.0', undefined, new Date('2026-01-01T11:00:00'));
    expect(a).toMatchObject({ reason: 'manual', systems: 1, campaigns: 1, note: 'до экспериментов' });
    expect(listBackups(dir).map((x) => x.id)).toEqual([b.id, a.id]);
  });
  it('restores a snapshot and keeps a safety copy of the current state', () => {
    seed();
    const snap = createBackup(dir, 'manual', '0.2.0');
    write('systems/s1.json', { v: 2 }); write('systems/s2.json', { v: 2 }); fs.rmSync(path.join(dir, 'campaigns/c1.json'));
    const r = restoreBackup(dir, snap.id, '0.2.0')!;
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'systems/s1.json'), 'utf8'))).toEqual({ v: 1 });
    expect(fs.existsSync(path.join(dir, 'systems/s2.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'campaigns/c1.json'))).toBe(true);
    // сама отмена восстановления: в «страховом» снимке лежит состояние до него
    const undo = restoreBackup(dir, r.safety.id, '0.2.0')!;
    expect(undo).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'systems/s1.json'), 'utf8'))).toEqual({ v: 2 });
  });
  it('rejects unsafe ids', () => {
    expect(restoreBackup(dir, '../../x', '0')).toBeNull();
    expect(deleteBackup(dir, '../..')).toBe(false);
  });
  it('auto-backup respects the interval and pruning keeps manual copies longer', () => {
    seed();
    const t0 = new Date('2026-01-01T10:00:00');
    expect(autoBackup(dir, '0.2.0', t0)).toBeTruthy();
    expect(autoBackup(dir, '0.2.0', new Date(t0.getTime() + 60_000))).toBeNull();
    expect(autoBackup(dir, '0.2.0', new Date(t0.getTime() + 11 * 60_000))).toBeTruthy();
    for (let i = 0; i < 5; i++) createBackup(dir, 'before-restore', '0', undefined, new Date(t0.getTime() + (20 + i) * 60_000));
    createBackup(dir, 'manual', '0', undefined, new Date(t0.getTime() + 60 * 60_000));
    const removed = pruneBackups(dir, 2, 100);
    expect(removed).toBe(5);
    const left = listBackups(dir);
    expect(left.filter((b) => b.reason === 'manual')).toHaveLength(1);
    expect(left.filter((b) => b.reason !== 'manual')).toHaveLength(2);
  });
});
