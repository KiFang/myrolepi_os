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

export function t(key: string, lang: string, params?: Record<string, string | number>): string {
  const raw = dictionaries[lang]?.[key] ?? dictionaries[lang.split('-')[0]]?.[key] ?? dictionaries.en?.[key] ?? key;
  return params ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : raw;
}

registerLocale('ru', {
  'app.title': 'MyRolePi OS',
  'nav.dice': 'Кубики',
  'nav.formulas': 'Формулы',
  'nav.systems': 'Системы',
  'nav.plugins': 'Плагины',
  'nav.help': 'Справка',
  'dice.title': 'Бросок кубиков',
  'dice.placeholder': 'Например: 4d6kh3 + 2',
  'dice.roll': 'Бросить',
  'dice.history': 'История бросков',
  'dice.empty': 'Бросков пока нет',
  'formula.title': 'Песочница формул',
  'formula.scope': 'Переменные (JSON)',
  'formula.result': 'Результат',
  'systems.title': 'Системы',
  'systems.hint': 'Здесь будет редактор систем: типы сущностей, поля, формулы, карточки.',
  'systems.entityTypes': 'Типов сущностей',
  'systems.issues': 'Проблем в системе',
  'plugins.title': 'Плагины',
  'plugins.none': 'Плагины не найдены. Положите папку плагина в каталог plugins/.',
  'plugins.folder': 'Папка плагинов',
  'help.title': 'Справка',
  'lang': 'Язык',
  'error': 'Ошибка',
});

registerLocale('en', {
  'app.title': 'MyRolePi OS',
  'nav.dice': 'Dice',
  'nav.formulas': 'Formulas',
  'nav.systems': 'Systems',
  'nav.plugins': 'Plugins',
  'nav.help': 'Help',
  'dice.title': 'Dice roller',
  'dice.placeholder': 'E.g. 4d6kh3 + 2',
  'dice.roll': 'Roll',
  'dice.history': 'Roll history',
  'dice.empty': 'No rolls yet',
  'formula.title': 'Formula playground',
  'formula.scope': 'Variables (JSON)',
  'formula.result': 'Result',
  'systems.title': 'Systems',
  'systems.hint': 'The system editor will live here: entity types, fields, formulas, cards.',
  'systems.entityTypes': 'Entity types',
  'systems.issues': 'Issues in system',
  'plugins.title': 'Plugins',
  'plugins.none': 'No plugins found. Drop a plugin folder into the plugins/ directory.',
  'plugins.folder': 'Plugins folder',
  'help.title': 'Help',
  'lang': 'Language',
  'error': 'Error',
});
