import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { availableLocales, evaluate, loc, setCoreLang, t as translate } from "../core";
import type { CommandContext } from "../core";
import { CommandPalette } from "./CommandPalette";
import type { PaletteCommand } from "./CommandPalette";
import { Icon } from "./icons";
import { HelpContext, LangContext, rememberLang, savedLang } from "./lang";
import { DataPage } from "./DataPage";
import { Plugins } from "./PluginsPage";
import "./strings";
import { THEMES, fromPlugin, rememberTheme, savedTheme } from "./themes";
import { ToastProvider, useToast } from "./toasts";
import { About, Dice, Formulas, Help } from "./tools";
import { usePlugins } from "./usePlugins";
import { Workspace } from "./workspace/Workspace";
import "./styles.css";

type Page = "workspace" | "dice" | "formulas" | "plugins" | "data" | "help" | "about";
const PAGES: Page[] = ["workspace", "dice", "formulas", "plugins", "data", "help", "about"];
const PAGE_ICONS: Record<Page, string> = { workspace: "studio", dice: "dice", formulas: "formula", plugins: "plugin", data: "folder", help: "help", about: "info" };
const LANG_NAMES: Record<string, string> = { ru: "Русский", en: "English" };

function pickLang(candidate: string | null | undefined): string {
  const short = (candidate ?? "").slice(0, 2).toLowerCase();
  return availableLocales().includes(short) ? short : "en";
}

