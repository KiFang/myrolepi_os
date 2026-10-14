import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DiceRoll,
  GameSystem,
  availableLocales,
  computeEntity,
  evaluate,
  t,
  validateSystem,
} from "../core";
import {
  PluginRegistry,
  PluginStatus,
  RawPlugin,
  loadPlugins,
} from "./plugin-host";
import exampleSystem from "../../examples/space-opera.system.json";
import "./styles.css";
import { Workspace } from "./workspace";

type Page =
  | "workspace"
  | "dice"
  | "formulas"
  | "systems"
  | "plugins"
  | "help"
  | "about";
const PAGES: Page[] = [
  "dice",
  "formulas",
  "systems",
  "plugins",
  "help",
  "about",
];
const PRESETS = ["d20", "2d6", "4d6kh3", "1d100", "3d8!", "4dF"];
const LANG_NAMES: Record<string, string> = { ru: "Русский", en: "English" };

const emptyRegistry: PluginRegistry = {
  functions: {},
  blocks: {},
  systems: [],
  themes: [],
};

function Dice({ lang, reg }: { lang: string; reg: PluginRegistry }) {
  const [expr, setExpr] = useState("d20");
  const [hist, setHist] = useState<
    { expr: string; total: unknown; rolls: DiceRoll[] }[]
  >([]);
  const [error, setError] = useState("");
  const roll = (e = expr) => {
    try {
      const r = evaluate(e, { functions: reg.functions });
      setHist((h) =>
        [{ expr: e, total: r.value, rolls: r.rolls }, ...h].slice(0, 50),
      );
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <h1>{t("dice.title", lang)}</h1>
      <div className="row">
        <input
          value={expr}
          placeholder={t("dice.placeholder", lang)}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && roll()}
        />
        <button className="btn" onClick={() => roll()}>
          {t("dice.roll", lang)}
        </button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p}
            className="chip"
            onClick={() => {
              setExpr(p);
              roll(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      <h3>{t("dice.history", lang)}</h3>
      {!hist.length && <p className="muted">{t("dice.empty", lang)}</p>}
      {hist.map((h, i) => (
        <div className="card" key={i}>
          <div className="muted">{h.expr}</div>
          <div className="big">{String(h.total)}</div>
          {h.rolls.map((r, j) => (
            <div key={j}>
              {r.rolls.map((v, k) => (
                <span
                  key={k}
                  className={"die" + (r.kept.includes(k) ? "" : " drop")}
                >
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function Formulas({ lang, reg }: { lang: string; reg: PluginRegistry }) {
  const [src, setSrc] = useState("2d6 + floor((str - 10) / 2)");
  const [scopeSrc, setScopeSrc] = useState('{ "str": 16 }');
  const out = useMemo(() => {
    try {
      return {
        r: evaluate(src, {
          scope: JSON.parse(scopeSrc || "{}"),
          functions: reg.functions,
        }),
        e: "",
      };
    } catch (e) {
      return { r: null, e: (e as Error).message };
    }
  }, [src, scopeSrc, reg]);
  return (
    <>
      <h1>{t("formula.title", lang)}</h1>
      <textarea value={src} onChange={(e) => setSrc(e.target.value)} />
      <label className="label">{t("formula.scope", lang)}</label>
      <textarea
        value={scopeSrc}
        onChange={(e) => setScopeSrc(e.target.value)}
      />
      <label className="label">{t("formula.result", lang)}</label>
      <div className="card">
        {out.e ? (
          <span className="err">{out.e}</span>
        ) : (
          <span className="big">{String(out.r?.value)}</span>
        )}
      </div>
    </>
  );
}

function Systems({ lang, reg }: { lang: string; reg: PluginRegistry }) {
  const systems = [exampleSystem as unknown as GameSystem, ...reg.systems];
  return (
    <>
      <h1>{t("systems.title", lang)}</h1>
      <p className="muted">{t("systems.hint", lang)}</p>
      {systems.map((s) => {
        const issues = validateSystem(s);
        const name =
          typeof s.name === "string"
            ? s.name
            : (s.name[lang] ?? s.name.en ?? s.id);
        return (
          <div className="card" key={s.id}>
            <b>{name}</b>
            <div className="muted">
              {t("systems.entityTypes", lang)}: {s.entityTypes.length} ·{" "}
              {t("systems.issues", lang)}:{" "}
              {issues.filter((i) => i.level === "error").length}
            </div>
            {s.entityTypes.map((et) => {
              const defaults = computeEntity(et, {}, { system: s });
              const label =
                typeof et.label === "string"
                  ? et.label
                  : (et.label[lang] ?? et.label.en);
              return (
                <div key={et.id} className="muted">
                  • {label} —{" "}
                  {Object.entries(defaults.values)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(", ")}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function Plugins({ lang, status }: { lang: string; status: PluginStatus[] }) {
  return (
    <>
      <h1>{t("plugins.title", lang)}</h1>
      <button className="btn" onClick={() => window.rpi?.openPluginsFolder()}>
        {t("plugins.folder", lang)}
      </button>
      <p />
      {!status.length && <p className="muted">{t("plugins.none", lang)}</p>}
      {status.map((p) => (
        <div className="card" key={p.id}>
          <b>{p.name}</b> <span className="muted">{p.id}</span>
          <div className={p.ok ? "muted" : "err"}>
            {p.ok ? "OK" : p.errors.join("; ")}
          </div>
        </div>
      ))}
    </>
  );
}

function Help({ lang }: { lang: string }) {
  return (
    <>
      <h1>{t("help.title", lang)}</h1>
      <div className="card">
        <p>
          docs/AI_PLUGIN_GUIDE.md —{" "}
          {lang === "ru"
            ? "файл для нейросети: отдайте его ИИ, чтобы он написал плагин."
            : "a file for an AI: hand it to a model to have it write a plugin."}
        </p>
        <p>
          docs/FORMULAS.md —{" "}
          {lang === "ru"
            ? "справочник по формулам и кубикам."
            : "formula and dice reference."}
        </p>
      </div>
    </>
  );
}

interface Env {
  version: string;
  launcherMode: boolean;
  lang: string;
}

function About({ lang, env }: { lang: string; env: Env | null }) {
  const [log, setLog] = useState("");
  useEffect(() => {
    window.rpi?.changelog().then(setLog);
  }, []);
  return (
    <>
      <h1>{t("nav.about", lang)}</h1>
      <div className="card">
        <b>{t("about.version", lang, { v: env?.version ?? "—" })}</b>
        <p className="muted">{t("about.manual", lang)}</p>
      </div>
      <h3>{t("about.changelog", lang)}</h3>
      <pre className="card" style={{ whiteSpace: "pre-wrap" }}>
        {log}
      </pre>
    </>
  );
}

function App() {
  const [page, setPage] = useState<Page>("workspace");
  const [lang, setLang] = useState("ru");
  const [reg, setReg] = useState<PluginRegistry>(emptyRegistry);
  const [status, setStatus] = useState<PluginStatus[]>([]);
  const [env, setEnv] = useState<Env | null>(null);

  useEffect(() => {
    window.rpi?.env().then((e: Env) => {
      setEnv(e);
      setLang(
        availableLocales().includes(e.lang.slice(0, 2))
          ? e.lang.slice(0, 2)
          : "en",
      );
    });
    window.rpi?.plugins().then((raw: RawPlugin[]) => {
      const r = loadPlugins(raw);
      setReg(r.registry);
      setStatus(r.status);
    });
  }, []);

  return (
    <>
      <div hidden={page !== "workspace"}>
        <Workspace registry={reg} onTool={setPage} />
      </div>
      {page !== "workspace" && (
        <div className="app">
          <nav className="side">
            <div className="brand">{t("app.title", lang)}</div>
            <button onClick={() => setPage("workspace")}>
              {lang === "ru" ? "← Рабочее пространство" : "← Workspace"}
            </button>
            {PAGES.map((p) => (
              <button
                key={p}
                className={p === page ? "active" : ""}
                onClick={() => setPage(p)}
              >
                {t(`nav.${p}`, lang)}
              </button>
            ))}
            <div className="spacer" />
            <label className="muted">{t("lang", lang)}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {availableLocales().map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l] ?? l}
                </option>
              ))}
            </select>
          </nav>
          <main>
            {page === "dice" && <Dice lang={lang} reg={reg} />}
            {page === "formulas" && <Formulas lang={lang} reg={reg} />}
            {page === "systems" && <Systems lang={lang} reg={reg} />}
            {page === "plugins" && <Plugins lang={lang} status={status} />}
            {page === "help" && <Help lang={lang} />}
            {page === "about" && <About lang={lang} env={env} />}
          </main>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
