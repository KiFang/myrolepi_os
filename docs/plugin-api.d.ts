// Rolepi — описание API плагинов (apiVersion 1) / Rolepi plugin API (apiVersion 1)
type LocalizedString = string | { ru?: string; en?: string; [lang: string]: string | undefined };
type FormulaValue = number | string | boolean | number[] | null;

interface FormulaContext {
  /** значения параметров объекта и уже посчитанные величины */
  scope: Record<string, unknown>;
  /** случайное число от 0 (включительно) до 1 (не включая). Используйте его, а не Math.random */
  rng: () => number;
  /** журнал бросков: сюда попадают броски кубиков, сделанные формулой */
  rolls: unknown[];
}

interface PluginHost {
  apiVersion: 1;
  appVersion: string;
  lang(): string;                                                    // "ru" | "en" | ...

  registerFormulaFunction(name: string, fn: (args: FormulaValue[], ctx: FormulaContext) => FormulaValue,
    info?: { description?: LocalizedString; example?: string }): void;   // право "formulas"
  registerBlock(block: {                                             // право "blocks"
    kind: string;                                                    // a-z, 0-9, "-"
    label: LocalizedString;
    render(ctx: { values: Record<string, unknown>; props: Record<string, unknown>; lang: string }): string; // HTML
  }): void;
  registerSystem(system: GameSystem): void;                          // право "systems"
  registerLocale(lang: string, dictionary: Record<string, string>): void; // право "locales"
  registerTheme(theme: { id: string; name: LocalizedString; vars: Record<string, string> }): void; // право "themes"
  registerCommand(command: {                                         // право "commands"
    id: string; title: LocalizedString; keywords?: string[];
    run(ctx: { lang: string; notify(message: string): void;
      roll(formula: string): { value: unknown; text: string };
      openPage(page: "workspace" | "dice" | "formulas" | "plugins" | "help" | "about"): void }): void | Promise<void>;
  }): void;
  registerDicePreset(preset: { label: LocalizedString; formula: string }): void;   // право "dice"
  storage: { get(key: string): unknown; set(key: string, value: unknown): void };  // право "storage", до 256 КБ
  settings: { get(id: string): unknown };                            // значения из "settings" манифеста
  log(...args: unknown[]): void;
}

interface PluginModule { activate(host: PluginHost): void | Promise<void>; }

interface PluginManifest {
  id: string;                    // a-z, 0-9, "-" и "."; уникален
  name: LocalizedString;
  version: string;               // "1.0.0"
  apiVersion: 1;
  description?: LocalizedString;
  author?: string;
  homepage?: string;
  minAppVersion?: string;        // например "0.1.0"
  main?: string;                 // "index.js"; можно не указывать, если у плагина только панели
  permissions: ("formulas" | "blocks" | "systems" | "locales" | "themes" | "commands" | "dice" | "storage" | "ui" | "project.read" | "project.write")[];
  panels?: Array<{ id: string; title: LocalizedString; entry: string; placement: "page" | "right" | "bottom" }>;  // право "ui"; entry — .html внутри папки
  settings?: Array<{
    id: string; type: "number" | "text" | "boolean" | "select"; label: LocalizedString; description?: LocalizedString;
    default?: unknown; min?: number; max?: number; options?: { value: string; label: LocalizedString }[];
  }>;
}

interface GameSystem {
  schema: 1; id: string; name: LocalizedString; version: string; description?: LocalizedString;
  macros?: { name: string; params: string[]; formula: string }[];
  /** бестиарий: заготовки существ и объектов, которые мастер добавляет в кампанию одним нажатием */
  bestiary?: { id: string; typeId: string; name: string; values: Record<string, unknown>; notes?: string }[];
  entityTypes: Array<{
    id: string; label: LocalizedString;
    category: "character" | "creature" | "vehicle" | "structure" | "settlement" | "item" | "location" | "faction" | "custom";
    initiative?: string;
    fields: Array<{ id: string; label: LocalizedString; type: "number" | "text" | "longtext" | "boolean" | "select" | "resource" | "list" | "reference" | "image";
      group?: string; default?: unknown; min?: number; max?: number; formula?: string; options?: { value: string; label: LocalizedString }[]; refType?: string; description?: LocalizedString }>;
    actions?: Array<{ id: string; label: LocalizedString; formula: string;
      inputs?: { id: string; label: LocalizedString; type: "number" | "text" | "boolean"; default?: unknown }[];
      effects?: { field: string; op: "set" | "add"; formula: string }[] }>;
    cardViews: Array<{ id: string; name: LocalizedString; theme?: "night" | "parchment" | "steel" | "emerald" | "crimson";
      background?: { color?: string; image?: string; fit?: "cover" | "contain" | "tile"; opacity?: number };
      blocks: Array<{ id: string; kind: "heading" | "field" | "text" | "divider" | "image" | "bar" | "actions" | string;
        x: number; y: number; w: number; h: number; field?: string; props?: Record<string, unknown> }> }>;
  }>;
}

/** Объект window.rolepi, который есть на странице панели после <script src="@sdk.js"></script>. Все вызовы асинхронные. */
interface RolepiPanelSdk {
  ready: Promise<{ lang: string; appVersion: string }>;
  lang(): string;
  on(event: "selection" | "theme", cb: (data: any) => void): () => void;      // selection: { kind: "system" | "campaign", id } | null
  notify(message: string): Promise<true>;                                       // право "ui"
  openPage(page: "workspace" | "dice" | "formulas" | "plugins" | "data" | "help" | "about"): Promise<true>;  // право "ui"
  roll(formula: string): Promise<{ value: unknown; text: string }>;              // право "dice"
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<true> };  // право "storage", до 256 КБ
  project: {                                                                    // читать — право "project.read", писать — "project.write"
    selection(): Promise<{ kind: "system" | "campaign"; id: string } | null>;
    listSystems(): Promise<{ id: string; name: string; locked: boolean; types: { id: string; label: string; category: string }[] }[]>;
    getSystem(id: string): Promise<GameSystem>;
    listCampaigns(): Promise<{ id: string; name: string; systemId: string; entities: number; notes: number }[]>;
    getCampaign(id: string): Promise<{ id: string; name: string; systemId: string; entities: { id: string; typeId: string; name: string; values: Record<string, unknown> }[]; notes: { id: string; title: string; body: string }[] }>;
    createNote(campaignId: string, note: { title: string; body?: string }): Promise<{ id: string }>;
    createEntity(campaignId: string, entity: { typeId: string; name: string; values?: Record<string, unknown> }): Promise<{ id: string }>;
    updateEntityValues(campaignId: string, entityId: string, values: Record<string, unknown>): Promise<true>;
    createSystem(system: GameSystem): Promise<{ id: string }>;                   // id назначается заново, защита снимается
  };
}
declare const rolepi: RolepiPanelSdk;
