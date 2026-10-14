/** Локализуемая строка: просто строка либо словарь { ru: "...", en: "..." }. */
export type LocalizedString = string | Record<string, string>;

export const FALLBACK_LANGS = ['en', 'ru'];

/** Берёт строку нужного языка, с откатом на en/ru/любую доступную. */
export function loc(s: LocalizedString | undefined, lang: string): string {
  if (s == null) return '';
  if (typeof s === 'string') return s;
  return s[lang] ?? s[lang.split('-')[0]] ?? FALLBACK_LANGS.map((l) => s[l]).find(Boolean) ?? Object.values(s)[0] ?? '';
}

type Dict = Record<string, string>;
const dictionaries: Record<string, Dict> = {};
const listeners = new Set<() => void>();

/** Регистрация/расширение языка. Плагины могут добавлять новые языки или свои ключи. */
export function registerLocale(lang: string, dict: Dict): void {
  dictionaries[lang] = { ...dictionaries[lang], ...dict };
  listeners.forEach((l) => l());
}
export const availableLocales = () => Object.keys(dictionaries);
export const onLocaleChange = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

/** Язык сообщений об ошибках ядра (формулы, кубики, проверка системы). Интерфейс задаёт его при смене языка. */
let coreLang = 'ru';
export const setCoreLang = (lang: string): void => { coreLang = lang; };
export const getCoreLang = (): string => coreLang;
/** Сообщение ядра на текущем языке. */
export const tm = (key: string, params?: Record<string, string | number>): string => t(key, coreLang, params);

export function t(key: string, lang: string, params?: Record<string, string | number>): string {
  const raw = dictionaries[lang]?.[key] ?? dictionaries[lang.split('-')[0]]?.[key] ?? dictionaries.en?.[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
}

registerLocale('ru', {
  'app.title': 'Rolepi',
  'nav.dice': 'Кубики',
  'nav.formulas': 'Формулы',
  'nav.systems': 'Системы',
  'nav.plugins': 'Плагины',
  'nav.data': 'Данные',
  'nav.panels': 'Панели',
  'nav.audio': 'Звук',
  'nav.help': 'Справка',
  'nav.about': 'О программе',
  'about.version': 'Версия {v}',
  'about.manual': 'Приложение не обновляется само. Новые версии приходят через лаунчер Asteia Alltools, либо скачайте нужную версию вручную на GitHub.',
  'about.changelog': 'Список изменений',
  'dice.title': 'Бросок кубиков',
  'dice.placeholder': 'Например: 2d6 + 3',
  'dice.roll': 'Бросить',
  'dice.history': 'История бросков',
  'dice.empty': 'Бросков пока не было. Нажмите «Бросить».',
  'formula.title': 'Калькулятор формул',
  'formula.scope': 'Значения переменных (JSON)',
  'formula.result': 'Результат',
  'systems.title': 'Системы',
  'systems.hint': 'Здесь будет редактор систем: типы сущностей, поля, формулы, карточки.',
  'systems.entityTypes': 'Типов сущностей',
  'systems.issues': 'Проблем в системе',
  'plugins.title': 'Плагины',
  'plugins.none': 'Плагинов пока нет. Положите папку плагина в каталог плагинов — кнопка выше открывает его.',
  'plugins.folder': 'Открыть папку плагинов',
  'help.title': 'Справка',
  'lang': 'Язык',
  'theme': 'Тема оформления',
  'error': 'Ошибка',
});

registerLocale('en', {
  'app.title': 'Rolepi',
  'nav.dice': 'Dice',
  'nav.formulas': 'Formulas',
  'nav.systems': 'Systems',
  'nav.plugins': 'Plugins',
  'nav.data': 'Data',
  'nav.panels': 'Panels',
  'nav.audio': 'Sound',
  'nav.help': 'Help',
  'nav.about': 'About',
  'about.version': 'Version {v}',
  'about.manual': 'The app never updates itself. Update via the Asteia Alltools launcher, or manually: download the version you want from GitHub.',
  'about.changelog': 'Changelog',
  'dice.title': 'Dice roller',
  'dice.placeholder': 'E.g. 2d6 + 3',
  'dice.roll': 'Roll',
  'dice.history': 'Roll history',
  'dice.empty': 'No rolls yet. Press "Roll".',
  'formula.title': 'Formula calculator',
  'formula.scope': 'Variable values (JSON)',
  'formula.result': 'Result',
  'systems.title': 'Systems',
  'systems.hint': 'The system editor will live here: entity types, fields, formulas, cards.',
  'systems.entityTypes': 'Entity types',
  'systems.issues': 'Issues in system',
  'plugins.title': 'Plugins',
  'plugins.none': 'No plugins yet. Drop a plugin folder into the plugins directory — the button above opens it.',
  'plugins.folder': 'Open plugins folder',
  'help.title': 'Help',
  'lang': 'Language',
  'theme': 'Theme',
  'error': 'Error',
});
