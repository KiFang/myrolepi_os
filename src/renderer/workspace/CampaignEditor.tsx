import { useEffect, useMemo, useState } from "react";
import type { ActionDef, Campaign, Encounter, Entity, GameSystem, MapMarker } from "../../core";
import { adjustResource, computeEntity, loc, rollInitiative, runAction } from "../../core";
import { CardRenderer } from "../cards/CardRenderer";
import { Icon } from "../icons";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import type { RollEntry } from "../rolls";
import { createEntity, newId, preview } from "../workspace-model";
import { EntityForm } from "./EntityForm";
import { CampaignGallery } from "./CampaignGallery";
import { CampaignMaps } from "./CampaignMaps";
import { CampaignNotes } from "./CampaignNotes";
import { CampaignScenes } from "./CampaignScenes";
import { CombatTracker } from "./CombatTracker";
import { Input } from "./inputs";

export type CampaignTab = "heroes" | "cards" | "combat" | "scenes" | "maps" | "notes";

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
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [activeScene, setActiveScene] = useState<string | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
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
    sceneId, setSceneId, mapId, setMapId, activeScene, setActiveScene, focusNote,
    setEntityIndex, setNewTypeIndex, setTab, updateCampaign, updateEntity, patchEntity,
    reset: () => { setEntityIndex(0); setNewTypeIndex(0); setTab("heroes"); setSceneId(null); setMapId(null); setFocusNote(null); },
    /** Переход по метке карты или по ссылке сцены: к сцене, герою или заметке. */
    openTarget: (to: Pick<MapMarker, "sceneId" | "entityId" | "noteId">) => {
      if (to.sceneId) { setSceneId(to.sceneId); setTab("scenes"); }
      else if (to.entityId && campaign) { const i = campaign.entities.findIndex((e) => e.id === to.entityId); if (i >= 0) { setEntityIndex(i); setTab("heroes"); } }
      else if (to.noteId) { setFocusNote(to.noteId); setTab("notes"); }
    },
    addEntity: () => {
      const type = system?.entityTypes[newTypeIndex];
      if (!campaign || !type) return;
      updateCampaign((c) => ({ ...c, entities: [...c.entities, createEntity(type, lang, c.entities.filter((e) => e.typeId === type.id).length + 1)] }));
      setEntityIndex(campaign.entities.length);
    },
    removeEntity: () => updateCampaign((c) => ({
      ...c,
      entities: c.entities.filter((_, i) => i !== entityIndex),
      encounters: c.encounters?.map((en) => ({ ...en, combatants: en.combatants.filter((x) => x.entityId !== entity?.id) })),
      scenes: c.scenes?.map((s) => ({ ...s, entityIds: s.entityIds.filter((id) => id !== entity?.id) })),
      maps: c.maps?.map((m) => ({ ...m, markers: m.markers.map((k) => (k.entityId === entity?.id ? { ...k, entityId: undefined } : k)) })),
    })),
    /** Добавляет в кампанию копию заготовки из бестиария системы. */
    addFromBestiary: (beastId: string) => {
      const b = system?.bestiary?.find((x) => x.id === beastId);
      if (!campaign || !b) return;
      updateCampaign((c) => ({ ...c, entities: [...c.entities, { id: newId("entity"), typeId: b.typeId, name: b.name, values: structuredClone(b.values) }] }));
      setEntityIndex(campaign.entities.length);
    },
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
          {!!system?.bestiary?.length && (
            <select aria-label={t("bestiary.fromBestiary")} value="" onChange={(e) => { if (e.target.value) ed.addFromBestiary(e.target.value); }}>
              <option value="">{t("bestiary.fromBestiary")}</option>
              {system.entityTypes.filter((x) => system.bestiary!.some((b) => b.typeId === x.id)).map((x) => (
                <optgroup key={x.id} label={label(x.label)}>{system.bestiary!.filter((b) => b.typeId === x.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
              ))}
            </select>
          )}
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
            entityType && <EntityForm type={entityType} values={entity.values} computed={computed} onSet={(id, v) => ed.updateEntity((e) => ({ ...e, values: { ...e.values, [id]: v } }))} />
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
  const TABS: CampaignTab[] = ["heroes", "cards", "combat", "scenes", "maps", "notes"];
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
      {ed.tab === "scenes" && <CampaignScenes ed={ed} />}
      {ed.tab === "maps" && <CampaignMaps ed={ed} />}
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
      <p>{t("ws.summaryExtra", { scenes: campaign.scenes?.length ?? 0, maps: campaign.maps?.length ?? 0 })}</p>
      <p className="ws-hint">{t("ws.computedHint")}</p>
    </>
  );
}
