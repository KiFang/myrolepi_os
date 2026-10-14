import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { availableLocales, setCoreLang, t as translate } from "../core";
import { Icon } from "./icons";
import { LangContext, rememberLang, savedLang } from "./lang";
import { PluginRegistry, PluginStatus, RawPlugin, loadPlugins } from "./plugin-host";
import "./strings";
import { About, Dice, Formulas, Help, Plugins } from "./tools";
import { Workspace } from "./workspace/Workspace";
import { THEMES, fromPlugin, rememberTheme, savedTheme } from "./themes";
import "./styles.css";

type Page = "workspace" | "dice" | "formulas" | "plugins" | "help" | "about";
const PAGES: Page[] = ["workspace", "dice", "formulas", "plugins", "help", "about"];
const PAGE_ICONS: Record<Page, string> = { workspace: "studio", dice: "dice", formulas: "formula", plugins: "plugin", help: "help", about: "info" };
const LANG_NAMES: Record<string, string> = { ru: "Русский", en: "English" };
const emptyRegistry: PluginRegistry = { functions: {}, blocks: {}, systems: [], themes: [] };

function pickLang(candidate: string | null | undefined): string {
  const short = (candidate ?? "").slice(0, 2).toLowerCase();
  return availableLocales().includes(short) ? short : "en";
}

function App() {
  const [page, setPage] = useState<Page>("workspace");
  const [lang, setLangState] = useState(() => pickLang(savedLang() ?? navigator.language));
  const [reg, setReg] = useState<PluginRegistry>(emptyRegistry);
  const [status, setStatus] = useState<PluginStatus[]>([]);
  const [version, setVersion] = useState<string>();
  const [themeId, setThemeId] = useState(() => savedTheme() ?? "night");

  const themes = useMemo(() => [...THEMES, ...reg.themes.map((th) => fromPlugin(th, lang))], [reg, lang]);
  const theme = themes.find((x) => x.id === themeId) ?? THEMES[0];
  const setTheme = (id: string) => { setThemeId(id); rememberTheme(id); };
  const setLang = (l: string) => { setLangState(l); rememberLang(l); };
  const ctx = useMemo(() => ({ lang, setLang }), [lang]);
  const t = (key: string) => translate(key, lang);
  setCoreLang(lang); // сообщения ядра (ошибки формул и проверки) — на языке интерфейса

  useEffect(() => {
    window.rpi?.env().then((e: { version: string; lang: string }) => {
      setVersion(e.version);
      // язык из лаунчера применяется, только если пользователь сам ещё не выбирал
      if (!savedLang()) setLangState(pickLang(e.lang));
    });
    window.rpi?.plugins().then((raw: RawPlugin[]) => {
      const r = loadPlugins(raw);
      setReg(r.registry);
      setStatus(r.status);
    });
  }, []);

  return (
    <LangContext.Provider value={ctx}>
      <div className="workspace" data-theme={theme.id} style={{ ...theme.vars, colorScheme: theme.scheme } as React.CSSProperties}>
        <header className="ws-header">
          <div className="ws-brand"><img className="ws-logo-img" src="./logo.svg" alt="" width={30} height={30} />{t("app.name")} <span>OS</span></div>
          <nav className="ws-menu" aria-label="Main">
            {PAGES.map((p) => (
              <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)}>
                <Icon name={PAGE_ICONS[p]} size={15} />{p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}
              </button>
            ))}
          </nav>
                    <select className="ws-lang ws-theme" aria-label={t("theme")} value={theme.id} onChange={(e) => setTheme(e.target.value)}>
            {themes.map((th) => <option key={th.id} value={th.id}>{th.name[lang === "ru" ? "ru" : "en"]}</option>)}
          </select>
          <select className="ws-lang" aria-label={t("lang")} value={lang} onChange={(e) => setLang(e.target.value)}>
            {availableLocales().map((l) => <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>)}
          </select>
        </header>
        <div hidden={page !== "workspace"} className="ws-slot"><Workspace registry={reg} active={page === "workspace"} /></div>
        {page !== "workspace" && (
          <main className="ws-page">
            <div className="ws-page-inner">
              {page === "dice" && <Dice reg={reg} />}
              {page === "formulas" && <Formulas reg={reg} />}
              {page === "plugins" && <Plugins status={status} />}
              {page === "help" && <Help />}
              {page === "about" && <About version={version} />}
            </div>
          </main>
        )}
      </div>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
