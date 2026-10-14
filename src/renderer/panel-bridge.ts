import { SCHEMA_VERSION, loc, validateSystem } from "../core";
import type { Campaign, Entity, GameSystem, PluginPermission } from "../core";

/**
 * Мост между панелью плагина (изолированная страница) и приложением.
 * Панель присылает {method, params}; мост проверяет право плагина и данные и только потом действует.
 * Всё, что приходит из панели, считается недоверенным: типы, размеры и ссылки проверяются здесь.
 */
export interface BridgeDeps {
  pluginId: string;
  permissions: PluginPermission[];
  lang: () => string;
  appVersion: string;
  getProject: () => { systems: GameSystem[]; campaigns: Campaign[] };
  change: (fn: (p: { systems: GameSystem[]; campaigns: Campaign[] }) => { systems: GameSystem[]; campaigns: Campaign[] }) => void;
  selection: () => { kind: "system" | "campaign"; id: string } | null;
  notify: (message: string) => void;
  openPage: (page: string) => void;
  roll: (formula: string) => { value: unknown; text: string };
  storage: { get(key: string): unknown; set(key: string, value: unknown): void };
  newId: (prefix: string) => string;
  /** сколько записей в проект разрешено в минуту (по умолчанию 120) */
  writesPerMinute?: number;
  now?: () => number;
}

export class BridgeError extends Error {}

const PAGES = ["workspace", "dice", "formulas", "plugins", "data", "help", "about"];
const MAX_TEXT = 200_000;
const MAX_NAME = 200;
const MAX_SYSTEM_JSON = 2 * 1024 * 1024;
const MAX_VALUE_KEYS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function str(v: unknown, what: string, max: number, required = true): string {
  if (typeof v !== "string") { if (!required && v === undefined) return ""; throw new BridgeError(`${what}: нужна строка`); }
  if (required && !v.trim()) throw new BridgeError(`${what}: пусто`);
  if (v.length > max) throw new BridgeError(`${what}: слишком длинно (до ${max} знаков)`);
  return v;
}

/** значения героя: только числа, строки, логические, null и списки чисел (как у параметров системы) */
function cleanValues(raw: unknown, allowed: Set<string>): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (!isObj(raw)) throw new BridgeError("values: нужен объект");
  const out: Record<string, unknown> = {};
  const keys = Object.keys(raw);
  if (keys.length > MAX_VALUE_KEYS) throw new BridgeError("values: слишком много параметров");
  for (const k of keys) {
    if (!allowed.has(k)) continue; // неизвестные параметры игнорируются, а не создаются
    const v = raw[k];
    const ok = v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= MAX_TEXT) || (Array.isArray(v) && v.every((x) => typeof x === "number") && v.length <= 1000)
      || (isObj(v) && Object.values(v).every((x) => typeof x === "number") && Object.keys(v).length <= 10); // ресурс {current, max}
    if (!ok) throw new BridgeError(`values.${k}: недопустимое значение`);
    out[k] = typeof v === "number" && !Number.isFinite(v) ? null : v;
  }
  return out;
}

