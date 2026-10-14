import { describe, expect, it } from "vitest";
import { computeEntity, rollInitiative, runAction, validateSystem } from "../src/core";
import type { CardView, EntityType, GameSystem } from "../src/core";
import { FIELD_PRESETS, TYPE_TEMPLATES, appendToView, buildBlocks, uniqueTypeId } from "../src/renderer/templates";

const system = (types: EntityType[]): GameSystem => ({ schema: 2, id: "s", name: "S", version: "1", entityTypes: types });

describe("type templates", () => {
  for (const tpl of TYPE_TEMPLATES) {
    it(`${tpl.key}: valid, computes, blocks point to real fields`, () => {
      const type = tpl.build();
      expect(validateSystem(system([type])).filter((i) => i.level === "error")).toEqual([]);
      const ids = type.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const b of type.cardViews[0].blocks) if (b.field) expect(ids, `${b.kind}:${b.field}`).toContain(b.field);
      const r = computeEntity(type, {}, { system: system([type]), rng: () => 0.5 });
      expect(r.errors).toEqual({});
      if (type.initiative) expect(Number.isFinite(rollInitiative(type, {}, { system: system([type]), rng: () => 0.5 }))).toBe(true);
      for (const a of type.actions ?? []) expect(() => runAction(type, a, {}, {}, { system: system([type]), rng: () => 0.5 })).not.toThrow();
      expect(tpl.label.ru && tpl.label.en && tpl.description.ru && tpl.description.en).toBeTruthy();
    });
  }
  it("blocks do not overlap and stay inside 12 columns", () => {
    for (const tpl of TYPE_TEMPLATES) {
      const blocks = tpl.build().cardViews[0].blocks;
      blocks.forEach((a, i) => {
        expect(a.x >= 0 && a.x + a.w <= 12, `${tpl.key} ${a.kind} width`).toBe(true);
        blocks.slice(i + 1).forEach((b) => {
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${tpl.key}: ${a.kind}(${a.field}) overlaps ${b.kind}(${b.field})`).toBe(false);
        });
      });
    }
  });
});

describe("field presets", () => {
  it("every preset is bilingual and has unique field ids inside", () => {
    for (const p of FIELD_PRESETS) {
      expect(p.label.ru && p.label.en, p.key).toBeTruthy();
      const ids = p.fields.map((f) => f.id);
      expect(new Set(ids).size, p.key).toBe(ids.length);
      for (const f of p.fields) expect(f.label, `${p.key}.${f.id}`).toBeTruthy();
    }
    expect(new Set(FIELD_PRESETS.map((p) => p.key)).size).toBe(FIELD_PRESETS.length);
  });
  it("every preset alone makes a valid, computable type", () => {
    for (const p of FIELD_PRESETS) {
      const type: EntityType = { id: "t", label: "T", category: "custom", fields: structuredClone(p.fields), cardViews: [{ id: "v", name: "V", blocks: buildBlocks(p.fields, p.bars) }] };
      expect(validateSystem(system([type])).filter((i) => i.level === "error"), p.key).toEqual([]);
      expect(computeEntity(type, {}, { system: system([type]) }).errors, p.key).toEqual({});
    }
  });
  it("bars point at their maximum field", () => {
    const hp = FIELD_PRESETS.find((p) => p.key === "hp")!;
    expect(hp.bars).toEqual({ hp: "max_hp" });
    const blocks = buildBlocks(hp.fields, hp.bars);
    expect(blocks.find((b) => b.kind === "bar")?.props).toEqual({ maxField: "max_hp" });
  });
  it("appending to a card keeps the actions block last and does not overlap", () => {
    const type = TYPE_TEMPLATES.find((t) => t.key === "character")!.build();
    const extra = FIELD_PRESETS.find((p) => p.key === "mana")!;
    const view: CardView = appendToView(type.cardViews[0], extra.fields, extra.bars);
    expect(view.blocks[view.blocks.length - 1].kind).toBe("actions");
    expect(view.blocks.some((b) => b.field === "mana")).toBe(true);
    view.blocks.forEach((a, i) => view.blocks.slice(i + 1).forEach((b) => expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.kind}/${b.kind}`).toBe(false)));
  });
  it("unique type ids", () => {
    expect(uniqueTypeId("creature", ["character"])).toBe("creature");
    expect(uniqueTypeId("creature", ["creature", "creature_2"])).toBe("creature_3");
  });
});
