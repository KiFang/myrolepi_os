import type { ThemeDef } from "../core";

/** Темы оформления приложения. Плагины могут добавлять свои через host.registerTheme (те же CSS-переменные). */
export interface AppTheme { id: string; name: { ru: string; en: string }; scheme: "dark" | "light"; vars: Record<string, string> }

const dark = (v: Record<string, string>) => ({ "--on-accent": "#ffffff", "--accent-ink": "#0e1424", "--danger": "#ff9aa3", "--danger-bg": "#432b33", "--warn": "#f2c46d", "--warn-bg": "#44381a", "--ok": "#8fd6a4", "--ok-bg": "#1f3b2b", ...v });
const light = (v: Record<string, string>) => ({ "--on-accent": "#ffffff", "--accent-ink": "#ffffff", "--danger": "#b3263a", "--danger-bg": "#fbe3e6", "--warn": "#8a5a00", "--warn-bg": "#fdf0cf", "--ok": "#1d7a40", "--ok-bg": "#dff3e6", ...v });

export const THEMES: AppTheme[] = [
  { id: "night", name: { ru: "Ночь", en: "Night" }, scheme: "dark", vars: {} },
  {
    id: "forest", name: { ru: "Лес", en: "Forest" }, scheme: "dark",
    vars: dark({ "--sunken": "#0b1310", "--bg": "#0f1a16", "--panel": "#15231d", "--surface": "#1a2b24", "--panel2": "#203629", "--border": "#2a4538", "--border-strong": "#35594a", "--hover": "#2d4a3c", "--fg": "#e3f1ea", "--muted": "#8fb0a1", "--accent": "#5fd19a", "--accent-strong": "#2e9d6a", "--accent-ink": "#06150e", "--selected": "#1f4332" }),
  },
  {
    id: "wine", name: { ru: "Вино", en: "Wine" }, scheme: "dark",
    vars: dark({ "--sunken": "#140c10", "--bg": "#1a1015", "--panel": "#25161d", "--surface": "#2c1a23", "--panel2": "#38212c", "--border": "#4a2b39", "--border-strong": "#5e3a4b", "--hover": "#4a2e3c", "--fg": "#f5e6ea", "--muted": "#b494a0", "--accent": "#ff7a95", "--accent-strong": "#d6405f", "--accent-ink": "#2a0710", "--selected": "#4a2234" }),
  },
  {
    id: "graphite", name: { ru: "Графит", en: "Graphite" }, scheme: "dark",
    vars: dark({ "--sunken": "#0f0f10", "--bg": "#161617", "--panel": "#1e1e20", "--surface": "#252527", "--panel2": "#2e2e31", "--border": "#38383c", "--border-strong": "#48484d", "--hover": "#3d3d42", "--fg": "#ececee", "--muted": "#9a9aa2", "--accent": "#f0b35a", "--accent-strong": "#c9892a", "--accent-ink": "#1f1405", "--selected": "#3b3020" }),
  },
  {
    id: "parchment", name: { ru: "Пергамент", en: "Parchment" }, scheme: "light",
    vars: light({ "--sunken": "#e6d9bb", "--bg": "#f3ead6", "--panel": "#faf4e4", "--surface": "#fffaf0", "--panel2": "#ecdfc2", "--border": "#d6c6a2", "--border-strong": "#bda97f", "--hover": "#e2d2ae", "--fg": "#3a2d1a", "--muted": "#7c6b4d", "--accent": "#8a4b1c", "--accent-strong": "#a8601f", "--selected": "#ecd7a8" }),
  },
  {
    id: "daylight", name: { ru: "День", en: "Daylight" }, scheme: "light",
    vars: light({ "--sunken": "#e4e8f0", "--bg": "#f2f4f9", "--panel": "#ffffff", "--surface": "#f7f9fc", "--panel2": "#e8ecf4", "--border": "#d3d9e6", "--border-strong": "#b8c1d4", "--hover": "#dde3ef", "--fg": "#1b2233", "--muted": "#667089", "--accent": "#2f55c8", "--accent-strong": "#3b63d6", "--selected": "#dbe5fb" }),
  },
];

/** Тема из плагина → общий вид. Недостающие переменные берутся из «Ночи». */
export function fromPlugin(t: ThemeDef, lang: string): AppTheme {
  const n = typeof t.name === "string" ? t.name : (t.name[lang] ?? t.name.en ?? Object.values(t.name)[0] ?? t.id);
  const vars = Object.fromEntries(Object.entries(t.vars).filter(([k, v]) => k.startsWith("--") && /^[#\w\s(),.%-]+$/.test(v)));
  return { id: `plugin:${t.id}`, name: { ru: n, en: n }, scheme: t.vars["--scheme"] === "light" ? "light" : "dark", vars };
}

const THEME_KEY = "rpi.theme";
export function savedTheme(): string | null {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}
export function rememberTheme(id: string): void {
  try { localStorage.setItem(THEME_KEY, id); } catch { /* приватный режим и т.п. */ }
}
