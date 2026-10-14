import { useState } from "react";
import type { BestiaryEntry } from "../../core";
import { CardRenderer } from "../cards/CardRenderer";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { newId, preview } from "../workspace-model";
import { EntityForm } from "./EntityForm";
import { Input } from "./inputs";
import type { SystemEditorState } from "./SystemEditor";

/** Бестиарий системы: заготовки существ и объектов выбранного типа. В кампании их добавляют одним нажатием («Из бестиария»). */
export function BestiaryEditor({ ed }: { ed: SystemEditorState }) {
  const { t, label } = useLang();
  const { system, type } = ed;
  const [pickedId, setPickedId] = useState<string | null>(null);
  if (!system || !type) return null;
  const all = system.bestiary ?? [];
  const entries = all.filter((b) => b.typeId === type.id);
  const entry = entries.find((b) => b.id === pickedId) ?? entries[0];
  const patch = (id: string, fn: (b: BestiaryEntry) => BestiaryEntry) => ed.updateSystem((s) => ({ ...s, bestiary: (s.bestiary ?? []).map((b) => (b.id === id ? fn(b) : b)) }));
  const add = () => {
    const b: BestiaryEntry = { id: newId("beast"), typeId: type.id, name: `${label(type.label)} ${entries.length + 1}`, values: {} };
    ed.updateSystem((s) => ({ ...s, bestiary: [...(s.bestiary ?? []), b] }));
    setPickedId(b.id);
  };
  const copy = (b: BestiaryEntry) => {
    const c: BestiaryEntry = { ...structuredClone(b), id: newId("beast"), name: `${b.name} (${t("ws.copySuffix")})` };
    ed.updateSystem((s) => ({ ...s, bestiary: [...(s.bestiary ?? []), c] }));
    setPickedId(c.id);
  };
  const remove = (b: BestiaryEntry) => {
    if (!window.confirm(t("bestiary.deleteConfirm", { name: b.name }))) return;
    ed.updateSystem((s) => ({ ...s, bestiary: (s.bestiary ?? []).filter((x) => x.id !== b.id) }));
    setPickedId(null);
  };
  const view = type.cardViews[0];
  const computed = entry ? preview(type, entry.values, system, ed.registry) : undefined;
  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("bestiary.title", { type: label(type.label) })} <small>{entries.length}</small></h2>
        <button className="ws-with-icon" onClick={add}><Icon name="plus" />{t("bestiary.add")}</button>
      </div>
      <p className="ws-hint ws-hint-tight">{t("bestiary.hint")}</p>
      {!entries.length && <div className="ws-empty">{t("bestiary.empty")}</div>}
      {!!entries.length && (
        <div className="bestiary">
          <div className="bestiary-list">
            {entries.map((b) => (
              <button key={b.id} className={"scene-item" + (b.id === entry?.id ? " active" : "")} onClick={() => setPickedId(b.id)}><Icon name="campaign" size={15} /><span className="ws-ellipsis">{b.name || t("ws.untitled")}</span></button>
            ))}
          </div>
          {entry && (
            <div className="bestiary-editor">
              <div className="scene-head">
                <Input title={t("bestiary.name")} value={entry.name} onChange={(name) => patch(entry.id, (b) => ({ ...b, name }))} />
                <button className="ws-with-icon" onClick={() => copy(entry)}><Icon name="copy" size={14} />{t("bestiary.copy")}</button>
                <button className="ws-danger ws-with-icon" onClick={() => remove(entry)}><Icon name="trash" size={14} />{t("bestiary.delete")}</button>
              </div>
              <Input title={t("bestiary.notes")} value={entry.notes ?? ""} multiline onChange={(notes) => patch(entry.id, (b) => ({ ...b, notes: notes || undefined }))} />
              <EntityForm type={type} values={entry.values} computed={computed} onSet={(id, v) => patch(entry.id, (b) => ({ ...b, values: { ...b.values, [id]: v } }))} />
              {view && (
                <div className="ws-card-solo"><CardRenderer type={type} view={view} name={entry.name} values={computed?.values ?? {}} registry={ed.registry} onRun={() => {}} /></div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
