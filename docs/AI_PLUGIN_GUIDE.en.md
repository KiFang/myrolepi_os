# Rolepi — plugin guide (API v1)

> This file is for people and for AIs. If you are a person: give it (or use the “Copy the prompt” button on the Plugins page of the app) to an AI together with a description of the plugin you want. If you are an AI: read section 1 and follow it literally.

## 1. Instructions for the AI

You are writing a plugin for the Rolepi desktop app (a tabletop RPG system builder). A plugin is **a folder with two files**: `plugin.json` and `index.js`.

**Answer format** — exactly this:
1. One sentence: what the plugin does.
2. A `plugin.json` code block.
3. An `index.js` code block.
4. (optional) 2–4 lines on how to try it.

**Hard rules:**
- Plain JavaScript (ES2020), a single `index.js` shaped as `module.exports = { activate(host) { ... } }`. No `import`/`require`, TypeScript, bundlers or external libraries.
- Only the `host` object and standard language features are available (`Math`, `JSON`, `Date`, `Intl`, `Array`, `Object`, `String`, `Number`). **Not available**: `window`, `document`, `fetch`, `XMLHttpRequest`, `localStorage`, `process`, `require`, `Function`, `navigator` — they are closed. Use `host.storage` to keep data.
- Randomness only through `ctx.rng()` (in formula functions) or dice formulas. **Never** use `Math.random()`.
- Declare in `permissions` only what you actually use. A call without the permission fails the plugin's load.
- Every user-visible text must be provided in two languages: `{ "ru": "...", "en": "..." }`.
- Formula functions must be pure and fast: return a number, a string, true/false, a list of numbers or `null`; never change outside state (except `host.storage`); never throw without a clear message.
- The plugin `id` is lower-case Latin letters, digits, `-` and `.`; `apiVersion` is always `1`.
- Do not invent methods that are not in section 5.

**Before answering, run through the checklist in section 9.**

## 2. How a plugin is organised

```
my-plugin/
  plugin.json   ← description: name, permissions, settings
  index.js      ← code
```
The folder goes into the plugins directory (the “Open plugins folder” button). After “Reload” the plugin appears in the list and **asks for permission**: the user sees which rights it requests. If the plugin's code changes, permission is requested again.

A plugin runs with the app's privileges: there is no sandbox isolation, and the closed names (`window`, `fetch`…) protect against accidents, not against malice. So write honest plugins and do not ask for extra permissions.

## 3. plugin.json

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique name: `a-z`, `0-9`, `-`, `.` |
| `name` | yes | Name: a string or `{ "ru": "...", "en": "..." }` |
| `version` | yes | Plugin version, e.g. `"1.0.0"` |
| `apiVersion` | yes | Always `1` |
| `main` | yes | The code file, usually `"index.js"` (no `..`, inside the folder) |
| `permissions` | yes | List of permissions (section 4) |
| `description` | no | What the plugin does (two languages) |
| `author`, `homepage` | no | Author and link |
| `minAppVersion` | no | Minimum app version, e.g. `"0.1.0"` |
| `settings` | no | Settings the app draws itself (section 6) |

## 4. Permissions (`permissions`)

| Permission | What it gives |
|---|---|
| `formulas` | `registerFormulaFunction` — your own functions in formulas |
| `blocks` | `registerBlock` — your own blocks on cards |
| `systems` | `registerSystem` — ready-made game systems |
| `locales` | `registerLocale` — translations and new languages |
| `themes` | `registerTheme` — colour themes |
| `commands` | `registerCommand` — commands in the palette (Ctrl+K) |
| `dice` | `registerDicePreset` — presets on the Dice page |
| `storage` | `host.storage` — the plugin's private storage |

`host.settings.get`, `host.lang` and `host.log` need no permission.

## 5. `host` reference

```js
module.exports = {
  activate(host) { /* register capabilities; may be async */ },
};
```
If `activate` throws or takes longer than 3 seconds, the plugin does not load and everything it managed to register is rolled back.

### `host.registerFormulaFunction(name, fn, info?)` — permission `formulas`
Adds a function to formulas: `name(...)`. Name: `a-z`, `0-9`, `_`, starting with a letter, **not equal to built-ins** (`floor ceil round abs sqrt min max sum avg clamp if len roll`) or other plugins' functions.
`fn(args, ctx)` receives already-evaluated arguments (`args` is an array) and returns a number / string / true / false / list of numbers / `null`. `ctx.rng()` is a random number in [0,1).
`info` (optional) goes into the reference: `{ description: {ru,en}, example: "percent(40)" }`.
```js
host.registerFormulaFunction('percent', (args, ctx) => ctx.rng() * 100 < Number(args[0]), {
  description: { ru: 'Истина с шансом в процентах', en: 'True with the chance in percent' },
  example: 'percent(40)',
});
```

