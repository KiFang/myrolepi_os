import { useEffect, useMemo, useState } from "react";
import type { DiceRoll } from "../core";
import { evaluate } from "../core";
import { Icon } from "./icons";
import { useLang } from "./lang";
import { HelpPage } from "./help/HelpPage";
import type { PluginRegistry } from "./plugin-host";

const PRESETS = ["d20", "2d6", "4d6kh3", "d100", "3d8!", "4dF"];

export function Dice({ reg }: { reg: PluginRegistry }) {
  const { t, lang, label } = useLang();
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
      <h1><Icon name="dice" size={24} />{t("dice.title")}</h1>
      <div className="row">
        <input aria-label={t("dice.title")} value={expr} placeholder={t("dice.placeholder")} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && roll()} />
        <button className="ws-primary" onClick={() => roll()}>{t("dice.roll")}</button>
      </div>
      <div className="chips">
        {PRESETS.map((p) => (
          <button key={p} className="chip" onClick={() => { setExpr(p); roll(p); }}>{p}</button>
        ))}
        {reg.dicePresets.map((d) => (
          <button key={d.id} className="chip plugin" title={d.formula} onClick={() => { setExpr(d.formula); roll(d.formula); }}>{label(d.label)}</button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      <h3>{t("dice.history")}</h3>
      {!hist.length && <p className="muted">{t("dice.empty")}</p>}
      {hist.map((h, i) => (
        <div className="card roll" key={i}>
          <div className="big">{String(h.total)}</div>
          <div>
            <div className="muted">{h.expr}</div>
            {h.rolls.map((r, j) => (
              <div key={j}>{r.rolls.map((v, k) => <span key={k} className={"die" + (r.kept.includes(k) ? "" : " drop")} style={{ "--i": k } as React.CSSProperties}>{v}</span>)}</div>
            ))}
          </div>
        </div>
      ))}
      <span hidden>{lang}</span>
    </>
  );
}

export function Formulas({ reg }: { reg: PluginRegistry }) {
  const { t, lang } = useLang();
  const [src, setSrc] = useState(() => {
    // формула, присланная из справочника кнопкой «Попробовать»
    try { const f = sessionStorage.getItem("rpi.formula"); if (f) { sessionStorage.removeItem("rpi.formula"); return f; } } catch { /* нет доступа к хранилищу */ }
    return "2d6 + floor((str - 10) / 2)";
  });
  const [scopeSrc, setScopeSrc] = useState('{ "str": 16 }');
  const out = useMemo(() => {
    try {
      return { r: evaluate(src, { scope: JSON.parse(scopeSrc || "{}"), functions: reg.functions }), e: "" };
    } catch (e) {
      return { r: null, e: (e as Error).message };
    }
    // lang: текст ошибки зависит от языка
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, scopeSrc, reg, lang]);
  return (
    <>
      <h1><Icon name="formula" size={24} />{t("formula.title")}</h1>
      <p className="muted">{t("tools.formulaHint")}</p>
      <textarea aria-label={t("formula.title")} value={src} onChange={(e) => setSrc(e.target.value)} />
      <label className="label">{t("formula.scope")}</label>
      <textarea value={scopeSrc} onChange={(e) => setScopeSrc(e.target.value)} />
      <label className="label">{t("formula.result")}</label>
      <div className="card">{out.e ? <span className="err">{out.e}</span> : <span className="big">{String(out.r?.value)}</span>}</div>
    </>
  );
}

export function Help({ reg, target, onOpenFormula }: { reg: PluginRegistry; target?: string; onOpenFormula: (formula: string) => void }) {
  return <HelpPage reg={reg} target={target} onOpenFormula={onOpenFormula} />;
}

export function About({ version }: { version?: string }) {
  const { t } = useLang();
  const [log, setLog] = useState("");
  useEffect(() => { window.rpi?.changelog().then(setLog); }, []);
  return (
    <>
      <div className="about-head">
        <img src="./logo.svg" alt="" width={72} height={72} />
        <div>
          <h1>Rolepi</h1>
          <div className="muted">{t("about.version", { v: version ?? "—" })}</div>
        </div>
      </div>
      <p className="muted">{t("about.manual")}</p>
      <h3>{t("about.changelog")}</h3>
      <pre className="card">{log}</pre>
    </>
  );
}
