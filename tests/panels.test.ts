import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateManifest } from "../src/core";
import type { Campaign, GameSystem } from "../src/core";
import { BridgeError, createBridge } from "../src/renderer/panel-bridge";
import type { BridgeDeps } from "../src/renderer/panel-bridge";
import { loadPlugins, sha256Hex } from "../src/renderer/plugin-host";
import { hashPluginDir, servedPath } from "../src/main/lib/pluginFiles";

const system: GameSystem = { schema: 2, id: "s1", name: "Sys", version: "1", entityTypes: [{ id: "hero", label: "Герой", category: "character", fields: [{ id: "hp", label: "HP", type: "number", default: 5 }], cardViews: [{ id: "v", name: "Лист", blocks: [] }] }] };
const campaign: Campaign = { schema: 2, id: "c1", name: "Кампания", systemId: "s1", entities: [{ id: "e1", typeId: "hero", name: "Ариэль", values: { hp: 5 } }], notes: [] };

function setup(permissions: BridgeDeps["permissions"], extra: Partial<BridgeDeps> = {}) {
  let project = { systems: [system], campaigns: [campaign] };
  const notes: string[] = [];
  let n = 0;
  const store: Record<string, unknown> = {};
  const bridge = createBridge({
    pluginId: "p", permissions, lang: () => "ru", appVersion: "0.2.0",
    getProject: () => project, change: (fn) => { project = fn(project); },
    selection: () => ({ kind: "campaign", id: "c1" }), notify: (m) => notes.push(m), openPage: () => {},
    roll: (f) => ({ value: 4, text: `${f} = 4` }), storage: { get: (k) => store[k], set: (k, v) => { store[k] = v; } }, newId: (p) => `${p}_${++n}`,
    ...extra,
  });
  return { bridge, project: () => project, notes, store };
}

describe("manifest with panels", () => {
  const base = { id: "x", name: "X", version: "1", apiVersion: 1, permissions: ["ui"] };
  const panel = { id: "p1", title: "P", entry: "panel/a.html", placement: "right" };
  it("accepts a panel-only plugin", () => expect(validateManifest({ ...base, panels: [panel] })).toEqual([]));
  it("requires main or panels", () => expect(validateManifest(base).length).toBeGreaterThan(0));
  it("requires the ui permission", () => expect(validateManifest({ ...base, permissions: [], panels: [panel] }).length).toBe(1));
  it("rejects bad entries and placements", () => {
    for (const bad of [{ ...panel, entry: "../a.html" }, { ...panel, entry: "a.js" }, { ...panel, entry: "/a.html" }, { ...panel, placement: "floating" }, { ...panel, id: "A B" }])
      expect(validateManifest({ ...base, panels: [bad] }).length, JSON.stringify(bad)).toBeGreaterThan(0);
    expect(validateManifest({ ...base, panels: [panel, panel] }).length).toBeGreaterThan(0);
  });
});

describe("panel bridge permissions", () => {
  it("denies everything without the permission", async () => {
    const { bridge } = setup([]);
    for (const m of ["ui.notify", "dice.roll", "storage.get", "project.listSystems", "project.getCampaign", "project.createNote", "project.createSystem"])
      await expect(bridge(m, { message: "x", formula: "1d6", key: "k", id: "c1", campaignId: "c1", title: "t" })).rejects.toBeInstanceOf(BridgeError);
  });
  it("reading does not allow writing", async () => {
    const { bridge } = setup(["project.read"]);
    expect(await bridge("project.listSystems", null)).toHaveLength(1);
    await expect(bridge("project.createNote", { campaignId: "c1", title: "t", body: "" })).rejects.toThrow(/project.write/);
  });
  it("unknown methods are rejected", async () => { await expect(setup(["ui"]).bridge("fs.read", {})).rejects.toThrow(); });
  it("notify is prefixed with the plugin id", async () => {
    const { bridge, notes } = setup(["ui"]);
    await bridge("ui.notify", { message: "hi" });
    expect(notes).toEqual(["p: hi"]);
  });
  it("openPage accepts only known pages", async () => {
    const { bridge } = setup(["ui"]);
    expect(await bridge("ui.openPage", { page: "help" })).toBe(true);
    await expect(bridge("ui.openPage", { page: "evil" })).rejects.toThrow();
  });
});

