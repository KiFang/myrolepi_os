# AI Plugin Guide — MyRolePi OS (API v1)

> Отдайте этот файл нейросети вместе с описанием желаемого плагина. / Give this file to an AI along with a description of the plugin you want.

## Задача для ИИ
Ты пишешь плагин для MyRolePi OS. Результат — **папка** с двумя файлами: `plugin.json` и `index.js`.
Пиши на чистом JavaScript (CommonJS, без import/require, без внешних библиотек, без доступа к сети и файлам).
Ответь двумя блоками кода: содержимое `plugin.json` и содержимое `index.js`. Не добавляй ничего лишнего.

## plugin.json
```json
{
  "id": "my-plugin",              // a-z, 0-9, "-" и "."; уникален
  "name": { "ru": "Название", "en": "Name" },
  "version": "1.0.0",
  "apiVersion": 1,                // всегда 1
  "description": { "ru": "...", "en": "..." },
  "main": "index.js",             // относительный путь внутри папки
  "permissions": ["formulas"]     // только то, что реально используется
}
```
Права: `formulas`, `blocks`, `systems`, `locales`, `themes`, `ui`, `storage`.
Вызов API без заявленного права приводит к ошибке загрузки плагина.

## index.js
```js
module.exports = {
  activate(host) { /* регистрируем возможности */ },
  deactivate() {}   // необязательно
};
```

## Объект `host`
| Метод | Право | Что делает |
|---|---|---|
| `registerFormulaFunction(name, (args, ctx) => value)` | formulas | Новая функция формул. `args` — уже вычисленные аргументы, `ctx.rng()` — случайное число [0,1) (используй его, а не Math.random), `ctx.rolls` — журнал бросков. Возвращает число, строку, boolean или массив чисел. |
| `registerBlock({ kind, label, render({values, props, lang}) })` | blocks | Новый тип блока карточки; он появится в палитре конструктора карточек. `values` — вычисленные параметры объекта, `props` — настройки блока, `lang` — `ru`/`en`. `render` возвращает HTML-строку. Она **очищается**: остаются только теги `b i u em strong span div p br ul ol li small h1-h4 hr table thead tbody tr td th code` и атрибуты `class`, `title`. Скрипты, ссылки, картинки, `style` и обработчики событий вырезаются. |
| `registerSystem(system)` | systems | Готовая игровая система (формат ниже). |
| `registerLocale(lang, { key: "text" })` | locales | Перевод интерфейса. Можно добавить новый язык. |
| `registerTheme({ id, name, vars })` | themes | Тема оформления приложения. `vars` — CSS-переменные: `--sunken --bg --panel --surface --panel2 --border --border-strong --hover --fg --muted --accent --accent-strong --accent-ink --selected` (цвета `#rrggbb`). Не заданные берутся из темы «Ночь». Для светлой темы добавьте `"--scheme": "light"`. |
| `log(...)` | — | Лог в консоль. |

## Формат системы (GameSystem) — кратко
```jsonc
{
  "schema": 1, "id": "my-system", "name": {"ru":"..","en":".."}, "version": "1.0.0",
  "macros": [{ "name": "mod", "params": ["score"], "formula": "floor((score - 10) / 2)" }],
  "entityTypes": [{
    "id": "starship", "label": {"ru":"Корабль","en":"Starship"},
    "category": "vehicle",     // character|creature|vehicle|structure|settlement|item|location|faction|custom
    "fields": [
      { "id": "hull", "label": "Hull", "type": "number", "default": 100 },
      { "id": "armor", "label": "Armor", "type": "number", "formula": "floor(hull / 20)" }
    ],
    "initiative": "1d20 + level",          // формула инициативы для трекера боя (по умолчанию 1d20)
    "actions": [
      { "id": "fire", "label": {"ru":"Выстрел","en":"Fire"}, "formula": "1d20 + armor" },
      { "id": "damage", "label": "Damage", "formula": "amount",
        "inputs": [{ "id": "amount", "label": "Amount", "type": "number", "default": 3 }],       // спросить при броске
        "effects": [{ "field": "hull", "op": "add", "formula": "-result" }] }                   // result — итог броска; op: add | set
    ],
    "children": [{ "type": "character", "label": "Crew", "max": 8 }],
    "cardViews": [{
      "id": "default", "name": {"ru":"Паспорт","en":"Card"},
      "theme": "steel",                   // night | parchment | steel | emerald | crimson
      "background": { "color": "#222", "image": "data:image/png;base64,...", "fit": "cover", "opacity": 0.6 },
      "blocks": [                          // сетка 12 столбцов, строка = 40px
        { "id": "b1", "kind": "heading", "x": 0, "y": 0, "w": 12, "h": 2, "props": { "size": "l" } },
        { "id": "b2", "kind": "bar",     "x": 0, "y": 2, "w": 12, "h": 2, "field": "hull", "props": { "max": 100 } },
        { "id": "b3", "kind": "field",   "x": 0, "y": 4, "w": 6,  "h": 2, "field": "armor" },
        { "id": "b4", "kind": "actions", "x": 0, "y": 6, "w": 12, "h": 2 }
      ]
    }]
  }]
}
```
Типы полей: `number text longtext boolean select resource list reference image`.
Встроенные блоки карточек: `heading field text divider image bar actions` (плюс блоки плагинов).
Кампания (`campaign`) хранит `entities`, `notes` и `encounters` (бои с инициативой) — плагинам напрямую не нужна.
Поле с `formula` — вычисляемое. Формулы: см. `docs/FORMULAS.md`.

## Правила
1. Только перечисленный API. Не используй `fetch`, `eval`, `window`, `document`, `require`, `process`.
2. Случайность — только через `ctx.rng()`.
3. Все пользовательские строки — на двух языках (`ru` и `en`) через `{ru, en}` или `registerLocale`.
4. Функции формул не должны бросать исключения без понятного сообщения и не должны менять внешнее состояние.
5. Имена функций формул — латиница в нижнем регистре, без пересечения со встроенными (`floor ceil round abs sqrt min max sum avg clamp if len roll`).

## Пример: функция формул
```js
module.exports = {
  activate(host) {
    // percent(40) -> true с шансом 40%
    host.registerFormulaFunction('percent', (args, ctx) => ctx.rng() * 100 < Number(args[0]));
  }
};
```
(`permissions: ["formulas"]`)

## Шаблон запроса
«Вот AI Plugin Guide. Сделай плагин для MyRolePi OS: <опиши, что нужно>. Выдай plugin.json и index.js.»
