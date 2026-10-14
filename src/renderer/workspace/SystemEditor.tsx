import { useEffect, useMemo, useState } from "react";
import type { ActionDef, CardBlock, CardView, EntityCategory, EntityType, FieldDef, FieldType, GameSystem } from "../../core";
import { useLang } from "../lang";
import { useSimple } from "../simple";
import { TipBar } from "../tips";
import { useToast } from "../toasts";
import type { PluginRegistry } from "../plugin-host";
import { both, fieldIdProblem, newField, newId, newType, preview, rename } from "../workspace-model";
import { ActionsEditor } from "./ActionsEditor";
import { CardDesigner, CardInspector } from "./CardDesigner";
import { Icon } from "../icons";
import { CommitInput, HelpLink, Input, JsonInput } from "./inputs";
import { appendToView, uniqueTypeId } from "../templates";
import type { FieldPreset, TypeTemplate } from "../templates";
import { BestiaryEditor } from "./BestiaryEditor";
import { FieldPresetsMenu, TypeTemplatesMenu } from "./PresetMenus";

const CATEGORIES: EntityCategory[] = ["character", "creature", "vehicle", "structure", "settlement", "item", "location", "faction", "custom"];
const FIELD_TYPES: FieldType[] = ["number", "text", "longtext", "boolean", "select", "resource", "list", "reference", "image"];

