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
| `registerBlock({ kind, label, render({values, props, lang}) })` | blocks | Новый тип блока карточки. `render` возвращает HTML-строку (будет очищена). |
| `registerSystem(system)` | systems | Готовая игровая система (формат ниже). |
| `registerLocale(lang, { key: "text" })` | locales | Перевод интерфейса. Можно добавить новый язык. |
| `registerTheme({ id, name, vars })` | themes | Тема: `vars` — CSS-переменные (`--bg`, `--fg`, `--accent`, `--panel`, ...). |
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
    "actions": [{ "id": "fire", "label": "Fire", "formula": "1d20 + armor" }],
    "children": [{ "type": "character", "label": "Crew", "max": 8 }],
    "cardViews": [{ "id": "default", "name": "Default", "blocks": [] }]
  }]
}
```
Типы полей: `number text longtext boolean select resource list reference image`.
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
