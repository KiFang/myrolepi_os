import { StrictMode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { availableLocales, evaluate, loc, setCoreLang, t as translate } from "../core";
import type { CommandContext } from "../core";
import { CommandPalette } from "./CommandPalette";
import type { PaletteCommand } from "./CommandPalette";
import { Icon } from "./icons";
import { HelpContext, LangContext, rememberLang, savedLang } from "./lang";
import { MiniPlayer } from "./audio/MiniPlayer";
import { useAudioLibrary } from "./audio/useAudio";
import { PanelFrame, PanelsContext } from "./PanelFrame";
import { SimpleContext, rememberSimple, savedSimple } from "./simple";
import { currentProjectApi } from "./projectBridge";
import { newId } from "./workspace-model";
import "./strings";
import { THEMES, fromPlugin, rememberTheme, savedTheme } from "./themes";
import { ToastProvider, useToast } from "./toasts";

import { usePlugins } from "./usePlugins";
import { Workspace } from "./workspace/Workspace";
import "./styles.css";

// страницы, которые нужны не сразу, подгружаются при первом открытии: приложение стартует быстрее
const AudioPage = lazy(() => import("./AudioPage"));
const DataPage = lazy(() => import("./DataPage"));
const Plugins = lazy(() => import("./PluginsPage"));
const Help = lazy(() => import("./help/HelpPage").then((m) => ({ default: m.HelpPage })));
const Dice = lazy(() => import("./tools").then((m) => ({ default: m.Dice })));
const Formulas = lazy(() => import("./tools").then((m) => ({ default: m.Formulas })));
const About = lazy(() => import("./tools").then((m) => ({ default: m.About })));

type Page = "workspace" | "panels" | "audio" | "dice" | "formulas" | "plugins" | "data" | "help" | "about";
const PAGES: Page[] = ["workspace", "panels", "audio", "dice", "formulas", "plugins", "data", "help", "about"];
const PAGE_ICONS: Record<Page, string> = { workspace: "studio", panels: "panel", audio: "music", dice: "dice", formulas: "formula", plugins: "plugin", data: "folder", help: "help", about: "info" };
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
  const [simple, setSimpleState] = useState(savedSimple);
  const setSimple = useCallback((v: boolean) => { setSimpleState(v); rememberSimple(v); }, []);
  const simpleCtx = useMemo(() => ({ simple, setSimple }), [simple, setSimple]);
  const hiddenInSimple: Page[] = ["formulas", "plugins", "data"];
  useEffect(() => { if (simple && hiddenInSimple.includes(page)) setPage("workspace"); }); // eslint-disable-line react-hooks/exhaustive-deps
  const [helpTarget, setHelpTarget] = useState<string | undefined>();
  const notify = useToast();
  useAudioLibrary();
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

  // панели плагинов: «страницы» живут в разделе «Панели», «справа» и «внизу» — в студии
  const panelItems = useMemo(() => plugins.plugins.filter((p) => p.state === "active").flatMap((p) => p.panels.map((panel) => ({ plugin: p, panel }))), [plugins.plugins]);
  const pagePanels = panelItems.filter((x) => x.panel.placement === "page");
  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (p: Page, icon: string): PaletteCommand => ({ id: `go:${p}`, title: `${t("palette.go")}: ${p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}`, group: t("palette.groupGo"), icon, keywords: p, run: () => setPage(p) });
    const emit = (name: string) => () => { setPage("workspace"); setTimeout(() => window.dispatchEvent(new CustomEvent("rolepi:command", { detail: name })), 30); };
    const list: PaletteCommand[] = [
      ...PAGES.filter((p) => (p !== "panels" || pagePanels.length > 0) && !(simple && hiddenInSimple.includes(p))).map((p) => go(p, PAGE_ICONS[p])),
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
  }, [lang, themes, reg, plugins.plugins, ctxForPlugins, simple, pagePanels.length]);

  const live = useRef({ lang, notify, reg, version: plugins.version, ctxForPlugins, panelStorage: plugins.panelStorage });
  live.current = { lang, notify, reg, version: plugins.version, ctxForPlugins, panelStorage: plugins.panelStorage };
  const panelsCtx = useMemo(() => ({
    vars: { ...(theme.vars as Record<string, string>) },
    lang,
    deps: (plugin: { id: string }) => ({
      lang: () => live.current.lang,
      get appVersion() { return live.current.version; },
      getProject: () => (currentProjectApi()?.get() ?? { systems: [], campaigns: [] }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      change: (fn: (p: any) => any) => currentProjectApi()?.change(fn), // eslint-disable-line @typescript-eslint/no-explicit-any
      selection: () => currentProjectApi()?.selection() ?? null,
      notify: (m: string) => live.current.notify(m),
      openPage: (p: string) => setPage(p as Page),
      roll: (f: string) => live.current.ctxForPlugins().roll(f),
      storage: live.current.panelStorage(plugin.id),
      newId,
    }),
  }), [theme, lang]);
  const [panelTab, setPanelTab] = useState<string>("");
  const [seenPanels, setSeenPanels] = useState<string[]>([]);
  const panelKey = (x: { plugin: { id: string }; panel: { id: string } }) => `${x.plugin.id}:${x.panel.id}`;
  const currentPanel = pagePanels.find((x) => panelKey(x) === panelTab) ?? pagePanels[0];
  useEffect(() => { if (page === "panels" && currentPanel && !seenPanels.includes(panelKey(currentPanel))) setSeenPanels((s) => [...s, panelKey(currentPanel)]); }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (page === "panels" && !pagePanels.length) setPage("workspace"); }, [page, pagePanels.length]);

  const openHelp = useCallback((topic?: string) => { setHelpTarget(topic); setPage("help"); }, []);

  return (
    <LangContext.Provider value={ctx}>
      <SimpleContext.Provider value={simpleCtx}>
      <PanelsContext.Provider value={panelsCtx}>
      <HelpContext.Provider value={openHelp}>
      <div className="workspace" data-theme={theme.id} style={{ ...theme.vars, colorScheme: theme.scheme } as React.CSSProperties}>
        <header className="ws-header">
          <div className="ws-brand"><img className="ws-logo-img" src="./logo.svg" alt="" width={30} height={30} /><span className="ws-wordmark">{t("app.name")}</span></div>
          <nav className="ws-menu" aria-label="Main">
            {PAGES.filter((p) => (p !== "panels" || pagePanels.length > 0) && !(simple && hiddenInSimple.includes(p))).map((p) => (
              <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)} title={p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}>
                <Icon name={PAGE_ICONS[p]} size={15} /><span className="lbl">{p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}</span>
              </button>
            ))}
          </nav>
          <MiniPlayer onOpen={() => setPage("audio")} />
          <button className="ws-simple-toggle" aria-pressed={simple} title={t("simple.title")} onClick={() => setSimple(!simple)}><Icon name="wand" size={15} /><span className="lbl">{t("simple.on")}</span></button>
          <button className="ws-palette-hint" onClick={() => setPaletteOpen(true)} title={t("palette.title")}><Icon name="search" size={14} /><span className="lbl">{t("palette.hint")}</span><kbd>Ctrl K</kbd></button>
          <select className="ws-lang ws-theme" aria-label={t("theme")} value={theme.id} onChange={(e) => setTheme(e.target.value)}>
            {themes.map((th) => <option key={th.id} value={th.id}>{th.name[lang === "ru" ? "ru" : "en"]}</option>)}
          </select>
          <select className="ws-lang" aria-label={t("lang")} value={lang} onChange={(e) => setLang(e.target.value)}>
            {availableLocales().map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </header>
        <div hidden={page !== "workspace"} className="ws-slot"><Workspace registry={reg} active={page === "workspace" && !paletteOpen} panels={panelItems.filter((x) => x.panel.placement !== "page")} /></div>
        <div hidden={page !== "panels"} className="ws-slot panels-page">
          {pagePanels.length > 1 && (
            <div className="ws-tabs" role="tablist">
              {pagePanels.map((x) => (
                <div key={panelKey(x)} className={"ws-tab" + (currentPanel && panelKey(currentPanel) === panelKey(x) ? " active" : "")}>
                  <button role="tab" className="ws-tab-main" aria-selected={!!currentPanel && panelKey(currentPanel) === panelKey(x)} onClick={() => setPanelTab(panelKey(x))}><span className="ws-ellipsis">{loc(x.panel.title, lang)}</span></button>
                </div>
              ))}
            </div>
          )}
          <div className="panels-stage">
            {pagePanels.filter((x) => seenPanels.includes(panelKey(x))).map((x) => (
              <div key={panelKey(x) + x.plugin.hash} className="panels-slot" hidden={!currentPanel || panelKey(currentPanel) !== panelKey(x)}><PanelFrame plugin={x.plugin} panel={x.panel} /></div>
            ))}
          </div>
        </div>
        {page !== "workspace" && page !== "panels" && (
          <main className="ws-page" key={page}>
            <div className={"ws-page-inner" + (page === "help" ? " wide" : "")}>
              <Suspense fallback={<p className="muted ws-loading">{t("loading")}</p>}>
              {page === "dice" && <Dice reg={reg} />}
              {page === "formulas" && <Formulas reg={reg} />}
              {page === "plugins" && <Plugins api={plugins} />}
              {page === "audio" && <AudioPage />}
              {page === "data" && <DataPage />}
              {page === "help" && <Help reg={reg} target={helpTarget} onOpenFormula={(f) => { sessionStorage.setItem("rpi.formula", f); setPage("formulas"); }} />}
              {page === "about" && <About version={plugins.version} />}
              </Suspense>
            </div>
          </main>
        )}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </div>
      </HelpContext.Provider>
      </PanelsContext.Provider>
      </SimpleContext.Provider>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><Shell /></ToastProvider></StrictMode>);