/** Состояние редактора выбранной системы: какой тип и поле открыты, правки и предпросмотр. */
export function useSystemEditor(system: GameSystem | undefined, updateSystem: (fn: (s: GameSystem) => GameSystem) => void, registry: PluginRegistry, onRenameField: (typeId: string, from: string, to: string) => void) {
  const [typeIndex, setTypeIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<"fields" | "cards" | "actions" | "bestiary">("fields");
  const [viewIndexRaw, setViewIndex] = useState(0);
  const [blockId, setBlockId] = useState<string | null>(null);
  useEffect(() => {
    if (system && typeIndex >= system.entityTypes.length) setTypeIndex(Math.max(0, system.entityTypes.length - 1));
  }, [system, typeIndex]);
  const type = system?.entityTypes[typeIndex];
  const field = fieldIndex === null ? undefined : type?.fields[fieldIndex];
  const viewIndex = type ? Math.min(viewIndexRaw, Math.max(0, type.cardViews.length - 1)) : 0;
  const view = type?.cardViews[viewIndex];
  const block = view?.blocks.find((b) => b.id === blockId);
  const { lang } = useLang();
  // lang в зависимостях: сообщения об ошибках формул зависят от языка
  const computed = useMemo(() => (system && type ? preview(type, {}, system, registry) : undefined), [system, type, registry, lang]);

  const updateType = (fn: (t: EntityType) => EntityType) =>
    updateSystem((s) => ({ ...s, entityTypes: s.entityTypes.map((t, i) => (i === typeIndex ? fn(t) : t)) }));
  const updateField = (patch: Partial<FieldDef>) =>
    updateType((t) => ({ ...t, fields: t.fields.map((f, i) => (i === fieldIndex ? { ...f, ...patch } : f)) }));

  const updateView = (fn: (v: CardView) => CardView) =>
    updateType((t) => ({ ...t, cardViews: t.cardViews.map((v, i) => (i === viewIndex ? fn(v) : v)) }));
  const BLOCK_SIZE: Record<string, [number, number]> = { heading: [12, 2], field: [6, 2], text: [12, 2], divider: [12, 1], image: [4, 4], bar: [12, 2], actions: [12, 2] };

  return {
    system, type, field, typeIndex, fieldIndex, computed, registry,
    mode, setMode, viewIndex, view, block, blockId, setBlockId,
    setViewIndex: (i: number) => { setViewIndex(i); setBlockId(null); },
    updateView,
    updateBlock: (id: string, patch: Partial<CardBlock>) => updateView((v) => ({ ...v, blocks: v.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
    addView: () => {
      if (!type) return;
      updateType((t) => ({ ...t, cardViews: [...t.cardViews, { id: newId("view"), name: both("ws.newView"), blocks: [] }] }));
      setViewIndex(type.cardViews.length);
      setBlockId(null);
    },
    removeView: () => { updateType((t) => ({ ...t, cardViews: t.cardViews.filter((_, i) => i !== viewIndex) })); setBlockId(null); },
    addBlock: (kind: string) => {
      if (!view) return;
      const [w, h] = BLOCK_SIZE[kind] ?? [6, 2];
      const y = Math.max(0, ...view.blocks.map((b) => b.y + b.h));
      const b: CardBlock = { id: newId("block"), kind, x: 0, y, w, h, field: kind === "field" || kind === "bar" ? type?.fields.find((f) => kind === "bar" ? f.type === "resource" || f.type === "number" : true)?.id : undefined };
      updateView((v) => ({ ...v, blocks: [...v.blocks, b] }));
      setBlockId(b.id);
    },
    removeBlock: () => { if (blockId) { updateView((v) => ({ ...v, blocks: v.blocks.filter((b) => b.id !== blockId) })); setBlockId(null); } },
    /** Переименование «имени в формулах» с обновлением всех ссылок (одной правкой, её можно отменить). */
    renameField: (to: string) => { if (type && field) onRenameField(type.id, field.id, to); },
    updateActions: (fn: (a: ActionDef[]) => ActionDef[]) => updateType((t) => ({ ...t, actions: fn(t.actions ?? []) })),
    setTypeIndex: (i: number) => { setTypeIndex(i); setFieldIndex(null); setViewIndex(0); setBlockId(null); },
    setFieldIndex,
    reset: () => { setTypeIndex(0); setFieldIndex(null); setViewIndex(0); setBlockId(null); },
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
    /** Готовые параметры: добавляются те, которых ещё нет, и сразу появляются на первой карточке типа. */
    addPresets: (presets: FieldPreset[]) => {
      if (!type) return 0;
      const have = new Set(type.fields.map((f) => f.id));
      const fresh = presets.flatMap((p) => p.fields).filter((f, i, all) => !have.has(f.id) && all.findIndex((x) => x.id === f.id) === i).map((f) => structuredClone(f));
      if (!fresh.length) return 0;
      const bars = Object.assign({}, ...presets.map((p) => p.bars ?? {})) as Record<string, string>;
      updateType((t) => ({
        ...t,
        fields: [...t.fields, ...fresh],
        cardViews: t.cardViews.map((v, i) => (i === 0 ? appendToView(v, fresh, bars) : v)),
      }));
      setFieldIndex(type.fields.length);
      return fresh.length;
    },
    addTypeFromTemplate: (tpl: TypeTemplate) => {
      if (!system) return;
      const built = tpl.build();
      built.id = uniqueTypeId(built.id, system.entityTypes.map((x) => x.id));
      updateSystem((s) => ({ ...s, entityTypes: [...s.entityTypes, built] }));
      setTypeIndex(system.entityTypes.length);
      setFieldIndex(null);
      setMode("fields");
    },
    removeType: () => {
      updateSystem((s) => ({ ...s, entityTypes: s.entityTypes.filter((_, i) => i !== typeIndex) }));
      setFieldIndex(null);
    },
    removeField: () => {
      updateType((t) => ({ ...t, fields: t.fields.filter((_, i) => i !== fieldIndex) }));
      setFieldIndex(null);
    },
  };
}
export type SystemEditorState = ReturnType<typeof useSystemEditor>;

export function SystemCanvas({ ed }: { ed: SystemEditorState }) {
  const { t, label } = useLang();
  const notify = useToast();
  const simple = useSimple();
  const { system, type, computed } = ed;
  const mode = simple && ed.mode === "actions" ? "fields" : ed.mode;
  if (!system) return null;
  return (
    <>
      <div className="ws-document-heading">
        <div>
          <div className="ws-eyebrow">{t("ws.systemEditor")} / {system.version}</div>
          <h1>{label(system.name) || t("ws.untitled")}</h1>
          <p>{t("ws.systemSub")}</p>
        </div>
        <div className="ws-inline">
          <TypeTemplatesMenu onPick={ed.addTypeFromTemplate} />
          <button className="ws-with-icon" onClick={ed.addType}><Icon name="plus" />{t("ws.addType")}</button>
        </div>
      </div>
      <p className="ws-hint ws-hint-tight">{t("ws.typesHint")}</p>
      <div className="ws-type-tabs">
        {system.entityTypes.map((et, i) => (
          <button key={et.id || i} className={i === ed.typeIndex ? "active" : ""} onClick={() => ed.setTypeIndex(i)}>
            {label(et.label)} <small>{et.fields.length}</small>
          </button>
        ))}
      </div>
      {type && (
        <div className="ws-mode-tabs" role="tablist">
          {(simple ? (["fields", "cards", "bestiary"] as const) : (["fields", "cards", "actions", "bestiary"] as const)).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => ed.setMode(m)}>{t(`ws.mode.${m}`)}</button>
          ))}
        </div>
      )}
      {type && <TipBar context={`system.${mode}`} />}
      {type && mode === "cards" && <CardDesigner ed={ed} registry={ed.registry} />}
      {type && mode === "actions" && <ActionsEditor ed={ed} />}
      {type && mode === "bestiary" && <BestiaryEditor ed={ed} />}
      {type && mode === "fields" && (
        <>
          <div className="ws-section-heading">
            <h2>{t("ws.fieldsOf", { type: label(type.label) })}</h2>
            <div className="ws-inline">
              <FieldPresetsMenu existing={type.fields} onAdd={(p) => { const n = ed.addPresets(p); if (n) notify(t("tpl.added", { n })); }} />
              <button className="ws-with-icon" onClick={ed.addField}><Icon name="plus" />{t("ws.addField")}</button>
            </div>
          </div>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr><th>{t("ws.colName")}</th><th>{t("ws.colType")}</th>{!simple && <th>{t("ws.colFormula")}</th>}<th>{t("ws.colValue")}</th></tr>
              </thead>
              <tbody>
                {type.fields.map((f, i) => (
                  <tr key={i} className={i === ed.fieldIndex ? "selected" : ""} onClick={() => ed.setFieldIndex(i)}>
                    <td>
                      <button onClick={() => ed.setFieldIndex(i)}>{label(f.label) || t("ws.untitled")}</button>
                      {!simple && <small>{f.id}</small>}
                    </td>
                    <td>{t(`ft.${f.type}`)}</td>
                    {!simple && <td><code>{f.formula || "—"}</code></td>}
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
    </>
  );
}

export function SystemInspector({ ed }: { ed: SystemEditorState }) {
  const { t, label, lang } = useLang();
  const simple = useSimple();
  const { system, type, field } = ed;
  const mode = simple && ed.mode === "actions" ? "fields" : ed.mode;
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
          {simple ? (
            <label className="ws-control">
              <span>{t("simple.initiative")}</span>
              <select aria-label={t("simple.initiative")} value={type.initiative ?? ""} onChange={(e) => ed.updateType((x) => ({ ...x, initiative: e.target.value || undefined }))}>
                <option value="">{t("simple.initiativeNone")}</option>
                <option value="1d20">{t("simple.initiativeD20")}</option>
                {type.fields.filter((f) => f.type === "number").map((f) => <option key={f.id} value={`1d20 + ${f.id}`}>{t("simple.initiativePlus", { name: label(f.label) })}</option>)}
                {type.initiative && type.initiative !== "1d20" && !type.fields.some((f) => type.initiative === `1d20 + ${f.id}`) && <option value={type.initiative}>{t("simple.initiativeCustom", { f: type.initiative })}</option>}
              </select>
              <small className="ws-field-hint">{t("simple.initiativeHint")}</small>
            </label>
          ) : (
            <Input title={t("ws.initiative")} value={type.initiative ?? ""} placeholder="1d20" hint={t("ws.initiativeHint")} onChange={(v) => ed.updateType((x) => ({ ...x, initiative: v || undefined }))} />
          )}
          <button className="ws-danger ws-with-icon" onClick={() => window.confirm(t("ws.deleteTypeConfirm", { name: label(type.label) })) && ed.removeType()}><Icon name="trash" />{t("ws.deleteType")}</button>
        </>
      )}
      {mode === "cards" ? <CardInspector ed={ed} /> : mode === "actions" || mode === "bestiary" ? null : field ? (
        <>
          <div className="ws-property-group">{t("ws.groupField")}</div>
          <Input title={t("ws.fieldName")} value={label(field.label)} onChange={(v) => ed.updateField({ label: rename(field.label, v, lang) })} />
          {!simple && <CommitInput title={t("ws.fieldId")} value={field.id} hint={t("ws.fieldIdHint")} validate={(next) => (type ? fieldIdProblem(type, field.id, next, lang) : "")} onCommit={ed.renameField} />}
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
          {!simple && <Input title={t("ws.group")} value={field.group ?? ""} placeholder={t("ws.groupPlaceholder")} onChange={(group) => ed.updateField({ group })} />}
          {!simple && <Input title={t("ws.formula")} value={field.formula ?? ""} placeholder={t("ws.formulaPlaceholder")} onChange={(formula) => ed.updateField({ formula: formula || undefined })} />}
          {!simple && <p className="ws-hint ws-hint-tight">{t("ws.formulaHint")} <HelpLink topic="formulas" /></p>}
          {simple ? (
            field.formula ? <p className="ws-hint">ƒ {field.formula}</p>
            : field.type === "number" || field.type === "resource" ? <Input title={t("simple.defaultValue")} type="number" value={typeof field.default === "number" ? field.default : 0} onChange={(v) => ed.updateField({ default: v === "" ? 0 : Number(v) })} />
            : field.type === "text" || field.type === "longtext" ? <Input title={t("simple.defaultValue")} value={String(field.default ?? "")} multiline={field.type === "longtext"} onChange={(v) => ed.updateField({ default: v })} />
            : field.type === "boolean" ? <label className="ws-checkbox"><input type="checkbox" checked={Boolean(field.default)} onChange={(e) => ed.updateField({ default: e.target.checked })} />{t("simple.defaultValue")}</label>
            : null
          ) : <JsonInput title={t("ws.default")} value={field.default} onChange={(value) => ed.updateField({ default: value })} />}
          {!simple && (field.type === "number" || field.type === "resource") && (
            <div className="ws-inline">
              <Input title={t("ws.min")} type="number" value={field.min ?? ""} onChange={(v) => ed.updateField({ min: v === "" ? undefined : Number(v) })} />
              <Input title={t("ws.max")} type="number" value={field.max ?? ""} onChange={(v) => ed.updateField({ max: v === "" ? undefined : Number(v) })} />
            </div>
          )}
          {field.type === "select" && (
            <Input
              title={t("ws.options")}
              hint={t("ws.optionsHint")}
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
          <button className="ws-danger ws-with-icon" onClick={() => window.confirm(t("ws.deleteFieldConfirm")) && ed.removeField()}><Icon name="trash" />{t("ws.deleteField")}</button>
        </>
      ) : (
        <p className="ws-hint">{t("ws.pickField")}</p>
      )}
    </>
  );
}