function Shell() {
  const [page, setPage] = useState<Page>("workspace");
  const [lang, setLangState] = useState(() => pickLang(savedLang() ?? navigator.language));
  const [themeId, setThemeId] = useState(() => savedTheme() ?? "night");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpTarget, setHelpTarget] = useState<string | undefined>();
  const notify = useToast();
  const plugins = usePlugins(() => lang);
  const reg = plugins.registry;

  const setLang = useCallback((l: string) => { setLangState(l); rememberLang(l); }, []);
  const ctx = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  const t = (key: string, params?: Record<string, string | number>) => translate(key, lang, params);
  setCoreLang(lang); // сообщения ядра (ошибки формул и проверки) — на языке интерфейса

  const themes = useMemo(() => [...THEMES, ...reg.themes.map((th) => fromPlugin(th, lang))], [reg, lang]);
  const theme = themes.find((x) => x.id === themeId) ?? THEMES[0];
  const setTheme = useCallback((id: string) => { setThemeId(id); rememberTheme(id); }, []);

  useEffect(() => {
    // язык из лаунчера применяется, только если пользователь сам ещё не выбирал
    window.rpi?.env().then((e: { lang: string }) => { if (!savedLang()) setLangState(pickLang(e.lang)); });
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const ctxForPlugins = useCallback((): CommandContext => ({
    lang,
    notify,
    roll: (formula) => {
      const r = evaluate(formula, { functions: reg.functions });
      const detail = r.rolls.map((x) => `${x.notation}: ${x.rolls.map((v, i) => (x.kept.includes(i) ? v : `(${v})`)).join(" ")}`).join(" · ");
      return { value: r.value, text: `${formula} = ${String(r.value)}${detail ? ` (${detail})` : ""}` };
    },
    openPage: (p) => setPage(p),
  }), [lang, notify, reg]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (p: Page, icon: string): PaletteCommand => ({ id: `go:${p}`, title: `${t("palette.go")}: ${p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}`, group: t("palette.groupGo"), icon, keywords: p, run: () => setPage(p) });
    const emit = (name: string) => () => { setPage("workspace"); setTimeout(() => window.dispatchEvent(new CustomEvent("rolepi:command", { detail: name })), 30); };
    const list: PaletteCommand[] = [
      ...PAGES.map((p) => go(p, PAGE_ICONS[p])),
      { id: "new-system", title: t("ws.newSystem"), group: t("palette.groupStudio"), icon: "system", keywords: "new create система создать", run: emit("new-system") },
      { id: "new-campaign", title: t("ws.newCampaign"), group: t("palette.groupStudio"), icon: "campaign", keywords: "new create кампания создать", run: emit("new-campaign") },
      { id: "save", title: t("ws.save"), group: t("palette.groupStudio"), icon: "save", keywords: "save сохранить", run: emit("save") },
      { id: "import", title: t("ws.import"), group: t("palette.groupStudio"), icon: "upload", keywords: "import импорт файл", run: emit("import") },
      { id: "quick-d20", title: t("palette.rollD20"), group: t("palette.groupDice"), icon: "dice", keywords: "d20 roll бросок кубик", run: () => notify(ctxForPlugins().roll("1d20").text) },
      ...themes.map((th): PaletteCommand => ({ id: `theme:${th.id}`, title: `${t("palette.theme")}: ${th.name[lang === "ru" ? "ru" : "en"]}`, group: t("palette.groupLook"), icon: "wand", keywords: "theme тема оформление", run: () => setTheme(th.id) })),
      ...availableLocales().map((l): PaletteCommand => ({ id: `lang:${l}`, title: `${t("palette.language")}: ${LANG_NAMES[l] ?? l}`, group: t("palette.groupLook"), icon: "book", keywords: "language язык", run: () => setLang(l) })),
      ...reg.commands.map((c): PaletteCommand => ({ id: c.id, title: loc(c.title, lang), group: plugins.plugins.find((p) => p.id === c.pluginId)?.name ? loc(plugins.plugins.find((p) => p.id === c.pluginId)!.name, lang) : c.pluginId, icon: "plugin", keywords: (c.keywords ?? []).join(" "), run: async () => { try { await c.run(ctxForPlugins()); } catch (e) { notify(`⚠ ${(e as Error).message}`); } } })),
    ];
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, themes, reg, plugins.plugins, ctxForPlugins]);

  const openHelp = useCallback((topic?: string) => { setHelpTarget(topic); setPage("help"); }, []);

  return (
    <LangContext.Provider value={ctx}>
      <HelpContext.Provider value={openHelp}>
      <div className="workspace" data-theme={theme.id} style={{ ...theme.vars, colorScheme: theme.scheme } as React.CSSProperties}>
        <header className="ws-header">
          <div className="ws-brand"><img className="ws-logo-img" src="./logo.svg" alt="" width={30} height={30} /><span className="ws-wordmark">{t("app.name")}</span></div>
          <nav className="ws-menu" aria-label="Main">
            {PAGES.map((p) => (
              <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)} title={p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}>
                <Icon name={PAGE_ICONS[p]} size={15} /><span className="lbl">{p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}</span>
              </button>
            ))}
          </nav>
          <button className="ws-palette-hint" onClick={() => setPaletteOpen(true)} title={t("palette.title")}><Icon name="search" size={14} /><span className="lbl">{t("palette.hint")}</span><kbd>Ctrl K</kbd></button>
          <select className="ws-lang ws-theme" aria-label={t("theme")} value={theme.id} onChange={(e) => setTheme(e.target.value)}>
            {themes.map((th) => <option key={th.id} value={th.id}>{th.name[lang === "ru" ? "ru" : "en"]}</option>)}
          </select>
          <select className="ws-lang" aria-label={t("lang")} value={lang} onChange={(e) => setLang(e.target.value)}>
            {availableLocales().map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </header>
        <div hidden={page !== "workspace"} className="ws-slot"><Workspace registry={reg} active={page === "workspace" && !paletteOpen} /></div>
        {page !== "workspace" && (
          <main className="ws-page" key={page}>
            <div className={"ws-page-inner" + (page === "help" ? " wide" : "")}>
              {page === "dice" && <Dice reg={reg} />}
              {page === "formulas" && <Formulas reg={reg} />}
              {page === "plugins" && <Plugins api={plugins} />}
              {page === "data" && <DataPage />}
              {page === "help" && <Help reg={reg} target={helpTarget} onOpenFormula={(f) => { sessionStorage.setItem("rpi.formula", f); setPage("formulas"); }} />}
              {page === "about" && <About version={plugins.version} />}
            </div>
          </main>
        )}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </div>
      </HelpContext.Provider>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><Shell /></ToastProvider></StrictMode>);
