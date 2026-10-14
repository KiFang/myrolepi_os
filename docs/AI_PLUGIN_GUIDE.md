# Rolepi — руководство по плагинам (API v1)

> Этот файл — для людей и для нейросетей. Если вы человек: скопируйте его (или кнопку «Скопировать запрос» на странице «Плагины» в приложении) нейросети вместе с описанием желаемого плагина. Если вы нейросеть: прочитайте раздел 1 и следуйте ему буквально.

## 1. Инструкция для нейросети

Ты пишешь плагин для настольного приложения Rolepi (конструктор ролевых систем). Плагин — **папка с двумя файлами**: `plugin.json` и `index.js`.

**Формат ответа** — строго такой:
1. Одно предложение: что делает плагин.
2. Блок кода `plugin.json`.
3. Блок кода `index.js`.
4. (необязательно) 2–4 строки: как попробовать.

**Жёсткие правила:**
- Только JavaScript (ES2020), один файл `index.js` в формате `module.exports = { activate(host) { ... } }`. Никаких `import`/`require`, TypeScript, сборщиков и внешних библиотек.
- Доступны только объект `host` и стандартные возможности языка (`Math`, `JSON`, `Date`, `Intl`, `Array`, `Object`, `String`, `Number`). **Недоступны**: `window`, `document`, `fetch`, `XMLHttpRequest`, `localStorage`, `process`, `require`, `Function`, `navigator` — они закрыты. Для хранения данных есть `host.storage`.
- Случайность — только через `ctx.rng()` (в функциях формул) или формулы с кубиками. **Не** используй `Math.random()`.
- Заявляй в `permissions` только то, чем реально пользуешься. Вызов без права завершает загрузку плагина ошибкой.
- Все тексты, видимые пользователю, давай на двух языках: `{ "ru": "...", "en": "..." }`.
- Функции формул должны быть чистыми и быстрыми: возвращают число, строку, true/false, список чисел или `null`; не меняют внешнее состояние (кроме `host.storage`), не бросают исключения без понятного сообщения.
- `id` плагина — латиница в нижнем регистре, цифры, `-` и `.`; `apiVersion` всегда `1`.
- Не придумывай методов, которых нет в разделе 5.

**Перед ответом проверь по списку в разделе 9.**

## 2. Как устроен плагин

```
my-plugin/
  plugin.json   ← описание: название, права, настройки
  index.js      ← код
```
Папку кладут в каталог плагинов (кнопка «Открыть папку плагинов»). После «Перезагрузить» плагин появляется в списке и **просит разрешение**: пользователь видит, какие права он запрашивает. Если код плагина изменился, разрешение запрашивается заново.

Плагин выполняется с правами приложения: изоляции в песочнице нет, закрытые имена (`window`, `fetch`…) — защита от случайностей, а не от злого умысла. Поэтому пишите честные плагины и не просите лишних прав.

## 3. plugin.json

| Поле | Обязательно | Описание |
|---|---|---|
| `id` | да | Уникальное имя: `a-z`, `0-9`, `-`, `.` |
| `name` | да | Название: строка или `{ "ru": "...", "en": "..." }` |
| `version` | да | Версия плагина, например `"1.0.0"` |
| `apiVersion` | да | Всегда `1` |
| `main` | да | Файл кода, обычно `"index.js"` (без `..`, внутри папки) |
| `permissions` | да | Список прав (раздел 4) |
| `description` | нет | Что делает плагин (две локализации) |
| `author`, `homepage` | нет | Автор и ссылка |
| `minAppVersion` | нет | Минимальная версия приложения, например `"0.1.0"` |
| `settings` | нет | Настройки, которые приложение нарисует само (раздел 6) |

## 4. Права (`permissions`)

| Право | Что даёт |
|---|---|
| `formulas` | `registerFormulaFunction` — свои функции в формулах |
| `blocks` | `registerBlock` — свои блоки в карточках |
| `systems` | `registerSystem` — готовые игровые системы |
| `locales` | `registerLocale` — переводы и новые языки |
| `themes` | `registerTheme` — темы оформления |
| `commands` | `registerCommand` — команды в палитре (Ctrl+K) |
| `dice` | `registerDicePreset` — пресеты на странице «Кубики» |
| `storage` | `host.storage` — личное хранилище плагина |

`host.settings.get`, `host.lang`, `host.log` права не требуют.

## 5. Справочник по `host`

