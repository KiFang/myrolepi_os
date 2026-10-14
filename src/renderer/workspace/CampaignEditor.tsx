import { useEffect, useMemo, useState } from "react";
import type { Campaign, GameSystem } from "../../core";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { createEntity, newId, preview } from "../workspace-model";
import { Input, JsonInput } from "./inputs";

/** Состояние редактора кампании: выбранная сущность и пересчёт её вычисляемых полей. */
export function useCampaignEditor(campaign: Campaign | undefined, system: GameSystem | undefined, updateCampaign: (fn: (c: Campaign) => Campaign) => void, registry: PluginRegistry) {
  const { lang } = useLang();
  const [entityIndex, setEntityIndex] = useState(0);
  const [newTypeIndex, setNewTypeIndex] = useState(0);
  useEffect(() => {
    if (campaign && entityIndex >= campaign.entities.length) setEntityIndex(Math.max(0, campaign.entities.length - 1));
  }, [campaign, entityIndex]);
  const entity = campaign?.entities[entityIndex];
  const entityType = system?.entityTypes.find((x) => x.id === entity?.typeId);
  const computed = useMemo(
    () => (entityType && system && entity ? preview(entityType, entity.values, system, registry) : undefined),
    [entityType, system, entity, registry],
  );
  const updateEntity = (fn: (e: Campaign["entities"][number]) => Campaign["entities"][number]) =>
    updateCampaign((c) => ({ ...c, entities: c.entities.map((e, i) => (i === entityIndex ? fn(e) : e)) }));
  return {
    campaign, system, entity, entityType, computed, entityIndex, newTypeIndex,
    setEntityIndex, setNewTypeIndex, updateCampaign, updateEntity,
    reset: () => { setEntityIndex(0); setNewTypeIndex(0); },
    addEntity: () => {
      const type = system?.entityTypes[newTypeIndex];
      if (!campaign || !type) return;
      updateCampaign((c) => ({ ...c, entities: [...c.entities, createEntity(type, lang, c.entities.filter((e) => e.typeId === type.id).length + 1)] }));
      setEntityIndex(campaign.entities.length);
    },
    addNote: (title: string) => updateCampaign((c) => ({ ...c, notes: [...c.notes, { id: newId("note"), title, body: "" }] })),
  };
}
export type CampaignEditorState = ReturnType<typeof useCampaignEditor>;

export function CampaignCanvas({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system, entity, entityType, computed } = ed;
  if (!campaign) return null;
  return (
    <>
      <div className="ws-document-heading">
        <div>
          <div className="ws-eyebrow">{t("ws.campaignEyebrow")} / {system ? label(system.name) : t("ws.systemMissing")}</div>
          <h1>{campaign.name}</h1>
          <p>{t("ws.campaignSub")}</p>
        </div>
      </div>
      <div className="ws-section-heading">
        <h2>{t("ws.entities")} <small>{campaign.entities.length}</small></h2>
        <div className="ws-inline">
          <select aria-label={t("ws.newEntityType")} value={ed.newTypeIndex} onChange={(e) => ed.setNewTypeIndex(Number(e.target.value))}>
            {system?.entityTypes.map((x, i) => <option key={x.id} value={i}>{label(x.label)}</option>)}
          </select>
          <button disabled={!system?.entityTypes[ed.newTypeIndex]} onClick={ed.addEntity}>{t("ws.add")}</button>
        </div>
      </div>
      <div className="ws-entities">
        {campaign.entities.map((e, i) => (
          <button className={i === ed.entityIndex ? "selected" : ""} key={e.id} onClick={() => ed.setEntityIndex(i)}>
            {e.name}
            <small>{label(system?.entityTypes.find((x) => x.id === e.typeId)?.label) || t("ws.typeMissing")}</small>
          </button>
        ))}
        {!campaign.entities.length && <div className="ws-empty">{t("ws.noEntities")}</div>}
      </div>
      {entity && (
        <div className="ws-sheet">
          <Input title={t("ws.entityName")} value={entity.name} onChange={(name) => ed.updateEntity((e) => ({ ...e, name }))} />
          {!entityType && <p className="err">{t("ws.entityTypeMissing")}</p>}
          <div className="ws-sheet-fields">
            {entityType?.fields.map((f) => {
              const value = entity.values[f.id] ?? f.default;
              const set = (v: unknown) => ed.updateEntity((e) => ({ ...e, values: { ...e.values, [f.id]: v } }));
              const numeric = f.type === "number" || f.type === "resource";
              return (
                <div key={f.id}>
                  {f.formula ? (
                    <div className="ws-computed">
                      <span>{label(f.label)} <small>ƒ</small></span>
                      <strong>{computed?.errors[f.id] ? <span className="err">{computed.errors[f.id]}</span> : String(computed?.values[f.id] ?? "—")}</strong>
                    </div>
                  ) : f.type === "boolean" ? (
                    <label className="ws-checkbox">
                      <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />
                      {label(f.label)}
                    </label>
                  ) : f.type === "select" ? (
                    <label className="ws-control">
                      <span>{label(f.label)}</span>
                      <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                        <option value="">{t("ws.notSelected")}</option>
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{label(o.label)}</option>)}
                      </select>
                    </label>
                  ) : f.type === "list" || (f.type === "resource" && typeof value === "object") ? (
                    <JsonInput title={label(f.label)} value={value} onChange={set} />
                  ) : (
                    <Input
                      title={label(f.label)}
                      value={String(value ?? "")}
                      type={numeric ? "number" : "text"}
                      min={f.min}
                      max={f.max}
                      multiline={f.type === "longtext"}
                      onChange={(v) => set(numeric ? (v === "" ? undefined : Number(v)) : v)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="ws-section-heading">
        <h2>{t("ws.notes")}</h2>
        <button onClick={() => ed.addNote(t("ws.newNote"))}>{t("ws.addNote")}</button>
      </div>
      {campaign.notes.map((n) => (
        <div className="ws-note" key={n.id}>
          <Input title={t("ws.noteTitle")} value={n.title} onChange={(title) => ed.updateCampaign((c) => ({ ...c, notes: c.notes.map((x) => (x.id === n.id ? { ...x, title } : x)) }))} />
          <Input title={t("ws.noteBody")} value={n.body} multiline onChange={(body) => ed.updateCampaign((c) => ({ ...c, notes: c.notes.map((x) => (x.id === n.id ? { ...x, body } : x)) }))} />
        </div>
      ))}
    </>
  );
}

export function CampaignInspector({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system } = ed;
  if (!campaign) return null;
  return (
    <>
      <div className="ws-property-group">{t("ws.groupCampaign")}</div>
      <Input title={t("ws.campaignName")} value={campaign.name} onChange={(name) => ed.updateCampaign((c) => ({ ...c, name }))} />
      <p className="ws-hint">{t("ws.rules", { name: system ? label(system.name) : t("ws.rulesMissing") })}</p>
      <div className="ws-property-group">{t("ws.summary")}</div>
      <p>{t("ws.summaryCount", { entities: campaign.entities.length, notes: campaign.notes.length })}</p>
      <p className="ws-hint">{t("ws.computedHint")}</p>
    </>
  );
}
