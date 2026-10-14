import { describe, expect, it } from "vitest";
import {
  createEntity,
  label,
  libraryProblem,
  newSystem,
  preview,
  rename,
  systemIssues,
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

describe("library safety and localization", () => {
  it("rejects malformed documents instead of overwriting them", () => {
    const system = newSystem();
    expect(libraryProblem([system], [])).toBe(false);
    expect(libraryProblem([{ schema: 2, id: "x", entityTypes: [] }], [])).toBe(true);
    expect(libraryProblem([], [{ schema: 1, id: "c", entities: [{ id: "e", values: [] }], notes: [] }])).toBe(true);
    expect(libraryProblem([null], [])).toBe(true);
  });
  it("creates bilingual defaults and edits one language at a time", () => {
    const system = newSystem();
    expect(label(system.name, "ru")).toBe("Новая система");
    expect(label(system.name, "en")).toBe("New system");
    expect(rename(system.name, "Sci-fi", "en")).toEqual({ ru: "Новая система", en: "Sci-fi" });
    expect(rename("plain", "x", "en")).toBe("x");
    expect(systemIssues({ ...system, entityTypes: [{ ...system.entityTypes[0], fields: [{ id: "a b", label: "", type: "number" }] }] }, "en")[0].message).toMatch(/Name in formulas/);
  });
});