```js
module.exports = {
  activate(host) { /* регистрируем возможности; можно async */ },
};
```
Если `activate` выбросит ошибку или будет выполняться дольше 3 секунд, плагин не загрузится, а всё, что он успел зарегистрировать, откатывается.

### `host.registerFormulaFunction(name, fn, info?)` — право `formulas`
Добавляет функцию в формулы: `name(...)`. Имя: `a-z`, `0-9`, `_`, с буквы, **не совпадает со встроенными** (`floor ceil round abs sqrt min max sum avg clamp if len roll`) и чужими.
`fn(args, ctx)` получает уже посчитанные аргументы (`args` — массив) и возвращает число / строку / true / false / список чисел / `null`. `ctx.rng()` — случайное [0,1).
`info` (необязательно) попадает в справочник: `{ description: {ru,en}, example: "percent(40)" }`.
```js
host.registerFormulaFunction('percent', (args, ctx) => ctx.rng() * 100 < Number(args[0]), {
  description: { ru: 'Истина с шансом в процентах', en: 'True with the chance in percent' },
  example: 'percent(40)',
});
```

### `host.registerBlock({ kind, label, render })` — право `blocks`
Новый блок карточки (появляется в конструкторе). `kind`: `a-z`, `0-9`, `-`, не совпадает со встроенными (`heading field text divider image bar actions`).
`render({ values, props, lang })` возвращает **строку HTML**. `values` — посчитанные параметры объекта, `props` — настройки блока, `lang` — `"ru"`/`"en"`.
HTML **очищается**: остаются теги `b i u em strong span div p br ul ol li small h1 h2 h3 h4 hr table thead tbody tr td th code` и атрибуты `class`, `title`. Ссылки, картинки, `style`, скрипты и обработчики событий вырезаются.
```js
host.registerBlock({
  kind: 'stars', label: { ru: 'Звёзды', en: 'Stars' },
  render: ({ values }) => '<b>' + '★'.repeat(Math.min(5, Number(values.level) || 1)) + '</b>',
});
```

### `host.registerSystem(system)` — право `systems`
Добавляет готовую игровую систему (появится на экране приветствия кнопкой «Из плагина»). Формат — `GameSystem` из раздела 7. Система проверяется; с ошибкой плагин не загрузится.

### `host.registerLocale(lang, dictionary)` — право `locales`
Переводы: `host.registerLocale('de', { 'ws.save': 'Speichern' })`. Ключи интерфейса приложения можно переопределять; новые языки появятся в переключателе.

### `host.registerTheme({ id, name, vars })` — право `themes`
Тема оформления. `id`: `a-z`, `0-9`, `-`. `vars` — CSS-переменные с цветами `#rrggbb`:
`--sunken` (самый тёмный фон), `--bg`, `--panel`, `--surface`, `--panel2`, `--border`, `--border-strong`, `--hover`, `--fg` (текст), `--muted` (второстепенный текст), `--accent`, `--accent-strong`, `--accent-ink` (текст на ярком фоне), `--selected`. Не заданные берутся из темы «Ночь». Для светлой темы добавьте `"--scheme": "light"` и светлые значения.

### `host.registerCommand({ id, title, keywords?, run })` — право `commands`
Команда в палитре (Ctrl+K). `run(ctx)`, где `ctx`: `lang`, `notify(текст)` — уведомление, `roll("2d6 + 3")` → `{ value, text }`, `openPage('dice' | 'formulas' | 'plugins' | 'help' | 'about' | 'workspace')`.

### `host.registerDicePreset({ label, formula })` — право `dice`
Кнопка на странице «Кубики». `formula` проверяется заранее.

### `host.storage` — право `storage`
`get(key)` / `set(key, value)`. Значения — только JSON-совместимые, всего до 256 КБ. Данные хранятся на компьютере пользователя отдельно для каждого плагина.

### `host.settings.get(id)`
Значение настройки, объявленной в `plugin.json` (или её `default`).

### Остальное
`host.lang()` — текущий язык; `host.appVersion`; `host.log(...)` — вывод в консоль разработчика.

## 6. Настройки плагина

В `plugin.json`:
```json
"settings": [
  { "id": "bonus", "type": "number", "label": { "ru": "Бонус", "en": "Bonus" }, "default": 0, "min": -50, "max": 50 },
  { "id": "mode", "type": "select", "label": { "ru": "Режим", "en": "Mode" }, "default": "fast",
    "options": [{ "value": "fast", "label": { "ru": "Быстро", "en": "Fast" } }, { "value": "full", "label": { "ru": "Полно", "en": "Full" } }] }
]
```
Типы: `number`, `text`, `boolean`, `select`. Приложение само нарисует форму на карточке плагина; код читает `host.settings.get('bonus')` **в момент вызова** (значение может меняться без перезапуска).