### `host.registerBlock({ kind, label, render })` — permission `blocks`
A new card block (it appears in the card designer). `kind`: `a-z`, `0-9`, `-`, not equal to built-ins (`heading field text divider image bar actions`).
`render({ values, props, lang })` returns an **HTML string**. `values` are the object's calculated parameters, `props` are the block's settings, `lang` is `"ru"`/`"en"`.
The HTML is **sanitised**: only the tags `b i u em strong span div p br ul ol li small h1 h2 h3 h4 hr table thead tbody tr td th code` and the attributes `class`, `title` are kept. Links, images, `style`, scripts and event handlers are removed.
```js
host.registerBlock({
  kind: 'stars', label: { ru: 'Звёзды', en: 'Stars' },
  render: ({ values }) => '<b>' + '★'.repeat(Math.min(5, Number(values.level) || 1)) + '</b>',
});
```

### `host.registerSystem(system)` — permission `systems`
Adds a ready-made game system (it appears on the welcome screen as “From a plugin”). The format is `GameSystem` from section 7. The system is validated; with an error the plugin does not load.

### `host.registerLocale(lang, dictionary)` — permission `locales`
Translations: `host.registerLocale('de', { 'ws.save': 'Speichern' })`. App interface keys can be overridden; new languages appear in the language switch.

### `host.registerTheme({ id, name, vars })` — permission `themes`
A colour theme. `id`: `a-z`, `0-9`, `-`. `vars` are CSS variables with `#rrggbb` colours:
`--sunken` (darkest background), `--bg`, `--panel`, `--surface`, `--panel2`, `--border`, `--border-strong`, `--hover`, `--fg` (text), `--muted` (secondary text), `--accent`, `--accent-strong`, `--accent-ink` (text on a bright background), `--selected`. Unset ones come from the “Night” theme. For a light theme add `"--scheme": "light"` and light values.

### `host.registerCommand({ id, title, keywords?, run })` — permission `commands`
A command in the palette (Ctrl+K). `run(ctx)`, where `ctx` has: `lang`, `notify(text)` — a notification, `roll("2d6 + 3")` → `{ value, text }`, `openPage('dice' | 'formulas' | 'plugins' | 'help' | 'about' | 'workspace')`.

### `host.registerDicePreset({ label, formula })` — permission `dice`
A button on the Dice page. The `formula` is validated up front.

### `host.storage` — permission `storage`
`get(key)` / `set(key, value)`. Values must be JSON-compatible, 256 KB in total. Data is kept on the user's computer separately for each plugin.

### `host.settings.get(id)`
The value of a setting declared in `plugin.json` (or its `default`).

### The rest
`host.lang()` — the current language; `host.appVersion`; `host.log(...)` — output to the developer console.

## 6. Plugin settings

In `plugin.json`:
```json
"settings": [
  { "id": "bonus", "type": "number", "label": { "ru": "Бонус", "en": "Bonus" }, "default": 0, "min": -50, "max": 50 },
  { "id": "mode", "type": "select", "label": { "ru": "Режим", "en": "Mode" }, "default": "fast",
    "options": [{ "value": "fast", "label": { "ru": "Быстро", "en": "Fast" } }, { "value": "full", "label": { "ru": "Полно", "en": "Full" } }] }
]
```
Types: `number`, `text`, `boolean`, `select`. The app draws the form on the plugin's card by itself; the code reads `host.settings.get('bonus')` **at call time** (the value can change without a restart).

## 7. Game system format (for `registerSystem`)

The full type description is in the appendix at the end of the file. In short:
- **System** → `entityTypes` (object types), `macros` (your own formula functions: `{ name, params, formula }`).
- **Type** → `fields` (parameters), `actions`, `cardViews` (card views), `initiative` (initiative formula).
- **Parameter** (`field`): `id` (the name in formulas), `label`, `type` (`number text longtext boolean select resource list reference image`), `default`, `formula` (if set the value is calculated automatically), `min`/`max`, `options` (for `select`).
- **Action**: `formula` (the roll), `inputs` (what to ask), `effects` (`{ field, op: "add"|"set", formula }` — in an effect formula `result` is the roll total).
- **Card view**: `theme` (`night parchment steel emerald crimson`), `background`, `blocks` — a 12-column grid, row height 40px; a block is `{ id, kind, x, y, w, h, field?, props? }`.
  Built-in blocks: `heading` (the name, `props.size: "l"`), `field` (`field`), `bar` (`field` + `props.maxField` or `props.max`), `text` (`props.text`), `divider`, `image`, `actions`.
