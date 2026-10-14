import { useEffect, useMemo, useState } from "react";
import type { ActionDef, Campaign, Encounter, Entity, GameSystem } from "../../core";
import { adjustResource, computeEntity, loc, rollInitiative, runAction } from "../../core";
import { CardRenderer } from "../cards/CardRenderer";
import { putImage, resolveSrc } from "../assets";
import { Icon } from "../icons";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import type { RollEntry } from "../rolls";
import { createEntity, newId, preview } from "../workspace-model";
import { CampaignGallery } from "./CampaignGallery";
import { CampaignNotes } from "./CampaignNotes";
import { CombatTracker } from "./CombatTracker";
import { Input, JsonInput } from "./inputs";

export type CampaignTab = "heroes" | "cards" | "combat" | "notes";

/** Состояние редактора кампании: выбранный герой, вкладка, броски действий, бой. */
export function useCampaignEditor(
  campaign: Campaign | undefined,
  system: GameSystem | undefined,
  updateCampaign: (fn: (c: Campaign) => Campaign) => void,
  registry: PluginRegistry,
  onRoll: (entry: Omit<RollEntry, "id" | "time">) => void,
) {
  const { lang } = useLang();
  const [entityIndex, setEntityIndex] = useState(0);
  const [newTypeIndex, setNewTypeIndex] = useState(0);
  const [tab, setTab] = useState<CampaignTab>("heroes");
  useEffect(() => {
    if (campaign && entityIndex >= campaign.entities.length) setEntityIndex(Math.max(0, campaign.entities.length - 1));
  }, [campaign, entityIndex]);
  const entity = campaign?.entities[entityIndex];
  const entityType = system?.entityTypes.find((x) => x.id === entity?.typeId);
  const computed = useMemo(
    () => (entityType && system && entity ? preview(entityType, entity.values, system, registry) : undefined),
    [entityType, system, entity, registry, lang],
  );
  const updateEntity = (fn: (e: Entity) => Entity) => updateCampaign((c) => ({ ...c, entities: c.entities.map((e, i) => (i === entityIndex ? fn(e) : e)) }));
  const patchEntity = (id: string, fn: (e: Entity) => Entity) => updateCampaign((c) => ({ ...c, entities: c.entities.map((e) => (e.id === id ? fn(e) : e)) }));
  const opts = { system, functions: registry.functions };

  return {
    campaign, system, entity, entityType, computed, entityIndex, newTypeIndex, tab, registry,
    setEntityIndex, setNewTypeIndex, setTab, updateCampaign, updateEntity, patchEntity,
    reset: () => { setEntityIndex(0); setNewTypeIndex(0); setTab("heroes"); },
    addEntity: () => {
      const type = system?.entityTypes[newTypeIndex];
      if (!campaign || !type) return;
      updateCampaign((c) => ({ ...c, entities: [...c.entities, createEntity(type, lang, c.entities.filter((e) => e.typeId === type.id).length + 1)] }));
      setEntityIndex(campaign.entities.length);
    },
    removeEntity: () => updateCampaign((c) => ({ ...c, entities: c.entities.filter((_, i) => i !== entityIndex), encounters: c.encounters?.map((en) => ({ ...en, combatants: en.combatants.filter((x) => x.entityId !== entity?.id) })) })),
    addNote: (title: string) => updateCampaign((c) => ({ ...c, notes: [...c.notes, { id: newId("note"), title, body: "" }] })),
    /** Бросок действия героя: результат уходит в журнал. */
    run: (target: Entity, action: ActionDef, inputs: Record<string, unknown> = {}) => {
      const type = system?.entityTypes.find((x) => x.id === target.typeId);
      if (!type) return;
      try {
        const r = runAction(type, action, target.values, inputs, opts);
        onRoll({ who: target.name, entityId: target.id, action: loc(action.label, lang), value: r.value, rolls: r.rolls, effects: r.effects });
      } catch (e) {
        onRoll({ who: target.name, entityId: target.id, action: loc(action.label, lang), value: `⚠ ${(e as Error).message}`, rolls: [], effects: [] });
      }
    },
    applyEffects: (entityId: string, effects: RollEntry["effects"]) =>
      patchEntity(entityId, (e) => ({ ...e, values: { ...e.values, ...Object.fromEntries(effects.map((x) => [x.field, x.to])) } })),
    rollInitiativeFor: (target: Entity) => {
      const type = system?.entityTypes.find((x) => x.id === target.typeId);
      try { return rollInitiative(type, target.values, opts); } catch { return 0; }
    },
    computedFor: (target: Entity) => {
      const type = system?.entityTypes.find((x) => x.id === target.typeId);
      return type ? computeEntity(type, target.values, opts).values : {};
    },
    /** Быстрая правка ресурса (здоровья): берёт текущее значение с учётом значения по умолчанию, не уходит ниже нуля. */
    adjust: (id: string, field: string, delta: number) =>
      patchEntity(id, (e) => {
        const type = system?.entityTypes.find((x) => x.id === e.typeId);
        const current = e.values[field] ?? type?.fields.find((f) => f.id === field)?.default ?? 0;
        return { ...e, values: { ...e.values, [field]: adjustResource(current, delta, { min: 0 }) } };
      }),
    addEncounter: (name: string) => {
      const en: Encounter = { id: newId("fight"), name, round: 1, turn: 0, combatants: [] };
      updateCampaign((c) => ({ ...c, encounters: [...(c.encounters ?? []), en] }));
      return en.id;
    },
    updateEncounter: (id: string, fn: (e: Encounter) => Encounter) => updateCampaign((c) => ({ ...c, encounters: (c.encounters ?? []).map((e) => (e.id === id ? fn(e) : e)) })),
    removeEncounter: (id: string) => updateCampaign((c) => ({ ...c, encounters: (c.encounters ?? []).filter((e) => e.id !== id) })),
  };
}
export type CampaignEditorState = ReturnType<typeof useCampaignEditor>;

