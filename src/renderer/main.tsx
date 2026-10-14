import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { availableLocales, t as translate } from "../core";
import { LangContext, rememberLang, savedLang } from "./lang";
import { PluginRegistry, PluginStatus, RawPlugin, loadPlugins } from "./plugin-host";
import "./strings";
import { About, Dice, Formulas, Help, Plugins } from "./tools";
import { Workspace } from "./workspace/Workspace";
import "./styles.css";

type Page = "workspace" | "dice" | "formulas" | "plugins" | "help" | "about";
const PAGES: Page[] = ["workspace", "dice", "formulas", "plugins", "help", "about"];
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

  const setLang = (l: string) => { setLangState(l); rememberLang(l); };
  const ctx = useMemo(() => ({ lang, setLang }), [lang]);
  const t = (key: string) => translate(key, lang);

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
      <div className="workspace">
        <header className="ws-header">
          <div className="ws-brand"><span className="ws-logo">M</span>MyRolePi <span>OS</span></div>
          <nav className="ws-menu" aria-label="Main">
            {PAGES.map((p) => (
              <button key={p} className={p === page ? "active" : ""} onClick={() => setPage(p)}>
                {p === "workspace" ? t("ws.tabWorkspace") : t(`nav.${p}`)}
              </button>
            ))}
          </nav>
          <span className="ws-local">{t("ws.library")}</span>
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
              {page === "plugins" && <Plugins status={status} reg={reg} />}
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
