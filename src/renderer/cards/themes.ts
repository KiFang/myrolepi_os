/** Готовые оформления карточек. Цвет фона вида карточки можно переопределить отдельно. */
export interface CardTheme {
  id: string;
  name: { ru: string; en: string };
  bg: string;
  fg: string;
  accent: string;
  border: string;
}

export const CARD_THEMES: CardTheme[] = [
  { id: "night", name: { ru: "Ночь", en: "Night" }, bg: "#1d2230", fg: "#e8ebf3", accent: "#8fb0ff", border: "#343c52" },
  { id: "parchment", name: { ru: "Пергамент", en: "Parchment" }, bg: "#efe3c6", fg: "#3b2f1e", accent: "#8a4b1c", border: "#b79b66" },
  { id: "steel", name: { ru: "Сталь", en: "Steel" }, bg: "#2b3138", fg: "#dfe6ec", accent: "#7fd0e0", border: "#4a5560" },
  { id: "emerald", name: { ru: "Изумруд", en: "Emerald" }, bg: "#12261f", fg: "#d9f2e4", accent: "#4fd18b", border: "#2a5a45" },
  { id: "crimson", name: { ru: "Багрянец", en: "Crimson" }, bg: "#2a1218", fg: "#f5dde0", accent: "#ff6b81", border: "#5c2a35" },
];

export const cardTheme = (id?: string): CardTheme => CARD_THEMES.find((t) => t.id === id) ?? CARD_THEMES[0];

export const CARD_COLS = 12;
export const CARD_CELL = 40;