/** Кнопки действий героя. Если у действия есть вопросы (бонус и т.п.) — сначала спрашиваем. */
export function ActionBar({ ed, entity }: { ed: CampaignEditorState; entity: Entity }) {
  const { t, label } = useLang();
  const type = ed.system?.entityTypes.find((x) => x.id === entity.typeId);
  const [asking, setAsking] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  if (!type?.actions?.length) return null;
  const pending = type.actions.find((a) => a.id === asking);
  return (
    <div className="ws-actionbar">
      <div className="ws-actionbar-buttons">
        <span className="muted">{t("ws.rollAction")}:</span>
        {type.actions.map((a) => (
          <button key={a.id} className="ws-with-icon" onClick={() => (a.inputs?.length ? (setAsking(a.id), setAnswers({})) : ed.run(entity, a))}><Icon name="dice" size={14} />{label(a.label)}</button>
        ))}
      </div>
      {pending && (
        <div className="ws-inline ws-row-edit">
          {pending.inputs!.map((i) => (
            <Input key={i.id} title={label(i.label)} type="number" value={String(answers[i.id] ?? i.default ?? 0)} onChange={(v) => setAnswers({ ...answers, [i.id]: Number(v) || 0 })} />
          ))}
          <button className="ws-primary ws-with-icon" onClick={() => { ed.run(entity, pending, answers); setAsking(null); }}><Icon name="dice" size={14} />{t("dice.roll")}</button>
        </div>
      )}
    </div>
  );
}