describe("panel bridge writes", () => {
  const rw = ["project.read", "project.write"] as const;
  it("creates a note and an entity with filtered values", async () => {
    const { bridge, project } = setup([...rw]);
    await bridge("project.createNote", { campaignId: "c1", title: "Заметка", body: "текст" });
    const r = (await bridge("project.createEntity", { campaignId: "c1", typeId: "hero", name: "Бор", values: { hp: 9, secret: 1 } })) as { id: string };
    const c = project().campaigns[0];
    expect(c.notes[0]).toMatchObject({ title: "Заметка", body: "текст" });
    expect(c.entities.find((e) => e.id === r.id)?.values).toEqual({ hp: 9 });
  });
  it("validates input", async () => {
    const { bridge } = setup([...rw]);
    await expect(bridge("project.createNote", { campaignId: "nope", title: "t" })).rejects.toThrow();
    await expect(bridge("project.createNote", { campaignId: "c1", title: "" })).rejects.toThrow();
    await expect(bridge("project.createNote", { campaignId: "c1", title: "x".repeat(300) })).rejects.toThrow();
    await expect(bridge("project.createEntity", { campaignId: "c1", typeId: "ghost", name: "x" })).rejects.toThrow();
    await expect(bridge("project.createEntity", { campaignId: "c1", typeId: "hero", name: "x", values: { hp: { evil: "str" } } })).rejects.toThrow();
    await expect(bridge("project.updateEntityValues", { campaignId: "c1", entityId: "zzz", values: {} })).rejects.toThrow();
  });
  it("updates values and merges them", async () => {
    const { bridge, project } = setup([...rw]);
    await bridge("project.updateEntityValues", { campaignId: "c1", entityId: "e1", values: { hp: 1 } });
    expect(project().campaigns[0].entities[0].values.hp).toBe(1);
  });
  it("createSystem strips protection, assigns a new id and validates", async () => {
    const { bridge, project } = setup([...rw]);
    const r = (await bridge("project.createSystem", { system: { ...system, id: "evil", protection: { locked: true, publicKey: "x", keyId: "k", signature: "s", signedAt: "now" } } })) as { id: string };
    const created = project().systems.find((s) => s.id === r.id)!;
    expect(created.id).not.toBe("evil");
    expect(created.protection).toBeUndefined();
    await expect(bridge("project.createSystem", { system: { name: "x" } })).rejects.toThrow();
    await expect(bridge("project.createSystem", { system: { ...system, name: "data:image/png;base64,AAA" } })).rejects.toThrow();
  });
  it("limits the write rate", async () => {
    const { bridge } = setup([...rw], { writesPerMinute: 3 });
    for (let i = 0; i < 3; i++) await bridge("project.createNote", { campaignId: "c1", title: "n" + i });
    await expect(bridge("project.createNote", { campaignId: "c1", title: "late" })).rejects.toThrow(/Слишком много/);
  });
  it("returns copies, not live references", async () => {
    const { bridge, project } = setup([...rw]);
    const c = (await bridge("project.getCampaign", { id: "c1" })) as Campaign;
    c.name = "hacked";
    expect(project().campaigns[0].name).toBe("Кампания");
  });
});

describe("panel plugins in the host", () => {
  const manifest = { id: "pan", name: "Pan", version: "1", apiVersion: 1, permissions: ["ui"], panels: [{ id: "a", title: "A", entry: "a.html", placement: "page" }] };
  const deps = (approved: Record<string, string> = {}) => ({ sha256: sha256Hex, state: { approved, disabled: [] as string[] }, readData: async () => ({ storage: {}, settings: {} }), writeData: () => {}, appVersion: "0.2.0", getLang: () => "ru" });
  it("needs approval, then exposes panels", async () => {
    const raw = [{ dir: "pan", manifest: manifest as never, errors: [], filesHash: "f1" }];
    const first = await loadPlugins(raw, deps());
    expect(first.plugins[0].state).toBe("needs-approval");
    const second = await loadPlugins(raw, deps({ pan: first.plugins[0].hash }));
    expect(second.plugins[0].state).toBe("active");
    expect(second.plugins[0].panels.map((p) => p.id)).toEqual(["a"]);
  });
  it("changed panel files invalidate the consent", async () => {
    const a = await loadPlugins([{ dir: "pan", manifest: manifest as never, errors: [], filesHash: "f1" }], deps());
    const b = await loadPlugins([{ dir: "pan", manifest: manifest as never, errors: [], filesHash: "f2" }], deps({ pan: a.plugins[0].hash }));
    expect(b.plugins[0].state).toBe("needs-approval");
  });
  it("errors without a files hash", async () => {
    const r = await loadPlugins([{ dir: "pan", manifest: manifest as never, errors: [] }], deps());
    expect(r.plugins[0].state).toBe("error");
  });
});

describe("plugin files", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rolepi-pl-"));
  it("hash changes with content and names", () => {
    const d = tmp(); fs.writeFileSync(path.join(d, "a.html"), "1");
    const h1 = hashPluginDir(d);
    fs.writeFileSync(path.join(d, "a.html"), "2");
    const h2 = hashPluginDir(d);
    fs.writeFileSync(path.join(d, "b.js"), "x");
    expect(new Set([h1, h2, hashPluginDir(d)]).size).toBe(3);
  });
  it("serves only safe paths", () => {
    const d = tmp(); fs.mkdirSync(path.join(d, "panel")); fs.writeFileSync(path.join(d, "panel", "a.html"), "x"); fs.writeFileSync(path.join(d, ".secret.html"), "s"); fs.writeFileSync(path.join(d, "plugin.exe"), "b");
    fs.writeFileSync(path.join(path.dirname(d), "outside.html"), "o");
    expect(servedPath(d, "panel/a.html")).toBeTruthy();
    for (const bad of ["../outside.html", "panel/../../outside.html", "%2e%2e/outside.html", ".secret.html", "plugin.exe", "panel", "", "panel\\a.html", "panel//a.html", "nope.html"])
      expect(servedPath(d, bad), bad).toBeNull();
  });
  it("does not follow symlinks out of the folder", () => {
    const d = tmp(); const out = tmp(); fs.writeFileSync(path.join(out, "x.html"), "secret");
    try { fs.symlinkSync(out, path.join(d, "link")); } catch { return; }
    expect(servedPath(d, "link/x.html")).toBeNull();
  });
});
