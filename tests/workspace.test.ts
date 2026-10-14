import { describe, expect, it } from "vitest";
import {
  createEntity,
  newSystem,
  preview,
  rename,
  systemIssues,
  starterSystem,
} from "../src/renderer/workspace-model";
import type { PluginRegistry } from "../src/renderer/plugin-host";

const registry: PluginRegistry = {
  functions: {},
  blocks: {},
  systems: [],
  themes: [],
};
describe("editable systems and campaigns", () => {
  it("uses campaign input and plugin functions when computing dependent fields", () => {
    const system = newSystem();
    const type = system.entityTypes[0];
    type.fields = [
      { id: "strength", label: "Сила", type: "number", default: 10 },
      {
        id: "hp",
        label: "HP",
        type: "number",
        formula: "double(strength) + 5",
      },
    ];
    const entity = createEntity(type);
    entity.values = { strength: 16 };
    const result = preview(type, entity.values, system, {
      ...registry,
      functions: { double: (args) => Number(args[0]) * 2 },
    });
    expect(result.values.hp).toBe(37);
    expect(result.errors).toEqual({});
    expect(entity.values).toEqual({ strength: 16 });
  });
  it("reports cyclic and unknown dependencies without crashing the editor", () => {
    const system = newSystem();
    const type = system.entityTypes[0];
    type.fields = [
      { id: "a", label: "A", type: "number", formula: "b" },
      { id: "b", label: "B", type: "number", formula: "a" },
    ];
    expect(Object.keys(preview(type, {}, system, registry).errors)).toEqual([
      "system",
    ]);
    expect(
      systemIssues(system).some((i) => i.message.includes("Циклическая")),
    ).toBe(true);
    type.fields[1].formula = "missing";
    expect(
      systemIssues(system).some((i) => i.message.includes("неизвестное поле")),
    ).toBe(true);
  });
  it("preserves translations and detects invalid field identifiers and limits", () => {
    expect(rename({ ru: "До", en: "Before" }, "После")).toEqual({
      ru: "После",
      en: "Before",
    });
    const system = newSystem();
    system.entityTypes[0].fields = [
      { id: "bad.id", label: "", type: "number", min: 8, max: 2 },
    ];
    expect(
      systemIssues(system).filter((i) => i.level === "error"),
    ).toHaveLength(2);
  });
});

describe("system templates", () => {
  it("creates a playable base with valid independent rules", () => {
    const first = starterSystem("Северные земли", "classic");
    const second = starterSystem("Другая игра", "classic");
    expect(systemIssues(first).filter((i) => i.level === "error")).toEqual([]);
    expect(
      preview(
        first.entityTypes[0],
        { endurance: 16, level: 2 },
        first,
        registry,
      ).values.max_hp,
    ).toBe(40);
    first.entityTypes[0].fields[0].default = 99;
    expect(second.entityTypes[0].fields[0].default).toBe(10);
    expect(first.id).not.toBe(second.id);
  });
  it("copies plugin data without modifying its source", () => {
    const source = starterSystem("Источник", "classic");
    const copy = starterSystem("Моя игра", source);
    copy.entityTypes[0].fields[0].label = "Моя сила";
    expect(source.entityTypes[0].fields[0].label).toBe("Сила");
    expect(copy.name).toBe("Моя игра");
    expect(copy.id).not.toBe(source.id);
  });
});
