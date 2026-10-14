import { useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { useLang } from "./lang";

/** Короткие советы по месту: показываются по одному, закрываются кнопкой и больше не возвращаются (пока их не вернуть в справке). */
export type TipContext =
  | "system.fields" | "system.cards" | "system.actions" | "system.bestiary"
  | "campaign.heroes" | "campaign.cards" | "campaign.combat" | "campaign.scenes" | "campaign.maps" | "campaign.notes"
  | "audio";

interface Tip { id: string; ru: string; en: string }
const tip = (id: string, ru: string, en: string): Tip => ({ id, ru, en });

export const TIPS: Record<TipContext, Tip[]> = {
  "system.fields": [
    tip("fields-presets", "Не собирайте всё с нуля: «Готовые параметры» добавляют характеристики, здоровье, броню и другое, а «Из шаблона» — целый тип с карточкой.", "Don't build everything from scratch: “Ready-made parameters” add ability scores, health, armor and more, and “From a template” adds a whole type with a card."),
    tip("fields-formula", "Параметр можно сделать вычисляемым: например, модификатор силы считается по значению силы. Формулы — в панели справа (полный режим).", "A parameter can be calculated: for example, a strength modifier follows from strength. Formulas live in the right panel (full mode)."),
    tip("fields-preview", "Столбец «Пример» показывает, как параметры считаются прямо сейчас, — проверяйте правила на ходу.", "The “Example” column shows how parameters are calculated right now — check your rules as you go."),
  ],
  "system.cards": [
    tip("cards-drag", "Блоки карточки можно перетаскивать и растягивать мышью. Несколько видов карточки на один тип — например, краткий и подробный.", "Card blocks can be dragged and resized. A type may have several card views — for example a short and a detailed one."),
    tip("cards-bg", "Фон карточки — цвет или своя картинка; картинки хранятся отдельными файлами и не раздувают систему.", "A card background is a colour or your own picture; pictures are stored as separate files and do not bloat the system."),
  ],
  "system.actions": [
    tip("actions-what", "Действие — это кнопка броска: атака, проверка, лечение. Формула действия видит параметры героя, а эффекты могут менять их (например, отнять здоровье).", "An action is a roll button: attack, check, healing. Its formula sees the hero's parameters, and effects can change them (for example, subtract health)."),
  ],
  "system.bestiary": [
    tip("bestiary-what", "Бестиарий — заготовки существ и объектов: создайте волка один раз и добавляйте его в любую кампанию кнопкой «Из бестиария».", "The bestiary holds ready-made creatures and objects: create a wolf once and add it to any campaign with “From bestiary”."),
  ],
  "campaign.heroes": [
    tip("heroes-bestiary", "Нужен противник быстро? Если в системе есть бестиарий, выберите его в списке «Из бестиария…».", "Need a foe fast? If the system has a bestiary, choose from “From bestiary…”."),
    tip("heroes-health", "Здоровье и другие ресурсы удобно менять кнопками на карточке; результат броска можно сразу применить к герою.", "Health and other resources are easy to change with the buttons on the card; a roll result can be applied to a hero at once."),
  ],
  "campaign.cards": [
    tip("cards-bestiary", "Это галерея карточек кампании. Фильтр по виду помогает быстро показать всех существ или только персонажей.", "This is the campaign's card gallery. The filter by kind helps show all creatures or only characters."),
  ],
  "campaign.combat": [
    tip("combat-flow", "Добавьте участников, бросьте инициативу (формула берётся из типа) и жмите «Следующий ход». Раунды считаются сами.", "Add participants, roll initiative (the formula comes from the type) and press Next turn. Rounds count themselves."),
  ],
  "campaign.scenes": [
    tip("scenes-flow", "Сцена объединяет карту, участников, музыку и звуки. «Запустить сцену» включает музыку и открывает всё нужное разом.", "A scene joins a map, participants, music and sounds. “Start scene” turns on the music and opens everything at once."),
    tip("scenes-music", "Музыки в списке нет? Положите файлы в папку музыки (раздел «Звук») — они появятся сами.", "No music in the list? Put files into the music folder (Sound section) — they appear by themselves."),
  ],
  "campaign.maps": [
    tip("maps-marker", "Метка может вести к сцене, герою или заметке: в запущенной сцене по ней можно перейти одним нажатием.", "A marker can lead to a scene, a character or a note: in a running scene you can jump there with one click."),
  ],
  "campaign.notes": [
    tip("notes-links", "Связывайте заметки с героями и друг с другом, а поиск найдёт нужное по названию и тексту.", "Link notes to characters and to each other, and search finds what you need by title and text."),
  ],
  audio: [
    tip("audio-folders", "Подпапки в папке музыки — это плейлисты («Бой», «Город»). Короткие эффекты кладите в папку звуков — они станут кнопками.", "Subfolders in the music folder are playlists (“Battle”, “Town”). Put short effects into the sounds folder — they become buttons."),
  ],
};

const KEY = "rpi.tips";
interface Stored { dismissed: string[]; off: boolean }
let state: Stored = read();
const listeners = new Set<() => void>();
function read(): Stored {
  try { const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Stored>; return { dismissed: Array.isArray(j.dismissed) ? j.dismissed.filter((x) => typeof x === "string") : [], off: j.off === true }; }
  catch { return { dismissed: [], off: false }; }
}
function set(next: Stored) { state = next; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* без сохранения */ } for (const l of [...listeners]) l(); }
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const snapshot = () => state;

export const dismissTip = (id: string) => set({ ...state, dismissed: [...new Set([...state.dismissed, id])] });
export const turnTipsOff = () => set({ ...state, off: true });
export const resetTips = () => set({ dismissed: [], off: false });
export const useTipsState = () => useSyncExternalStore(subscribe, snapshot);
/** следующий непросмотренный совет для места или undefined */
export const nextTip = (context: TipContext, s: Stored): Tip | undefined => (s.off ? undefined : TIPS[context].find((x) => !s.dismissed.includes(x.id)));

export function TipBar({ context }: { context: TipContext }) {
  const { t, lang } = useLang();
  const s = useTipsState();
  const current = nextTip(context, s);
  if (!current) return null;
  return (
    <div className="tip-bar" role="note" data-tip={current.id}>
      <Icon name="info" size={16} />
      <span className="tip-text"><b>{t("tips.label")}</b> {lang === "ru" ? current.ru : current.en}</span>
      <button onClick={() => dismissTip(current.id)}>{t("tips.gotIt")}</button>
      <button className="ws-icon-button" title={t("tips.off")} aria-label={t("tips.off")} onClick={turnTipsOff}><Icon name="close" size={13} /></button>
    </div>
  );
}