- **Formulas**: `+ - * / % ^`, comparisons, `&& || !`, `a ? b : c`, functions, dice (`2d6`, `4d6kh3`, `3d6!`), parameter names, paths `a.b`.

A minimal working system:
```js
host.registerSystem({
  schema: 1, id: 'mini', name: { ru: 'Мини', en: 'Mini' }, version: '1.0.0',
  entityTypes: [{
    id: 'hero', label: { ru: 'Герой', en: 'Hero' }, category: 'character',
    fields: [
      { id: 'level', label: { ru: 'Уровень', en: 'Level' }, type: 'number', default: 1 },
      { id: 'max_hp', label: { ru: 'Макс. здоровье', en: 'Max health' }, type: 'number', formula: '10 + level * 4' },
      { id: 'hp', label: { ru: 'Здоровье', en: 'Health' }, type: 'resource', default: 14 },
    ],
    actions: [{ id: 'hit', label: { ru: 'Удар', en: 'Hit' }, formula: '1d20 + level' }],
    cardViews: [{ id: 'main', name: { ru: 'Карточка', en: 'Card' }, theme: 'night', blocks: [
      { id: 'h', kind: 'heading', x: 0, y: 0, w: 12, h: 2 },
      { id: 'b', kind: 'bar', x: 0, y: 2, w: 12, h: 2, field: 'hp', props: { maxField: 'max_hp' } },
      { id: 'a', kind: 'actions', x: 0, y: 4, w: 12, h: 2 },
    ] }],
  }],
});
```

## 8. Recipes

**A function with a setting and a counter** (`permissions: ["formulas", "storage"]`):
```js
module.exports = { activate(host) {
  host.registerFormulaFunction('crit', (args, ctx) => {
    host.storage.set('calls', Number(host.storage.get('calls') || 0) + 1);
    const roll = Number(args[0]);
    return roll >= Number(host.settings.get('threshold') || 20) ? Number(args[1]) * 2 : Number(args[1]);
  }, { example: 'crit(1d20, 8)', description: { ru: 'Удваивает урон при критическом броске', en: 'Doubles damage on a critical roll' } });
} };
```
**A theme** (`["themes"]`): `host.registerTheme({ id: 'sunset', name: { ru: 'Закат', en: 'Sunset' }, vars: { '--bg': '#1b1019', '--accent': '#ffb067', ... } })`.
**A command** (`["commands"]`): `host.registerCommand({ id: 'd20', title: { ru: 'Бросить d20', en: 'Roll d20' }, run: (ctx) => ctx.notify(ctx.roll('1d20').text) })`.
**A translation** (`["locales"]`): `host.registerLocale('en', { 'help.title': 'Handbook' })`.

## 9. Checklist before answering

- [ ] The answer has exactly two files: `plugin.json` and `index.js`; the code is `module.exports = { activate(host) {...} }`.
- [ ] `apiVersion: 1`, lower-case `id`, and `name`, `version`, `main`, `permissions` are present.
- [ ] Every `host.register…`/`host.storage` call is covered by a permission in `permissions`; there are no extra permissions.
- [ ] No `Math.random`, `window`, `document`, `fetch`, `require`, `import`.
- [ ] Formula functions return valid values (a number, a string, true/false, a list of numbers, `null`).
- [ ] Function and block names do not clash with the built-in ones.
- [ ] Visible texts exist in `ru` and `en`.
- [ ] Block HTML uses only the allowed tags and `class`/`title`.

## 10. If something does not work

| Message on the Plugins page | Cause |
|---|---|
| Needs permission | The plugin is new or its code changed — press “Allow and enable” |
| The plugin did not declare the "…" permission | Add the permission to `permissions` |
| The function "…" already exists | The name is taken by a built-in or another plugin's function — choose another |
| …returned an invalid result | Return a number, a string, true/false, a list of numbers or `null` |
| App version … or newer is required | Update the app or lower `minAppVersion` |
| The plugin takes too long to start | `activate` runs longer than 3 seconds — avoid heavy work at start |

Error details and `host.log` output are visible in the developer console (Ctrl+Shift+I in the app window).

## Appendix: the API in TypeScript

```ts
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
  main: string;                  // "index.js"
  permissions: ("formulas" | "blocks" | "systems" | "locales" | "themes" | "commands" | "dice" | "storage")[];
  settings?: Array<{
    id: string; type: "number" | "text" | "boolean" | "select"; label: LocalizedString; description?: LocalizedString;
    default?: unknown; min?: number; max?: number; options?: { value: string; label: LocalizedString }[];
  }>;
}

interface GameSystem {
  schema: 1; id: string; name: LocalizedString; version: string; description?: LocalizedString;
  macros?: { name: string; params: string[]; formula: string }[];
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
```
