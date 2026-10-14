import { parse } from "../../core";
import type { ActionDef } from "../../core";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { newId, rename } from "../workspace-model";
import { HelpLink, Input } from "./inputs";
import type { SystemEditorState } from "./SystemEditor";

function formulaError(formula: string): string {
  try { parse(formula); return ""; } catch (e) { return (e as Error).message; }
}

/** Действия типа: атака, проверка навыка, лечение… Формула считается по параметрам объекта. */
export function ActionsEditor({ ed }: { ed: SystemEditorState }) {
  const { t, label, lang } = useLang();
  const { type } = ed;
  if (!type) return null;
  const actions = type.actions ?? [];
  const set = (i: number, patch: Partial<ActionDef>) => ed.updateActions((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("ws.actionsOf", { type: label(type.label) })}</h2>
        <button className="ws-with-icon" onClick={() => ed.updateActions((l) => [...l, { id: newId("action"), label: { ru: t("ws.newAction"), en: t("ws.newAction") }, formula: "1d20" }])}><Icon name="plus" />{t("ws.addAction")}</button>
      </div>
      <p className="ws-hint ws-hint-tight">{t("ws.actionsHint")} <HelpLink topic="actions" /></p>
      {!actions.length && <div className="ws-empty">{t("ws.noActions")}</div>}
      {actions.map((a, i) => {
        const err = formulaError(a.formula);
        return (
          <div className="ws-action" key={a.id}>
            <div className="ws-sheet-head">
              <Input title={t("ws.actionName")} value={label(a.label)} onChange={(v) => set(i, { label: rename(a.label, v, lang) })} />
              <button className="ws-danger ws-with-icon" onClick={() => window.confirm(t("ws.deleteActionConfirm", { name: label(a.label) })) && ed.updateActions((l) => l.filter((_, j) => j !== i))}><Icon name="trash" />{t("ws.deleteAction")}</button>
            </div>
            <Input title={t("ws.actionFormula")} value={a.formula} placeholder="1d20 + str_mod" onChange={(formula) => set(i, { formula })} hint={t("ws.actionFormulaHint")} />
            {err && <p className="err">{err}</p>}
            <div className="ws-subhead">{t("ws.actionInputs")}<button className="ws-icon-button" title={t("ws.addInput")} aria-label={t("ws.addInput")} onClick={() => set(i, { inputs: [...(a.inputs ?? []), { id: "bonus", label: { ru: "Бонус", en: "Bonus" }, type: "number", default: 0 }] })}><Icon name="plus" /></button></div>
            {(a.inputs ?? []).map((inp, j) => (
              <div className="ws-inline ws-row-edit" key={j}>
                <Input title={t("ws.inputId")} value={inp.id} onChange={(id) => set(i, { inputs: a.inputs!.map((x, k) => (k === j ? { ...x, id } : x)) })} />
                <Input title={t("ws.inputLabel")} value={label(inp.label)} onChange={(v) => set(i, { inputs: a.inputs!.map((x, k) => (k === j ? { ...x, label: rename(x.label, v, lang) } : x)) })} />
                <Input title={t("ws.inputDefault")} type="number" value={String(inp.default ?? 0)} onChange={(v) => set(i, { inputs: a.inputs!.map((x, k) => (k === j ? { ...x, default: Number(v) || 0 } : x)) })} />
                <button className="ws-icon-button" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => set(i, { inputs: a.inputs!.filter((_, k) => k !== j) })}><Icon name="trash" /></button>
              </div>
            ))}
            <div className="ws-subhead">{t("ws.actionEffects")}<button className="ws-icon-button" title={t("ws.addEffect")} aria-label={t("ws.addEffect")} onClick={() => set(i, { effects: [...(a.effects ?? []), { field: type.fields[0]?.id ?? "", op: "add", formula: "-result" }] })}><Icon name="plus" /></button></div>
            {(a.effects ?? []).map((ef, j) => (
              <div className="ws-inline ws-row-edit" key={j}>
                <label className="ws-control"><span>{t("ws.effectField")}</span>
                  <select value={ef.field} onChange={(e) => set(i, { effects: a.effects!.map((x, k) => (k === j ? { ...x, field: e.target.value } : x)) })}>{type.fields.map((f) => <option key={f.id} value={f.id}>{label(f.label)}</option>)}</select>
                </label>
                <label className="ws-control"><span>{t("ws.effectOp")}</span>
                  <select value={ef.op} onChange={(e) => set(i, { effects: a.effects!.map((x, k) => (k === j ? { ...x, op: e.target.value as "set" | "add" } : x)) })}><option value="add">{t("ws.opAdd")}</option><option value="set">{t("ws.opSet")}</option></select>
                </label>
                <Input title={t("ws.effectFormula")} value={ef.formula} onChange={(formula) => set(i, { effects: a.effects!.map((x, k) => (k === j ? { ...x, formula } : x)) })} />
                <button className="ws-icon-button" title={t("ws.delete")} aria-label={t("ws.delete")} onClick={() => set(i, { effects: a.effects!.filter((_, k) => k !== j) })}><Icon name="trash" /></button>
              </div>
            ))}
            {!!(a.effects ?? []).length && <p className="ws-hint">{t("ws.effectHint")}</p>}
          </div>
        );
      })}
    </>
  );
}
