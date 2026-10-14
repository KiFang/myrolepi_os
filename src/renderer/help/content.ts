export type L = { ru: string; en: string };
export type Block =
  | { t: "p"; text: L }
  | { t: "h"; text: L }
  | { t: "list"; items: L[] }
  | { t: "tip"; text: L }
  | { t: "code"; code: string; try?: boolean }
  | { t: "table"; head: [L, L] | [L, L, L]; rows: ([string, L] | [string, string, L])[] }
  | { t: "functions" };

export interface Article { id: string; icon: string; title: L; summary: L; keywords: string; blocks: Block[] }
const l = (ru: string, en: string): L => ({ ru, en });

/** Справочник приложения. Таблица функций («functions») строится автоматически и включает функции плагинов. */
export const ARTICLES: Article[] = [
  {
    id: "start", icon: "studio", title: l("С чего начать", "Getting started"),
    summary: l("Три шага от пустого экрана до первого боя.", "Three steps from an empty screen to your first fight."),
    keywords: "start begin начать пример quickstart",
    blocks: [
      { t: "p", text: l("Откройте «Студию» и нажмите «Посмотреть пример»: вы получите готовую систему «Космическая опера» с карточками, действиями и существом. На ней проще всего разобраться.", "Open the Studio and press “See an example”: you get a ready “Space Opera” system with cards, actions and a creature. It is the easiest way to learn.") },
      { t: "list", items: [
        l("Создайте систему (правила) — типы объектов и их параметры.", "Create a system (the rules): object types and their parameters."),
        l("Создайте кампанию, выберите систему и добавьте героев и существ.", "Create a campaign, pick a system and add heroes and creatures."),
        l("Бросайте действия, ведите бой на вкладке «Бой», записывайте заметки.", "Roll actions, run fights on the Combat tab, keep notes."),
      ] },
      { t: "tip", text: l("Нажмите Ctrl+K — палитра команд: из неё можно быстро создать систему, сменить тему или язык, перейти в любой раздел.", "Press Ctrl+K for the command palette: create a system, change theme or language, or jump to any section.") },
    ],
  },
  {
    id: "concepts", icon: "system", title: l("Как всё устроено", "How it fits together"),
    summary: l("Система, тип, параметр, кампания — что есть что.", "System, type, parameter, campaign — what is what."),
    keywords: "system type parameter campaign система тип параметр кампания",
    blocks: [
      { t: "table", head: [l("Понятие", "Concept"), l("Что это", "What it is")], rows: [
        ["system", l("Игровая система — правила вашей игры. Хранит типы, их параметры, формулы, карточки и действия.", "A game system — the rules of your game. It holds types, parameters, formulas, cards and actions.")],
        ["type", l("Тип — вид объектов в игре: персонаж, корабль, город, существо.", "A type is a kind of object: a character, a ship, a city, a creature.")],
        ["parameter", l("Параметр — характеристика типа: сила, броня, население. Может считаться по формуле.", "A parameter is a trait of a type: strength, armor, population. It can be calculated by a formula.")],
        ["campaign", l("Кампания — ваши герои, бои и заметки, сыгранные по правилам выбранной системы.", "A campaign is your heroes, fights and notes, played by the rules of a chosen system.")],
      ] },
      { t: "tip", text: l("Одну систему можно использовать в нескольких кампаниях. Правите правила — все кампании сразу считают по новым.", "One system can serve several campaigns. Change the rules and every campaign recalculates.") },
    ],
  },
  {
    id: "formulas", icon: "formula", title: l("Формулы", "Formulas"),
    summary: l("Операторы, переменные и функции — со всеми примерами.", "Operators, variables and functions, with examples."),
    keywords: "formula function operator формула функция оператор переменная floor min max if",
    blocks: [
      { t: "p", text: l("Если у параметра есть формула, его значение считается само. В формуле можно использовать числа, имена других параметров, кубики и функции.", "If a parameter has a formula, its value is calculated automatically. A formula can use numbers, other parameters' names, dice and functions.") },
      { t: "h", text: l("Примеры", "Examples") },
      { t: "code", code: "8 + level * 4", try: true },
      { t: "code", code: "floor((str - 10) / 2)", try: true },
      { t: "code", code: "2d6 + level", try: true },
      { t: "code", code: "str >= 15 ? 2 : 1", try: true },
      { t: "h", text: l("Операторы", "Operators") },
      { t: "table", head: [l("Запись", "Syntax"), l("Что делает", "What it does")], rows: [
        ["+  -  *  /  %  ^", l("Сложение, вычитание, умножение, деление, остаток, степень.", "Add, subtract, multiply, divide, remainder, power.")],
        ["==  !=  <  >  <=  >=", l("Сравнения. Результат — да или нет.", "Comparisons. The result is yes or no.")],
        ["&&  ||  !", l("«и», «или», «не».", "and, or, not.")],
        ["a ? b : c", l("Если a верно — b, иначе c.", "If a is true — b, otherwise c.")],
        ["ship.hull", l("Путь через точку — для вложенных значений.", "A dotted path for nested values.")],
      ] },
      { t: "h", text: l("Функции", "Functions") },
      { t: "functions" },
      { t: "tip", text: l("Функция if(условие, a, b) считает только выбранную ветку: кубики во второй ветке не бросаются.", "if(condition, a, b) evaluates only the chosen branch: dice in the other branch are not rolled.") },
    ],
  },
  {
    id: "dice", icon: "dice", title: l("Кубики", "Dice"),
    summary: l("Запись бросков: 4d6kh3, взрывные, Fudge.", "Dice notation: 4d6kh3, exploding, Fudge."),
    keywords: "dice roll кубик бросок d20 kh kl explode fudge",
    blocks: [
      { t: "table", head: [l("Запись", "Syntax"), l("Значение", "Meaning")], rows: [
        ["d20, 3d6", l("Обычные кубики: количество d число граней.", "Normal dice: count d sides.")],
        ["d%", l("Процентный кубик (d100).", "Percentile die (d100).")],
        ["4dF", l("Кубики Fudge: каждый даёт −1, 0 или +1.", "Fudge dice: each gives −1, 0 or +1.")],
        ["4d6kh3", l("Бросить 4, оставить 3 лучших.", "Roll 4, keep the best 3.")],
        ["2d20kl1", l("Бросить 2, оставить худший (помеха).", "Roll 2, keep the lowest (disadvantage).")],
        ["4d6dl1", l("Бросить 4, отбросить худший.", "Roll 4, drop the lowest.")],
        ["3d6!", l("Взрывные: максимум — бросаем ещё раз.", "Exploding: a maximum rolls again.")],
      ] },
      { t: "code", code: "4d6kh3 + 2", try: true },
      { t: "tip", text: l("На странице «Кубики» есть готовые пресеты и история бросков. Плагины могут добавлять свои пресеты.", "The Dice page has presets and a roll history. Plugins can add their own presets.") },
    ],
  },
  {
    id: "cards", icon: "campaign", title: l("Карточки", "Cards"),
    summary: l("Как собрать карточку героя или существа.", "How to build a hero or creature card."),
    keywords: "card block карточка блок дизайн фон тема bar шкала",
    blocks: [
      { t: "p", text: l("В системе откройте тип и вкладку «Карточки». Добавляйте блоки кнопками, перетаскивайте их по сетке и тяните за правый нижний угол, чтобы изменить размер. У типа может быть несколько видов карточки — героя можно показывать по-разному.", "In a system open a type and the “Cards” tab. Add blocks with the buttons, drag them around the grid and pull the bottom-right corner to resize. A type can have several card views.") },
      { t: "table", head: [l("Блок", "Block"), l("Что показывает", "What it shows")], rows: [
        ["heading", l("Имя героя крупным шрифтом.", "The hero's name in large type.")],
        ["field", l("Название и значение параметра.", "A parameter's name and value.")],
        ["bar", l("Шкала для здоровья, маны и т.п. Максимум — из другого параметра или числа.", "A bar for health, mana and so on. The maximum comes from another parameter or a number.")],
        ["text", l("Любой постоянный текст.", "Any fixed text.")],
        ["image", l("Картинку героя (параметр вида «Картинка»).", "The hero's picture (a “Picture” parameter).")],
        ["divider", l("Разделительная линия.", "A divider line.")],
        ["actions", l("Кнопки действий этого типа.", "Buttons for this type's actions.")],
      ] },
      { t: "tip", text: l("Фон карточки — цвет или своя картинка (до 2 МБ). Готовых оформлений пять: Ночь, Пергамент, Сталь, Изумруд, Багрянец.", "A card background is a colour or your own picture (up to 2 MB). Five styles are built in: Night, Parchment, Steel, Emerald, Crimson.") },
    ],
  },
  {
    id: "actions", icon: "dice", title: l("Действия и инициатива", "Actions and initiative"),
    summary: l("Атаки, проверки, лечение и порядок хода.", "Attacks, checks, healing and turn order."),
    keywords: "action effect initiative result действие эффект инициатива атака",
    blocks: [
      { t: "p", text: l("Действие — формула броска, например атаки. В кампании оно появляется кнопкой у каждого героя этого типа, а результат попадает в журнал бросков.", "An action is a roll formula, for example an attack. In a campaign it appears as a button on every hero of that type, and the result goes to the roll log.") },
      { t: "list", items: [
        l("Вопросы: действие может спросить значение перед броском («сколько урона?»). Имя вопроса используется в формуле.", "Questions: an action can ask for a value before rolling (“how much damage?”). The question's name is used in the formula."),
        l("Эффекты: после броска можно изменить параметр. В формуле эффекта слово result — итог броска.", "Effects: after the roll a parameter can change. In an effect formula the word result is the roll total."),
        l("«Прибавить» для ресурса меняет текущее значение в пределах от 0 до максимума.", "“Add” on a resource changes the current value between 0 and the maximum."),
      ] },
      { t: "code", code: "1d20 + level + mod(str)", try: true },
      { t: "p", text: l("Формула инициативы типа (по умолчанию 1d20) используется в трекере боя.", "A type's initiative formula (1d20 by default) is used by the combat tracker.") },
    ],
  },
  {
    id: "campaign", icon: "campaign", title: l("Кампания и бой", "Campaigns and combat"),
    summary: l("Герои, галерея, бестиарий, трекер боя, заметки.", "Heroes, gallery, bestiary, combat tracker, notes."),
    keywords: "campaign combat bestiary notes кампания бой бестиарий заметки герои",
    blocks: [
      { t: "table", head: [l("Вкладка", "Tab"), l("Для чего", "What for")], rows: [
        ["Heroes / Герои", l("Лист героя — форма или карточка, кнопки действий.", "The hero sheet — a form or a card, action buttons.")],
        ["Cards / Карточки", l("Все карточки сразу. Фильтр «Существо» превращает её в бестиарий.", "All cards at once. The “Creature” filter turns it into a bestiary.")],
        ["Combat / Бой", l("Инициатива, раунды, очередь ходов, быстрые урон и лечение.", "Initiative, rounds, turn order, quick damage and healing.")],
        ["Notes / Заметки", l("Заметки мастера со связями с героями и поиском.", "Game master notes linked to heroes, with search.")],
      ] },
      { t: "tip", text: l("В бою кнопки «−» и «+» меняют ресурс героя (здоровье) на введённое число; ниже нуля оно не уходит.", "In combat the “−” and “+” buttons change a hero's resource (health) by the entered amount; it never goes below zero.") },
    ],
  },
  {
    id: "plugins", icon: "plugin", title: l("Плагины", "Plugins"),
    summary: l("Что умеют плагины и как сделать свой с помощью нейросети.", "What plugins can do and how to make one with an AI."),
    keywords: "plugin ai нейросеть плагин расширение",
    blocks: [
      { t: "p", text: l("Плагин — папка с двумя файлами: plugin.json (описание) и index.js (код). Он может добавить функции в формулы, блоки в карточки, темы, готовые системы, переводы, команды палитры и пресеты кубиков, а также свои настройки.", "A plugin is a folder with two files: plugin.json (description) and index.js (code). It can add formula functions, card blocks, themes, ready-made systems, translations, palette commands and dice presets, plus its own settings.") },
      { t: "list", items: [
        l("Раздел «Плагины» → «Создать шаблон» — готовый рабочий пример.", "Plugins → “Create a template” — a ready working example."),
        l("Там же блок «Сделать плагин с помощью нейросети»: опишите идею, скопируйте запрос, отправьте нейросети, сохраните два файла из ответа.", "The same page has “Make a plugin with an AI”: describe the idea, copy the prompt, send it to an AI, save the two files from its answer."),
        l("Новый плагин сначала просит разрешение: вы видите, какие права он запрашивает.", "A new plugin first asks for permission: you see which rights it requests."),
      ] },
      { t: "tip", text: l("Плагин выполняется с правами приложения — включайте только те, которым доверяете. Если код плагина изменился, разрешение запрашивается заново.", "A plugin runs with the app's privileges — enable only plugins you trust. If a plugin's code changes, permission is requested again.") },
    ],
  },
  {
    id: "shortcuts", icon: "command", title: l("Горячие клавиши", "Keyboard shortcuts"),
    summary: l("Быстрые действия с клавиатуры.", "Quick actions from the keyboard."),
    keywords: "shortcut hotkey клавиши горячие ctrl",
    blocks: [
      { t: "table", head: [l("Клавиши", "Keys"), l("Действие", "Action")], rows: [
        ["Ctrl + K", l("Палитра команд.", "Command palette.")],
        ["Ctrl + S", l("Сохранить все изменения.", "Save all changes.")],
        ["Ctrl + Z", l("Отменить (вне текстовых полей).", "Undo (outside text fields).")],
        ["Ctrl + Shift + Z / Ctrl + Y", l("Повторить.", "Redo.")],
        ["↑ ↓ Enter Esc", l("Работа с палитрой команд.", "Using the command palette.")],
      ] },
    ],
  },
  {
    id: "templates", icon: "wand", title: l("Шаблоны, бестиарий и простой режим", "Templates, bestiary and simple mode"),
    summary: l("Как быстро собрать систему и не бояться формул.", "How to build a system fast without fearing formulas."),
    keywords: "template preset bestiary simple mode шаблон готовые параметры бестиарий простой режим",
    blocks: [
      { t: "h", text: l("Готовые параметры и шаблоны", "Ready-made parameters and templates") },
      { t: "p", text: l("В системе у каждого типа есть кнопка «Готовые параметры»: отметьте характеристики, здоровье, броню, ману и другое — они появятся в таблице и на карточке. «Из шаблона» создаёт целый тип: персонаж, существо, корабль, город, предмет, место или фракцию — с параметрами, карточкой и кнопками действий.", "Each type in a system has a Ready-made parameters button: tick ability scores, health, armor, mana and more — they appear in the table and on the card. From a template creates a whole type: character, creature, ship, town, item, location or faction — with parameters, a card and action buttons.") },
      { t: "h", text: l("Бестиарий", "Bestiary") },
      { t: "p", text: l("Вкладка «Бестиарий» у типа хранит заготовки: волка, стражника, корабль-разведчик. В кампании на вкладке «Герои» выберите «Из бестиария…» — заготовка копируется в кампанию, и её можно менять, не трогая оригинал.", "A type's Bestiary tab keeps ready-made entries: a wolf, a guard, a scout ship. In a campaign, on the Heroes tab, choose “From bestiary…” — the entry is copied into the campaign and can be changed without touching the original.") },
      { t: "h", text: l("Простой режим", "Simple mode") },
      { t: "p", text: l("Переключатель в шапке («Простой режим») прячет формулы, «имена в формулах», действия, страницы «Формулы», «Плагины» и «Данные». Инициатива выбирается из списка. Всё вернётся, когда вы выключите режим.", "The switch in the header (Simple mode) hides formulas, formula names, actions and the Formulas, Plugins and Data pages. Initiative is picked from a list. Everything returns when you turn the mode off.") },
      { t: "tip", text: l("Советы показываются по месту и закрываются кнопкой «Понятно». Вернуть их можно в статье «С чего начать».", "Tips appear in context and close with Got it. You can bring them back in the Getting started article.") },
    ],
  },
  {
    id: "scenes", icon: "scene", title: l("Сцены, карты и звук", "Scenes, maps and sound"),
    summary: l("Сцена соединяет карту, участников, музыку и звуки.", "A scene joins a map, participants, music and sounds."),
    keywords: "scene map marker music sound audio сцена карта метка музыка звук",
    blocks: [
      { t: "p", text: l("В кампании откройте вкладки «Сцены» и «Карты». На карте расставьте метки (перетаскивайте их мышью или двигайте стрелками) и свяжите метки со сценами, героями и заметками. В сцене выберите карту, участников, музыку и звуки — и нажмите «Запустить сцену».", "In a campaign open the Scenes and Maps tabs. Place markers on a map (drag them or move with the arrow keys) and link markers to scenes, characters and notes. In a scene choose a map, participants, music and sounds — then press Start scene.") },
      { t: "h", text: l("Откуда берётся музыка", "Where music comes from") },
      { t: "p", text: l("Раздел «Звук» → «Папка с музыкой»: бросьте туда mp3, ogg, wav, flac или m4a — файлы появятся в приложении сами. Подпапки работают как плейлисты. Короткие эффекты кладите в «Папку со звуками» — они станут кнопками на звуковой панели.", "Sound section → Music folder: drop mp3, ogg, wav, flac or m4a files there — they appear in the app by themselves. Subfolders work as playlists. Put short effects into the Sounds folder — they become buttons on the soundboard.") },
      { t: "tip", text: l("Сцена хранит только названия файлов. Если вы отправляете кампанию другу, музыка и звуки в пакет не входят: ему нужны такие же файлы в его папках. Картинки карт в пакет входят.", "A scene stores only file names. When you send a campaign to a friend, music and sounds are not in the package: they need the same files in their folders. Map pictures are included.") },
    ],
  },
  {
    id: "data", icon: "save", title: l("Данные, копии и защита", "Data, backups and protection"),
    summary: l("Где лежат файлы, резервные копии и как поделиться системой.", "Where files live, backups, and how to share a system."),
    keywords: "save data backup export import rolepi protect lock sign key сохранение резервная копия экспорт импорт защита подпись ключ",
    blocks: [
      { t: "p", text: l("Всё хранится на вашем компьютере; ничего не отправляется в сеть. Изменения попадают на диск после кнопки «Сохранить» (Ctrl+S). Картинки лежат отдельными файлами, документы — в обычных JSON.", "Everything is stored on your computer; nothing is sent over the network. Changes reach the disk after the Save button (Ctrl+S). Pictures are separate files, documents are plain JSON.") },
      { t: "h", text: l("Резервные копии", "Backups") },
      { t: "p", text: l("Раздел «Данные» хранит копии автоматически (после сохранения, перед переносом старых документов и перед импортом) и по вашей кнопке. Восстановление само делает копию «до восстановления», так что его можно отменить.", "The Data section keeps backups automatically (after saving, before migrating old documents and before importing) and on your button. Restoring makes a “before restore” copy first, so it can be undone.") },
      { t: "h", text: l("Поделиться файлом", "Sharing a file") },
      { t: "list", items: [
        l("«Сохранить в файл» делает пакет .rolepi: документ и все его картинки в одном файле. Для кампании можно положить в пакет и её систему.", "“Save to file” makes a .rolepi package: the document and all its pictures in one file. For a campaign you can include its system."),
        l("«Импорт» добавляет такой пакет (или старый файл .json) в ваши проекты.", "“Import” adds such a package (or an old .json file) to your projects."),
      ] },
      { t: "h", text: l("Защита системы от правки", "Protecting a system from editing") },
      { t: "p", text: l("При сохранении можно защитить систему: она подписывается вашим ключом автора и открывается у получателя только для чтения, с вашим именем и лицензией. Изменить файл незаметно нельзя — подпись это покажет. «Сделать правимую копию» доступна, если вы это разрешили.", "When saving you can protect a system: it is signed with your author key and opens read-only for the recipient, with your name and licence. A change to the file cannot go unnoticed — the signature will show it. “Make an editable copy” is available if you allowed it.") },
      { t: "tip", text: l("Это не защита от копирования: файл лежит у получателя. Подпись защищает от подделки и показывает автора. Сохраните копию ключа автора (раздел «Данные») — без неё подписывать от того же имени на другом компьютере не получится.", "This is not copy protection: the file is on the recipient's computer. The signature protects against forgery and shows the author. Save a copy of your author key (Data section) — without it you cannot sign under the same name on another computer.") },
    ],
  },
  {
    id: "panels", icon: "panel", title: l("Панели плагинов", "Plugin panels"),
    summary: l("Страницы плагинов внутри окна: генераторы, помощники, справочники.", "Plugin pages inside the window: generators, helpers, references."),
    keywords: "panel plugin generator adobe панель плагин генератор страница",
    blocks: [
      { t: "p", text: l("Плагин может показывать собственные панели: отдельным разделом «Панели» в меню, вкладкой справа рядом со свойствами или внизу рядом с проблемами и бросками. Попробуйте пример «генератор имён» на странице «Плагины» → «Скопировать примеры».", "A plugin can show its own panels: as a separate Panels section in the menu, a tab on the right next to properties, or at the bottom next to problems and rolls. Try the “name generator” example on the Plugins page → “Copy examples”.") },
      { t: "list", items: [
        l("Панель работает в изолированной рамке: у неё нет доступа к сети и файлам.", "A panel runs in an isolated frame: no network or file access."),
        l("Читать ваши системы и кампании или создавать заметки и героев она может, только если вы разрешили это при включении плагина; каждая запись отменяется кнопкой «Отменить».", "It can read your systems and campaigns or create notes and characters only if you allowed it when enabling the plugin; every write can be undone with the Undo button."),
        l("Если файлы плагина изменились, разрешение запрашивается заново.", "If the plugin's files change, permission is requested again."),
      ] },
    ],
  },
  {
    id: "faq", icon: "help", title: l("Если что-то не так", "Troubleshooting"),
    summary: l("Частые вопросы и ответы.", "Common questions."),
    keywords: "faq problem error ошибка проблема не работает",
    blocks: [
      { t: "table", head: [l("Что случилось", "What happened"), l("Что делать", "What to do")], rows: [
        [ "Формула показывает ошибку", l("Откройте нижнюю панель «Проблемы»: там написано, что не так — например, неизвестное имя параметра.", "Open the “Problems” panel: it says what is wrong — for example an unknown parameter name.")],
        [ "Не нажимается «Сохранить»", l("Кнопка активна, только если есть несохранённые изменения. Подсвеченное красным поле нужно исправить.", "The button is active only when there are unsaved changes. Fix any field highlighted in red.")],
        [ "Плагин не включается", l("На странице «Плагинов» посмотрите его состояние: возможно, нужно разрешение или версия приложения устарела.", "Check its state on the Plugins page: it may need permission, or the app version may be too old.")],
        [ "Переименовал имя в формулах", l("Приложение обновит формулы, блоки карточек, действия и значения героев само — все изменения в одном шаге, их можно отменить.", "The app updates formulas, card blocks, actions and hero values for you — all in one undoable step.")],
      ] },
    ],
  },
];
