import { useEffect, useMemo, useState } from "react";
import type { EntityCategory, EntityType, FieldDef, FieldType, GameSystem } from "../../core";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { newField, newType, preview, rename } from "../workspace-model";
import { Input, JsonInput } from "./inputs";

const CATEGORIES: EntityCategory[] = ["character", "creature", "vehicle", "structure", "settlement", "item", "location", "faction", "custom"];
const FIELD_TYPES: FieldType[] = ["number", "text", "longtext", "boolean", "select", "resource", "list", "reference", "image"];

/** Состояние редактора выбранной системы: какой тип и поле открыты, правки и предпросмотр. */
export function useSystemEditor(system: GameSystem | undefined, updateSystem: (fn: (s: GameSystem) => GameSystem) => void, registry: PluginRegistry) {
  const [typeIndex, setTypeIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState<number | null>(null);
  useEffect(() => {
    if (system && typeIndex >= system.entityTypes.length) setTypeIndex(Math.max(0, system.entityTypes.length - 1));
  }, [system, typeIndex]);
  const type = system?.entityTypes[typeIndex];
  const field = fieldIndex === null ? undefined : type?.fields[fieldIndex];
  const computed = useMemo(() => (system && type ? preview(type, {}, system, registry) : undefined), [system, type, registry]);

  const updateType = (fn: (t: EntityType) => EntityType) =>
    updateSystem((s) => ({ ...s, entityTypes: s.entityTypes.map((t, i) => (i === typeIndex ? fn(t) : t)) }));
  const updateField = (patch: Partial<FieldDef>) =>
    updateType((t) => ({ ...t, fields: t.fields.map((f, i) => (i === fieldIndex ? { ...f, ...patch } : f)) }));

  return {
    system, type, field, typeIndex, fieldIndex, computed,
    setTypeIndex: (i: number) => { setTypeIndex(i); setFieldIndex(null); },
    setFieldIndex,
    reset: () => { setTypeIndex(0); setFieldIndex(null); },
    updateSystem, updateType, updateField,
    addType: () => {
      if (!system) return;
      updateSystem((s) => ({ ...s, entityTypes: [...s.entityTypes, newType()] }));
      setTypeIndex(system.entityTypes.length);
      setFieldIndex(null);
    },
    addField: () => {
      if (!type) return;
      updateType((t) => ({ ...t, fields: [...t.fields, newField()] }));
      setFieldIndex(type.fields.length);
    },
    removeField: () => {
      updateType((t) => ({ ...t, fields: t.fields.filter((_, i) => i !== fieldIndex) }));
      setFieldIndex(null);
    },
  };
}
export type SystemEditorState = ReturnType<typeof useSystemEditor>;

export function SystemCanvas({ ed }: { ed: SystemEditorState }) {
  const { t, label, lang } = useLang();
  const { system, type, computed } = ed;
  if (!system) return null;
  return (
    <>
      <div className="ws-document-heading">
        <div>
          <div className="ws-eyebrow">{t("ws.systemEditor")} / {system.version}</div>
          <h1>{label(system.name) || t("ws.untitled")}</h1>
          <p>{t("ws.systemSub")}</p>
        </div>
        <button onClick={ed.addType}>{t("ws.addType")}</button>
      </div>
      <div className="ws-type-tabs">
        {system.entityTypes.map((et, i) => (
          <button key={et.id || i} className={i === ed.typeIndex ? "active" : ""} onClick={() => ed.setTypeIndex(i)}>
            {label(et.label)} <small>{et.fields.length}</small>
          </button>
        ))}
      </div>
      {type && (
        <>
          <div className="ws-section-heading">
            <h2>{t("ws.fieldsOf", { type: label(type.label) })}</h2>
            <button onClick={ed.addField}>{t("ws.addField")}</button>
          </div>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr><th>{t("ws.colName")}</th><th>{t("ws.colType")}</th><th>{t("ws.colFormula")}</th><th>{t("ws.colValue")}</th></tr>
              </thead>
              <tbody>
                {type.fields.map((f, i) => (
                  <tr key={i} className={i === ed.fieldIndex ? "selected" : ""} onClick={() => ed.setFieldIndex(i)}>
                    <td>
                      <button onClick={() => ed.setFieldIndex(i)}>{label(f.label) || t("ws.untitled")}</button>
                      <small>{f.id}</small>
                    </td>
                    <td>{t(`ft.${f.type}`)}</td>
                    <td><code>{f.formula || "—"}</code></td>
                    <td>{computed?.errors[f.id] ? <span className="err">{t("ws.error")}</span> : <strong>{String(computed?.values[f.id] ?? "—")}</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!type.fields.length && <div className="ws-empty">{t("ws.noFields")}</div>}
          </div>
          <div className="ws-hint">{t("ws.previewHint")}</div>
        </>
      )}
      <span hidden>{lang}</span>
    </>
  );
}

export function SystemInspector({ ed }: { ed: SystemEditorState }) {
  const { t, label, lang } = useLang();
  const { system, type, field } = ed;
  if (!system) return null;
  const defaultFor = (kind: FieldType) => (kind === "number" || kind === "resource" ? 0 : kind === "boolean" ? false : kind === "list" ? [] : "");
  return (
    <>
      <div className="ws-property-group">{t("ws.groupDocument")}</div>
      <Input title={t("ws.systemName")} value={label(system.name)} onChange={(v) => ed.updateSystem((s) => ({ ...s, name: rename(s.name, v, lang) }))} />
      <Input title={t("ws.version")} value={system.version} onChange={(version) => ed.updateSystem((s) => ({ ...s, version }))} />
      <Input title={t("ws.description")} multiline value={label(system.description)} onChange={(v) => ed.updateSystem((s) => ({ ...s, description: rename(s.description, v, lang) }))} />
      {type && (
        <>
          <div className="ws-property-group">{t("ws.groupType")}</div>
          <Input title={t("ws.typeName")} value={label(type.label)} onChange={(v) => ed.updateType((x) => ({ ...x, label: rename(x.label, v, lang) }))} />
          <label className="ws-control">
            <span>{t("ws.category")}</span>
            <select value={type.category} onChange={(e) => ed.updateType((x) => ({ ...x, category: e.target.value as EntityCategory }))}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
            </select>
          </label>
        </>
      )}
      {field ? (
        <>
          <div className="ws-property-group">{t("ws.groupField")}</div>
          <Input title={t("ws.fieldName")} value={label(field.label)} onChange={(v) => ed.updateField({ label: rename(field.label, v, lang) })} />
          <Input title={t("ws.fieldId")} value={field.id} onChange={(id) => ed.updateField({ id })} />
          <label className="ws-control">
            <span>{t("ws.fieldType")}</span>
            <select
              value={field.type}
              onChange={(e) => {
                const kind = e.target.value as FieldType;
                ed.updateField({
                  type: kind,
                  default: defaultFor(kind),
                  options: kind === "select" ? (field.options ?? [{ value: "option", label: t("ws.optionDefault") }]) : field.options,
                });
              }}
            >
              {FIELD_TYPES.map((k) => <option key={k} value={k}>{t(`ft.${k}`)}</option>)}
            </select>
          </label>
          <Input title={t("ws.group")} value={field.group ?? ""} onChange={(group) => ed.updateField({ group })} />
          <Input title={t("ws.formula")} value={field.formula ?? ""} placeholder={t("ws.formulaPlaceholder")} onChange={(formula) => ed.updateField({ formula: formula || undefined })} />
          <p className="ws-hint">{t("ws.formulaHint")}</p>
          <JsonInput title={t("ws.default")} value={field.default} onChange={(value) => ed.updateField({ default: value })} />
          {(field.type === "number" || field.type === "resource") && (
            <div className="ws-inline">
              <Input title={t("ws.min")} type="number" value={field.min ?? ""} onChange={(v) => ed.updateField({ min: v === "" ? undefined : Number(v) })} />
              <Input title={t("ws.max")} type="number" value={field.max ?? ""} onChange={(v) => ed.updateField({ max: v === "" ? undefined : Number(v) })} />
            </div>
          )}
          {field.type === "select" && (
            <Input
              title={t("ws.options")}
              multiline
              value={field.options?.map((o) => o.value).join("\n") ?? ""}
              onChange={(v) =>
                ed.updateField({
                  options: v.split("\n").filter(Boolean).map((value) => ({ value, label: field.options?.find((o) => o.value === value)?.label ?? value })),
                })
              }
            />
          )}
          {field.type === "reference" && (
            <label className="ws-control">
              <span>{t("ws.refType")}</span>
              <select value={field.refType ?? ""} onChange={(e) => ed.updateField({ refType: e.target.value || undefined })}>
                <option value="">{t("ws.chooseType")}</option>
                {system.entityTypes.map((x) => <option key={x.id} value={x.id}>{label(x.label)}</option>)}
              </select>
            </label>
          )}
          <Input title={t("ws.fieldDescription")} multiline value={label(field.description)} onChange={(v) => ed.updateField({ description: rename(field.description, v, lang) })} />
          <button className="ws-danger" onClick={() => window.confirm(t("ws.deleteFieldConfirm")) && ed.removeField()}>{t("ws.deleteField")}</button>
        </>
      ) : (
        <p className="ws-hint">{t("ws.pickField")}</p>
      )}
    </>
  );
}
