import {
  BundleError, collectAssetRefs, makeManifest, migrateCampaign, migrateSystem, packBundle, remapAssetRefs, schemaState, unpackBundle, looksLikeBundle, protectSystem, verifyProtection, isLocked,
} from "../core";
import type { Author, Campaign, GameSystem, ShareOptions } from "../core";
import { externalizeImages } from "./migration";
import { libraryProblem } from "./workspace-model";

/** Всё, что обмену нужно от окружения. В приложении это window.rpi, в тестах — подделки. */
export interface ExchangeApi {
  readAsset(id: string): Promise<Uint8Array | null>;
  putAsset(bytes: Uint8Array): Promise<{ ok: true; id: string } | { ok: false }>;
  ensureAuthor(name: string): Promise<Author>;
  sign(payload: string): Promise<string>;
  verify(publicKey: string, payload: string, signature: string): Promise<boolean>;
  backup(): Promise<unknown>;
}

export const fileSafeName = (s: string) => (s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 80) || "rolepi");

// ───────────────────────────── экспорт ─────────────────────────────

export interface ExportRequest {
  kind: "system" | "campaign";
  system?: GameSystem;
  campaign?: Campaign;
  /** для кампании: положить в пакет и её систему */
  includeSystem?: boolean;
  /** для системы: подписать и защитить от правки */
  protect?: ShareOptions;
  appVersion: string;
  title: string;
}

/** Собирает пакет .rolepi. Картинки берутся из хранилища; защита применяется к копии, исходная система не меняется. */
export async function buildBundle(req: ExportRequest, api: ExchangeApi): Promise<{ bytes: Uint8Array; filename: string }> {
  let system = req.kind === "system" ? req.system : req.includeSystem ? req.system : undefined;
  if (system && req.protect && req.kind === "system") {
    if (isLocked(system)) throw new Error("already-protected");
    const author = await api.ensureAuthor(req.protect.author);
    system = await protectSystem(system, req.protect, author, api.sign);
  }
  const campaign = req.kind === "campaign" ? req.campaign : undefined;
  const assets: Record<string, Uint8Array> = {};
  for (const id of new Set([...(system ? collectAssetRefs(system) : []), ...(campaign ? collectAssetRefs(campaign) : [])])) {
    const bytes = await api.readAsset(id);
    if (bytes) assets[id] = bytes;
  }
  const manifest = makeManifest(req.kind, req.title, req.appVersion, { protected: !!system && isLocked(system) });
  return { bytes: packBundle({ manifest, system, campaign, assets }), filename: `${fileSafeName(req.title)}.rolepi` };
}

// ───────────────────────────── импорт ─────────────────────────────

export class ImportError extends Error {
  constructor(public code: "not-recognized" | "newer" | "broken" | BundleError["code"], message: string) { super(message); }
}

export interface ImportOutcome {
  systems: GameSystem[];
  campaigns: Campaign[];
  focus: { kind: "system" | "campaign"; id: string };
  /** сколько картинок не удалось сохранить */
  lostAssets: number;
  /** подписанная система уже была в проектах — новая копия не создавалась */
  duplicateSystem: boolean;
  /** кампания ссылается на систему, которой нет в проектах */
  missingSystem: boolean;
  protectedSystem: boolean;
}

export interface ImportContext {
  existingSystems: GameSystem[];
  newId: (prefix: string) => string;
}

/** Определяет, что в файле, проверяет его и готовит документы к добавлению. Ничего не пишет, кроме файлов-картинок и копии «перед импортом». */
export async function importData(input: Uint8Array | string, ctx: ImportContext, api: ExchangeApi): Promise<ImportOutcome> {
  let system: GameSystem | undefined;
  let campaign: Campaign | undefined;
  let assets: Record<string, Uint8Array> = {};

  if (typeof input !== "string" && looksLikeBundle(input)) {
    try { ({ system, campaign, assets } = unpackBundle(input)); }
    catch (e) { if (e instanceof BundleError) throw new ImportError(e.code, e.message); throw e; }
  } else {
    let doc: unknown;
    try { doc = JSON.parse(typeof input === "string" ? input : new TextDecoder().decode(input)); } catch { throw new ImportError("not-recognized", "Файл не распознан"); }
    const o = doc as { entityTypes?: unknown; entities?: unknown; notes?: unknown } | null;
    if (o && Array.isArray(o.entityTypes)) system = doc as GameSystem;
    else if (o && Array.isArray(o.entities) && Array.isArray(o.notes)) campaign = doc as Campaign;
    else throw new ImportError("not-recognized", "Файл не распознан");
  }
  for (const d of [system, campaign]) if (d && schemaState(d) === "newer") throw new ImportError("newer", "Создано более новой версией Rolepi");
  if (libraryProblem(system ? [system] : [], campaign ? [campaign] : [])) throw new ImportError("broken", "Содержимое файла повреждено");

  await api.backup(); // откат на случай, если что-то пойдёт не так

  // файлы: имя в пакете должно совпадать с хешем содержимого; если нет — ссылки переназначаются
  const map: Record<string, string> = {};
  let lostAssets = 0;
  for (const [name, bytes] of Object.entries(assets)) {
    const r = await api.putAsset(bytes);
    if (!r.ok) { lostAssets++; continue; }
    if (r.id !== name) map[name] = r.id;
  }
  const put = async (bytes: Uint8Array) => { const r = await api.putAsset(bytes); return r.ok ? `asset:${r.id}` : null; };

  const prep = async <T extends GameSystem | Campaign>(doc: T | undefined, migrate: (d: T) => T): Promise<T | undefined> => {
    if (!doc) return undefined;
    return (await externalizeImages(remapAssetRefs(migrate(doc), map), put)).doc;
  };
  system = await prep(system, migrateSystem as (d: GameSystem) => GameSystem);
  campaign = await prep(campaign, migrateCampaign as (d: Campaign) => Campaign);

  const systems: GameSystem[] = [];
  const campaigns: Campaign[] = [];
  let systemId = campaign?.systemId;
  let duplicateSystem = false;
  if (system) {
    const same = system.protection ? ctx.existingSystems.find((s) => s.protection?.signature === system!.protection!.signature) : undefined;
    if (same) { duplicateSystem = true; systemId = same.id; }
    else { const fresh = { ...system, id: ctx.newId("system") }; systems.push(fresh); systemId = fresh.id; }
  }
  if (campaign) campaigns.push({ ...campaign, id: ctx.newId("campaign"), systemId: systemId ?? campaign.systemId });
  const missingSystem = !!campaign && !system && !ctx.existingSystems.some((s) => s.id === campaign!.systemId);
  const focus = campaigns[0] ? { kind: "campaign" as const, id: campaigns[0].id } : { kind: "system" as const, id: systems[0]?.id ?? systemId! };
  return { systems, campaigns, focus, lostAssets, duplicateSystem, missingSystem, protectedSystem: !!system?.protection };
}

/** Проверка подписи импортированной системы — для сообщения пользователю. */
export const verifyImported = (system: GameSystem, api: Pick<ExchangeApi, "verify">) => verifyProtection(system, api.verify);