function Heroes({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system, entity, entityType, computed } = ed;
  const [view, setView] = useState<"form" | "card">("form");
  if (!campaign) return null;
  const cardViews = entityType?.cardViews ?? [];
  const cardView = cardViews.find((v) => v.id === entity?.cardView) ?? cardViews[0];
  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("ws.entities")} <small>{campaign.entities.length}</small></h2>
        <div className="ws-inline">
          <select aria-label={t("ws.newEntityType")} value={ed.newTypeIndex} onChange={(e) => ed.setNewTypeIndex(Number(e.target.value))}>
            {system?.entityTypes.map((x, i) => <option key={x.id} value={i}>{label(x.label)}</option>)}
          </select>
          <button className="ws-with-icon" disabled={!system?.entityTypes[ed.newTypeIndex]} onClick={ed.addEntity}><Icon name="plus" />{t("ws.add")}</button>
        </div>
      </div>
      <div className="ws-entities">
        {campaign.entities.map((e, i) => (
          <button className={i === ed.entityIndex ? "selected" : ""} key={e.id} onClick={() => ed.setEntityIndex(i)}>
            {e.name}
            <small>{label(system?.entityTypes.find((x) => x.id === e.typeId)?.label) || t("ws.typeMissing")}</small>
          </button>
        ))}
        {!campaign.entities.length && <div className="ws-empty">{system?.entityTypes.length ? t("ws.noEntities") : t("ws.noTypesForCampaign")}</div>}
      </div>
      {entity && (
        <div className="ws-sheet">
          <div className="ws-sheet-head">
            <Input title={t("ws.entityName")} value={entity.name} onChange={(name) => ed.updateEntity((e) => ({ ...e, name }))} />
            <button className="ws-danger ws-with-icon" onClick={() => window.confirm(t("ws.deleteEntityConfirm", { name: entity.name })) && ed.removeEntity()}><Icon name="trash" />{t("ws.deleteEntity")}</button>
          </div>
          <ActionBar ed={ed} entity={entity} />
          {entityType && (
            <div className="ws-mode-tabs ws-mini-tabs">
              <button className={view === "form" ? "active" : ""} onClick={() => setView("form")}>{t("ws.sheetForm")}</button>
              <button className={view === "card" ? "active" : ""} onClick={() => setView("card")}>{t("ws.sheetCard")}</button>
              {view === "card" && cardViews.length > 1 && (
                <select className="ws-view-select" aria-label={t("ws.chooseView")} value={cardView?.id} onChange={(e) => ed.updateEntity((x) => ({ ...x, cardView: e.target.value }))}>
                  {cardViews.map((v) => <option key={v.id} value={v.id}>{label(v.name)}</option>)}
                </select>
              )}
            </div>
          )}
          {!entityType && <p className="err">{t("ws.entityTypeMissing")}</p>}
          {view === "card" && entityType && cardView ? (
            <div className="ws-card-solo">
              <CardRenderer type={entityType} view={cardView} name={entity.name} values={computed?.values ?? {}} registry={ed.registry} onRun={(a) => ed.run(entity, a)} />
            </div>
          ) : (
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
                      <label className="ws-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />{label(f.label)}</label>
                    ) : f.type === "select" ? (
                      <label className="ws-control">
                        <span>{label(f.label)}</span>
                        <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                          <option value="">{t("ws.notSelected")}</option>
                          {f.options?.map((o) => <option key={o.value} value={o.value}>{label(o.label)}</option>)}
                        </select>
                      </label>
                    ) : f.type === "image" ? (
                      <div className="ws-control">
                        <span>{label(f.label)}</span>
                        {typeof value === "string" && value && <img className="ws-image-preview" src={resolveSrc(value)} alt="" />}
                        <input type="file" accept="image/*" aria-label={label(f.label)} onChange={async (ev) => {
                          const file = ev.target.files?.[0];
                          ev.target.value = "";
                          if (!file) return;
                          const r = await putImage(file);
                          if (r.ok) set(r.ref);
                          else window.alert(t(r.code === "too-big" ? "ws.imageTooBig" : r.code === "bad-type" ? "ws.imageBadType" : "ws.imageFailed"));
                        }} />
                        {typeof value === "string" && value && <button onClick={() => set("")}>{t("ws.removeImage")}</button>}
                      </div>
                    ) : f.type === "list" || (f.type === "resource" && typeof value === "object") ? (
                      <JsonInput title={label(f.label)} value={value} onChange={set} />
                    ) : (
                      <Input title={label(f.label)} value={String(value ?? "")} type={numeric ? "number" : "text"} min={f.min} max={f.max} multiline={f.type === "longtext"} onChange={(v) => set(numeric ? (v === "" ? undefined : Number(v)) : v)} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function CampaignCanvas({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system } = ed;
  if (!campaign) return null;
  const TABS: CampaignTab[] = ["heroes", "cards", "combat", "notes"];
  return (
    <>
      <div className="ws-document-heading">
        <div>
          <div className="ws-eyebrow">{t("ws.campaignEyebrow")} / {system ? label(system.name) : t("ws.systemMissing")}</div>
          <h1>{campaign.name}</h1>
          <p>{t("ws.campaignSub")}</p>
        </div>
      </div>
      <div className="ws-mode-tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={ed.tab === k} className={ed.tab === k ? "active" : ""} onClick={() => ed.setTab(k)}>{t(`ws.ctab.${k}`)}</button>
        ))}
      </div>
      {ed.tab === "heroes" && <Heroes ed={ed} />}
      {ed.tab === "cards" && <CampaignGallery ed={ed} />}
      {ed.tab === "combat" && <CombatTracker ed={ed} />}
      {ed.tab === "notes" && <CampaignNotes ed={ed} />}
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
