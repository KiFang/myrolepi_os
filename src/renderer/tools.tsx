import { useEffect, useMemo, useState } from "react";
import type { DiceRoll } from "../core";
import { evaluate } from "../core";
import { useLang } from "./lang";
import type { PluginRegistry, PluginStatus } from "./plugin-host";

const PRESETS = ["d20", "2d6", "4d6kh3", "1d100", "3d8!", "4dF"];

export function Dice({ reg }: { reg: PluginRegistry }) {
  const { t } = useLang();
  const [expr, setExpr] = useState("d20");
  const [hist, setHist] = useState<{ expr: string; total: unknown; rolls: DiceRoll[] }[]>([]);
  const [error, setError] = useState("");
  const roll = (e = expr) => {
    try {
      const r = evaluate(e, { functions: reg.functions });
      setHist((h) => [{ expr: e, total: r.value, rolls: r.rolls }, ...h].slice(0, 50));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <h1>{t("dice.title")}</h1>
      <div className="row">
        <input value={expr} placeholder={t("dice.placeholder")} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && roll()} />
        <button className="ws-primary" onClick={() => roll()}>{t("dice.roll")}</button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p} className="chip" onClick={() => { setExpr(p); roll(p); }}>{p}</button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      <h3>{t("dice.history")}</h3>
      {!hist.length && <p className="muted">{t("dice.empty")}</p>}
      {hist.map((h, i) => (
        <div className="card" key={i}>
          <div className="muted">{h.expr}</div>
          <div className="big">{String(h.total)}</div>
          {h.rolls.map((r, j) => (
            <div key={j}>{r.rolls.map((v, k) => <span key={k} className={"die" + (r.kept.includes(k) ? "" : " drop")}>{v}</span>)}</div>
          ))}
        </div>
      ))}
    </>
  );
}

export function Formulas({ reg }: { reg: PluginRegistry }) {
  const { t } = useLang();
  const [src, setSrc] = useState("2d6 + floor((str - 10) / 2)");
  const [scopeSrc, setScopeSrc] = useState('{ "str": 16 }');
  const out = useMemo(() => {
    try {
      return { r: evaluate(src, { scope: JSON.parse(scopeSrc || "{}"), functions: reg.functions }), e: "" };
    } catch (e) {
      return { r: null, e: (e as Error).message };
    }
  }, [src, scopeSrc, reg]);
  return (
    <>
      <h1>{t("formula.title")}</h1>
      <textarea value={src} onChange={(e) => setSrc(e.target.value)} />
      <label className="label">{t("formula.scope")}</label>
      <textarea value={scopeSrc} onChange={(e) => setScopeSrc(e.target.value)} />
      <label className="label">{t("formula.result")}</label>
      <div className="card">{out.e ? <span className="err">{out.e}</span> : <span className="big">{String(out.r?.value)}</span>}</div>
    </>
  );
}

export function Plugins({ status, reg }: { status: PluginStatus[]; reg: PluginRegistry }) {
  const { t } = useLang();
  return (
    <>
      <h1>{t("plugins.title")}</h1>
      <button className="ws-primary" onClick={() => window.rpi?.openPluginsFolder()}>{t("plugins.folder")}</button>
      <p />
      {!status.length && <p className="muted">{t("plugins.none")}</p>}
      {status.map((p) => (
        <div className="card" key={p.id}>
          <b>{p.name}</b> <span className="muted">{p.id}</span>
          <div className={p.ok ? "muted" : "err"}>{p.ok ? "OK" : p.errors.join("; ")}</div>
        </div>
      ))}
      <span hidden>{Object.keys(reg.functions).length}</span>
    </>
  );
}

export function Help() {
  const { t } = useLang();
  return (
    <>
      <h1>{t("help.title")}</h1>
      <div className="card">
        <p>docs/AI_PLUGIN_GUIDE.md — {t("help.ai")}</p>
        <p>docs/FORMULAS.md — {t("help.formulas")}</p>
      </div>
    </>
  );
}

export function About({ version }: { version?: string }) {
  const { t } = useLang();
  const [log, setLog] = useState("");
  useEffect(() => { window.rpi?.changelog().then(setLog); }, []);
  return (
    <>
      <h1>{t("nav.about")}</h1>
      <div className="card">
        <b>{t("about.version", { v: version ?? "—" })}</b>
        <p className="muted">{t("about.manual")}</p>
      </div>
      <h3>{t("about.changelog")}</h3>
      <pre className="card">{log}</pre>
    </>
  );
}