## 7. Формат игровой системы (для `registerSystem`)

Полное описание типов — в приложении в конце файла. Коротко:
- **Система** → `entityTypes` (типы объектов), `macros` (свои функции формул: `{ name, params, formula }`).
- **Тип** → `fields` (параметры), `actions` (действия), `cardViews` (виды карточки), `initiative` (формула инициативы).
- **Параметр** (`field`): `id` (имя в формулах), `label`, `type` (`number text longtext boolean select resource list reference image`), `default`, `formula` (если задана — значение считается само), `min`/`max`, `options` (для `select`).
- **Действие**: `formula` (бросок), `inputs` (что спросить), `effects` (`{ field, op: "add"|"set", formula }` — в формуле эффекта `result` = итог броска).
- **Вид карточки**: `theme` (`night parchment steel emerald crimson`), `background`, `blocks` — сетка из 12 столбцов, высота строки 40px; блок: `{ id, kind, x, y, w, h, field?, props? }`.
  Встроенные блоки: `heading` (имя, `props.size: "l"`), `field` (`field`), `bar` (`field` + `props.maxField` или `props.max`), `text` (`props.text`), `divider`, `image`, `actions`.
- **Формулы**: `+ - * / % ^`, сравнения, `&& || !`, `a ? b : c`, функции, кубики (`2d6`, `4d6kh3`, `3d6!`), имена параметров, пути `a.b`.

Минимальная рабочая система:
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

## 8. Рецепты

**Функция с настройкой и счётчиком** (`permissions: ["formulas", "storage"]`):
```js
module.exports = { activate(host) {
  host.registerFormulaFunction('crit', (args, ctx) => {
    host.storage.set('calls', Number(host.storage.get('calls') || 0) + 1);
    const roll = Number(args[0]);
    return roll >= Number(host.settings.get('threshold') || 20) ? Number(args[1]) * 2 : Number(args[1]);
  }, { example: 'crit(1d20, 8)', description: { ru: 'Удваивает урон при критическом броске', en: 'Doubles damage on a critical roll' } });
} };
```
**Тема** (`["themes"]`): `host.registerTheme({ id: 'sunset', name: { ru: 'Закат', en: 'Sunset' }, vars: { '--bg': '#1b1019', '--accent': '#ffb067', ... } })`.
**Команда** (`["commands"]`): `host.registerCommand({ id: 'd20', title: { ru: 'Бросить d20', en: 'Roll d20' }, run: (ctx) => ctx.notify(ctx.roll('1d20').text) })`.
**Перевод** (`["locales"]`): `host.registerLocale('en', { 'help.title': 'Handbook' })`.

## 9. Проверочный список перед ответом

- [ ] В ответе ровно два файла: `plugin.json` и `index.js`; код — `module.exports = { activate(host) {...} }`.
- [ ] `apiVersion: 1`, `id` в нижнем регистре, есть `name`, `version`, `main`, `permissions`.
- [ ] Каждый вызванный `host.register…`/`host.storage` покрыт правом в `permissions`; лишних прав нет.
- [ ] Нет `Math.random`, `window`, `document`, `fetch`, `require`, `import`.
- [ ] Функции формул возвращают допустимые значения (число, строка, true/false, список чисел, `null`).
- [ ] Имена функций и блоков не совпадают со встроенными.
- [ ] Видимые тексты — на `ru` и `en`.
- [ ] HTML блоков использует только разрешённые теги и `class`/`title`.

## 10. Если что-то не работает

| Сообщение на странице «Плагины» | Причина |
|---|---|
| Нужно разрешение | Плагин новый или его код изменился — нажмите «Разрешить и включить» |
| Плагин не заявил право "…" | Добавьте право в `permissions` |
| Функция "…" уже существует | Имя занято встроенной или чужой функцией — выберите другое |
| …вернула недопустимый результат | Верните число, строку, true/false, список чисел или `null` |
| Нужна версия приложения … | Обновите приложение или уменьшите `minAppVersion` |
| Плагин слишком долго запускается | `activate` работает дольше 3 секунд — не делайте тяжёлых вычислений при запуске |

Подробности ошибок и `host.log` видны в консоли разработчика (Ctrl+Shift+I в окне приложения).

## Приложение: описание API на TypeScript

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