export function createBridge(deps: BridgeDeps): (method: string, params: unknown) => Promise<unknown> {
  const has = (p: PluginPermission) => deps.permissions.includes(p);
  const need = (p: PluginPermission) => { if (!has(p)) throw new BridgeError(`Нет права «${p}»: плагин «${deps.pluginId}» его не запрашивал`); };
  const now = deps.now ?? Date.now;
  const stamps: number[] = [];
  const limit = deps.writesPerMinute ?? 120;
  const countWrite = () => {
    const t = now();
    while (stamps.length && t - stamps[0] > 60_000) stamps.shift();
    if (stamps.length >= limit) throw new BridgeError("Слишком много записей в проект подряд — подождите минуту");
    stamps.push(t);
  };
  const campaignOf = (id: unknown) => {
    const c = deps.getProject().campaigns.find((x) => x.id === str(id, "campaignId", 100));
    if (!c) throw new BridgeError("Кампания не найдена");
    return c;
  };
  const systemOf = (id: string) => deps.getProject().systems.find((x) => x.id === id);

  return async (method, raw) => {
    const p = (isObj(raw) ? raw : {}) as Record<string, unknown>;
    switch (method) {
      case "host.info": return { lang: deps.lang(), appVersion: deps.appVersion, pluginId: deps.pluginId, permissions: [...deps.permissions] };
      case "ui.notify": need("ui"); deps.notify(`${deps.pluginId}: ${str(p.message, "message", 500)}`); return true;
      case "ui.openPage": {
        need("ui");
        const page = str(p.page, "page", 30);
        if (!PAGES.includes(page)) throw new BridgeError("Неизвестный раздел");
        deps.openPage(page); return true;
      }
      case "dice.roll": need("dice"); {
        try { return deps.roll(str(p.formula, "formula", 300)); } catch (e) { throw new BridgeError((e as Error).message); }
      }
      case "storage.get": need("storage"); return clone(deps.storage.get(str(p.key, "key", 200)));
      case "storage.set": need("storage"); try { deps.storage.set(str(p.key, "key", 200), p.value); } catch (e) { throw new BridgeError((e as Error).message); } return true;

      case "project.selection": need("project.read"); return clone(deps.selection());
      case "project.listSystems": need("project.read"); return deps.getProject().systems.map((s) => ({ id: s.id, name: loc(s.name, deps.lang()), locked: s.protection?.locked === true, types: s.entityTypes.map((t) => ({ id: t.id, label: loc(t.label, deps.lang()), category: t.category })) }));
      case "project.getSystem": need("project.read"); {
        const s = systemOf(str(p.id, "id", 100)); if (!s) throw new BridgeError("Система не найдена");
        return clone(s);
      }
      case "project.listCampaigns": need("project.read"); return deps.getProject().campaigns.map((c) => ({ id: c.id, name: c.name, systemId: c.systemId, entities: c.entities.length, notes: c.notes.length }));
      case "project.getCampaign": need("project.read"); return clone(campaignOf(p.id));

      case "project.createNote": {
        need("project.write");
        const c = campaignOf(p.campaignId);
        const title = str(p.title, "title", MAX_NAME), body = str(p.body, "body", MAX_TEXT, false);
        countWrite();
        const id = deps.newId("note");
        deps.change((pr) => ({ ...pr, campaigns: pr.campaigns.map((x) => (x.id === c.id ? { ...x, notes: [...x.notes, { id, title, body }] } : x)) }));
        return { id };
      }
      case "project.createEntity": {
        need("project.write");
        const c = campaignOf(p.campaignId);
        const sys = systemOf(c.systemId);
        const type = sys?.entityTypes.find((t) => t.id === p.typeId);
        if (!sys || !type) throw new BridgeError("Тип героя не найден в системе кампании");
        const name = str(p.name, "name", MAX_NAME);
        const values = cleanValues(p.values, new Set(type.fields.map((f) => f.id)));
        countWrite();
        const entity: Entity = { id: deps.newId("entity"), typeId: type.id, name, values };
        deps.change((pr) => ({ ...pr, campaigns: pr.campaigns.map((x) => (x.id === c.id ? { ...x, entities: [...x.entities, entity] } : x)) }));
        return { id: entity.id };
      }
      case "project.updateEntityValues": {
        need("project.write");
        const c = campaignOf(p.campaignId);
        const e = c.entities.find((x) => x.id === p.entityId);
        if (!e) throw new BridgeError("Герой не найден");
        const type = systemOf(c.systemId)?.entityTypes.find((t) => t.id === e.typeId);
        const values = cleanValues(p.values, new Set((type?.fields ?? []).map((f) => f.id)));
        countWrite();
        deps.change((pr) => ({ ...pr, campaigns: pr.campaigns.map((x) => (x.id === c.id ? { ...x, entities: x.entities.map((en) => (en.id === e.id ? { ...en, values: { ...en.values, ...values } } : en)) } : x)) }));
        return true;
      }
      case "project.createSystem": {
        need("project.write");
        if (!isObj(p.system)) throw new BridgeError("system: нужен объект");
        const text = JSON.stringify(p.system);
        if (text.length > MAX_SYSTEM_JSON) throw new BridgeError("system: слишком большая");
        if (text.includes("data:image")) throw new BridgeError("system: картинки встраивать нельзя");
        const draft = JSON.parse(text) as GameSystem;
        delete (draft as { protection?: unknown }).protection; // защиту плагин выдать не может
        const sys: GameSystem = { ...draft, schema: SCHEMA_VERSION, id: deps.newId("system") };
        const bad = validateSystem(sys).find((i) => i.level === "error");
        if (bad || !Array.isArray(sys.entityTypes) || !sys.name) throw new BridgeError(`system: ${bad?.message ?? "неполное описание"}`);
        countWrite();
        deps.change((pr) => ({ ...pr, systems: [...pr.systems, sys] }));
        return { id: sys.id };
      }
      default: throw new BridgeError(`Неизвестный метод: ${method}`);
    }
  };
}
