import { createContext, useContext } from 'react';
import { loc, t as translate } from '../core';
import type { LocalizedString } from '../core';

export interface LangState {
  lang: string;
  setLang: (lang: string) => void;
}
export const LangContext = createContext<LangState>({ lang: 'ru', setLang: () => {} });

export type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Перевод строк интерфейса и локализуемых названий из данных системы. */
export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  const t: TFn = (key, params) => translate(key, lang, params);
  const label = (value: LocalizedString | undefined) => loc(value, lang);
  return { lang, setLang, t, label };
}

const LANG_KEY = 'rpi.lang';
export function savedLang(): string | null {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}
export function rememberLang(lang: string): void {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* приватный режим и т.п. */ }
}

/** Открыть справочник на нужной статье из любого места интерфейса. */
export const HelpContext = createContext<(topic?: string) => void>(() => {});
export const useHelp = () => useContext(HelpContext);
