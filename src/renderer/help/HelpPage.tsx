import { useEffect, useMemo, useRef, useState } from "react";
import { loc } from "../../core";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { resetTips } from "../tips";
import { useToast } from "../toasts";
import type { PluginRegistry } from "../plugin-host";
import { ARTICLES } from "./content";
import type { Article, Block, L } from "./content";

interface FnDoc { name: string; sig: string; text: L; example: string; plugin?: string }
const BUILTIN: FnDoc[] = [
  { name: "floor", sig: "floor(x)", text: { ru: "Округляет вниз.", en: "Rounds down." }, example: "floor(7 / 2)" },
  { name: "ceil", sig: "ceil(x)", text: { ru: "Округляет вверх.", en: "Rounds up." }, example: "ceil(7 / 2)" },
  { name: "round", sig: "round(x)", text: { ru: "Округляет до ближайшего целого.", en: "Rounds to the nearest whole number." }, example: "round(7 / 2)" },
  { name: "abs", sig: "abs(x)", text: { ru: "Модуль числа (без знака).", en: "Absolute value." }, example: "abs(-5)" },
  { name: "sqrt", sig: "sqrt(x)", text: { ru: "Квадратный корень.", en: "Square root." }, example: "sqrt(16)" },
  { name: "min", sig: "min(a, b, …)", text: { ru: "Наименьшее из чисел.", en: "The smallest number." }, example: "min(3, level)" },
  { name: "max", sig: "max(a, b, …)", text: { ru: "Наибольшее из чисел.", en: "The largest number." }, example: "max(1, str - 10)" },
  { name: "sum", sig: "sum(a, b, …)", text: { ru: "Сумма чисел или списка.", en: "Sum of numbers or a list." }, example: "sum(1, 2, 3)" },
  { name: "avg", sig: "avg(a, b, …)", text: { ru: "Среднее арифметическое.", en: "Arithmetic mean." }, example: "avg(10, 14)" },
  { name: "clamp", sig: "clamp(x, от, до)", text: { ru: "Ограничивает число рамками.", en: "Limits a number to a range." }, example: "clamp(hp, 0, 20)" },
  { name: "if", sig: "if(условие, a, b)", text: { ru: "Если условие верно — a, иначе b.", en: "If the condition is true — a, otherwise b." }, example: "if(level > 4, 2, 1)" },
  { name: "len", sig: "len(x)", text: { ru: "Длина списка или текста.", en: "Length of a list or text." }, example: 'len("abc")' },
  { name: "roll", sig: "roll(n, граней)", text: { ru: "Бросок, где число и грани тоже вычисляются.", en: "A roll where count and sides are calculated too." }, example: "roll(level, 6)" },
];

function Functions({ reg, onTry }: { reg: PluginRegistry; onTry: (f: string) => void }) {
  const { t, lang, label } = useLang();
  const docs: FnDoc[] = [
    ...BUILTIN,
    ...Object.keys(reg.functionInfo).map((n) => ({ name: n, sig: `${n}(…)`, text: (reg.functionInfo[n].description ?? { ru: "", en: "" }) as L, example: reg.functionInfo[n].example ?? `${n}()`, plugin: reg.functionInfo[n].pluginId })),
    ...Object.keys(reg.functions).filter((n) => !reg.functionInfo[n]).map((n) => ({ name: n, sig: `${n}(…)`, text: { ru: "", en: "" }, example: `${n}()` })),
  ];
  return (
    <table className="help-table">
      <thead><tr><th>{t("help.fn")}</th><th>{t("help.what")}</th><th>{t("help.example")}</th></tr></thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.name}>
            <td><code>{d.sig}</code>{d.plugin && <span className="help-plugin">{t("help.fromPlugin", { id: d.plugin })}</span>}</td>
            <td>{typeof d.text === "string" ? d.text : loc(d.text as unknown as Record<string, string>, lang) || label(undefined)}</td>
            <td><button className="help-try" onClick={() => onTry(d.example)} title={t("help.try")}><code>{d.example}</code><Icon name="formula" size={12} /></button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Blocks({ a, reg, onTry }: { a: Article; reg: PluginRegistry; onTry: (f: string) => void }) {
  const { lang, t } = useLang();
  const x = (v: L) => v[lang === "ru" ? "ru" : "en"];
  return (
    <>
      {a.blocks.map((b: Block, i) => {
        switch (b.t) {
          case "p": return <p key={i}>{x(b.text)}</p>;
          case "h": return <h3 key={i}>{x(b.text)}</h3>;
          case "tip": return <div className="help-tip" key={i}><Icon name="info" size={16} /><span>{x(b.text)}</span></div>;
          case "list": return <ul key={i}>{b.items.map((it, j) => <li key={j}>{x(it)}</li>)}</ul>;
          case "code": return (
            <div className="help-code" key={i}><code>{b.code}</code>{b.try && <button className="help-try" onClick={() => onTry(b.code)}>{t("help.try")}</button>}</div>
          );
          case "table": return (
            <table className="help-table" key={i}>
              <thead><tr>{b.head.map((h, j) => <th key={j}>{x(h)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}><td><code>{r[0]}</code></td><td>{typeof r[1] === "string" ? r[1] : x(r[1] as L)}</td></tr>)}</tbody>
            </table>
          );
          case "functions": return <Functions key={i} reg={reg} onTry={onTry} />;
        }
      })}
    </>
  );
}

/** Справочник: оглавление, поиск по тексту, примеры формул с переходом в калькулятор. */
export function HelpPage({ reg, target, onOpenFormula }: { reg: PluginRegistry; target?: string; onOpenFormula: (formula: string) => void }) {
  const { t, lang } = useLang();
  const notify = useToast();
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(target && ARTICLES.some((a) => a.id === target) ? target : ARTICLES[0].id);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (target && ARTICLES.some((a) => a.id === target)) setCurrent(target); }, [target]);
  useEffect(() => { body.current?.scrollTo({ top: 0 }); }, [current, query]);

  const text = (a: Article) => JSON.stringify([a.title, a.summary, a.keywords, a.blocks]).toLowerCase();
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ARTICLES.filter((a) => q.split(/\s+/).every((w) => text(a).includes(w))) : ARTICLES;
  }, [query]);
  const article = (query ? found : ARTICLES).find((a) => a.id === current) ?? found[0];
  const ln = lang === "ru" ? "ru" : "en";

  return (
    <div className="help">
      <aside className="help-nav">
        <div className="help-search"><Icon name="search" size={15} /><input type="search" value={query} placeholder={t("help.search")} aria-label={t("help.search")} onChange={(e) => setQuery(e.target.value)} /></div>
        {found.map((a) => (
          <button key={a.id} className={"help-item" + (article?.id === a.id ? " active" : "")} onClick={() => setCurrent(a.id)}>
            <Icon name={a.icon} size={16} /><span><b>{a.title[ln]}</b><small>{a.summary[ln]}</small></span>
          </button>
        ))}
        {!found.length && <p className="muted help-none">{t("help.nothing")}</p>}
      </aside>
      <article className="help-body" ref={body} key={article?.id}>
        {article && (<><h1><Icon name={article.icon} size={24} />{article.title[ln]}</h1><p className="muted help-lead">{article.summary[ln]}</p><Blocks a={article} reg={reg} onTry={onOpenFormula} />{article.id === "start" && <p><button className="ws-with-icon" onClick={() => { resetTips(); notify(t("tips.resetDone")); }}><Icon name="info" size={14} />{t("tips.reset")}</button></p>}</>)}
        <p className="muted help-files">{t("help.files")}</p>
      </article>
    </div>
  );
}
