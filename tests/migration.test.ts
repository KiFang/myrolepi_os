import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, migrateCampaign, migrateSystem, schemaState } from '../src/core';
import type { Campaign, GameSystem } from '../src/core';
import { dataUrlToBytes, externalizeImages, migrateProject } from '../src/renderer/migration';
import { libraryNewer, libraryOld, libraryProblem } from '../src/renderer/workspace-model';

const PNG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const system = (extra = {}): GameSystem => ({ schema: 1, id: 's', name: 'S', version: '1', entityTypes: [{ id: 't', label: 'T', category: 'custom', fields: [{ id: 'pic', label: 'Pic', type: 'image' }], cardViews: [{ id: 'v', name: 'V', background: { image: PNG_URL }, blocks: [{ id: 'b', kind: 'image', x: 0, y: 0, w: 2, h: 2, props: { src: PNG_URL } }] }] }], ...extra });
const campaign = (): Campaign => ({ schema: 1, id: 'c', name: 'C', systemId: 's', notes: [], entities: [{ id: 'e', typeId: 't', name: 'E', values: { pic: PNG_URL, hp: 3 } }] });

describe('schema versions', () => {
  it('classifies documents', () => {
    expect(CURRENT_SCHEMA).toBe(2);
    expect(schemaState({ schema: 2 })).toBe('ok');
    expect(schemaState({ schema: 1 })).toBe('old');
    expect(schemaState({ schema: 3 })).toBe('newer');
    expect(schemaState({ schema: '1' })).toBe('invalid');
    expect(schemaState(null)).toBe('invalid');
  });
  it('migrates v1 to the current version without losing anything', () => {
    const s = migrateSystem(system());
    expect(s.schema).toBe(2);
    expect(s.entityTypes[0].fields).toHaveLength(1);
    expect(migrateCampaign(campaign()).schema).toBe(2);
    expect(migrateSystem(s)).toEqual(s); // идемпотентно
  });
  it('treats newer documents as unreadable, old ones as upgradable', () => {
    expect(libraryNewer([{ schema: 3 }], [])).toBe(true);
    expect(libraryOld([system()], [])).toBe(true);
    expect(libraryProblem([system()], [campaign()])).toBe(false);
  });
});

describe('moving pictures out of JSON', () => {
  it('replaces every embedded image with one shared file reference', async () => {
    const stored: Uint8Array[] = [];
    const put = async (b: Uint8Array) => { stored.push(b); return 'asset:' + 'a'.repeat(64) + '.png'; };
    const r = await externalizeImages(system(), put);
    expect(r.changed).toBe(true);
    expect(JSON.stringify(r.doc)).not.toContain('data:image');
    expect(JSON.stringify(r.doc).match(/asset:a{64}\.png/g)).toHaveLength(2);
    expect(stored).toHaveLength(1); // одинаковые картинки сохраняются один раз
    expect(stored[0][1]).toBe(0x50); // это PNG
  });
  it('keeps the picture if saving it fails — nothing is lost', async () => {
    const r = await externalizeImages(system(), async () => null);
    expect(r.changed).toBe(false);
    expect(JSON.stringify(r.doc)).toContain('data:image/png');
  });
  it('migrates a whole project and leaves the originals untouched', async () => {
    const s = system(), c = campaign();
    const out = await migrateProject([s], [c], async () => 'asset:' + 'b'.repeat(64) + '.png');
    expect(out.systems[0].schema).toBe(2);
    expect(out.campaigns[0].entities[0].values).toEqual({ pic: 'asset:' + 'b'.repeat(64) + '.png', hp: 3 });
    expect(s.schema).toBe(1);
    expect(JSON.stringify(s)).toContain('data:image');
  });
  it('decodes data URLs', () => {
    const b = dataUrlToBytes(PNG_URL);
    expect([...b.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
