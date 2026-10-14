import { useState } from "react";
import { turnOrder } from "../../core";
import type { Combatant } from "../../core";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { newId } from "../workspace-model";
import type { CampaignEditorState } from "./CampaignEditor";
import { Input } from "./inputs";

/** Трекер боя: инициатива, раунды, очередь ходов, быстрые правки здоровья. */
export function CombatTracker({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system } = ed;
  const [selected, setSelected] = useState<string | null>(null);
  const [delta, setDelta] = useState<Record<string, string>>({});
  const [toAdd, setToAdd] = useState("");
  if (!campaign || !system) return null;
  const encounters = campaign.encounters ?? [];
  const fight = encounters.find((e) => e.id === selected) ?? encounters[0];
  const entityOf = (id: string) => campaign.entities.find((e) => e.id === id);
  const ordered = fight ? turnOrder(fight.combatants) : [];
  const free = campaign.entities.filter((e) => !fight?.combatants.some((c) => c.entityId === e.id));
  const upd = (fn: (c: Combatant[]) => Combatant[]) => fight && ed.updateEncounter(fight.id, (f) => ({ ...f, combatants: fn(f.combatants) }));
  const hpField = (typeId: string) => system.entityTypes.find((x) => x.id === typeId)?.fields.find((f) => f.type === "resource");
  const next = () => {
    if (!fight || !ordered.length) return;
    const turn = fight.turn + 1;
    ed.updateEncounter(fight.id, (f) => (turn >= ordered.length ? { ...f, turn: 0, round: f.round + 1 } : { ...f, turn }));
  };
  const rollAll = () => upd((cs) => cs.map((c) => { const e = entityOf(c.entityId); return e ? { ...c, initiative: ed.rollInitiativeFor(e) } : c; }));

  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("ws.ctab.combat")}</h2>
        <div className="ws-inline">
          {encounters.length > 0 && (
            <select aria-label={t("ws.encounter")} value={fight?.id} onChange={(e) => setSelected(e.target.value)}>
              {encounters.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <button className="ws-with-icon" onClick={() => setSelected(ed.addEncounter(`${t("ws.newEncounter")} ${encounters.length + 1}`))}><Icon name="plus" />{t("ws.newEncounter")}</button>
        </div>
      </div>
      {!fight && <div className="ws-empty">{t("ws.noEncounters")}</div>}
      {fight && (
        <>
          <div className="ws-combat-bar">
            <Input title={t("ws.encounterName")} value={fight.name} onChange={(name) => ed.updateEncounter(fight.id, (f) => ({ ...f, name }))} />
            <div className="ws-round"><span>{t("ws.round")}</span><strong>{fight.round}</strong></div>
            <button className="ws-primary ws-with-icon" disabled={!ordered.length} onClick={next}><Icon name="redo" />{t("ws.nextTurn")}</button>
            <button disabled={!ordered.length} onClick={rollAll}>{t("ws.rollAllInitiative")}</button>
            <button onClick={() => ed.updateEncounter(fight.id, (f) => ({ ...f, round: 1, turn: 0 }))}>{t("ws.resetFight")}</button>
            <button className="ws-icon-button" title={t("ws.deleteEncounter")} aria-label={t("ws.deleteEncounter")} onClick={() => window.confirm(t("ws.deleteEncounterConfirm", { name: fight.name })) && (ed.removeEncounter(fight.id), setSelected(null))}><Icon name="trash" /></button>
          </div>
          <div className="ws-inline ws-add-combatant">
            <select aria-label={t("ws.addCombatant")} value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
              <option value="">{t("ws.chooseHero")}</option>
              {free.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button className="ws-with-icon" disabled={!toAdd} onClick={() => { const e = entityOf(toAdd); if (!e) return; upd((cs) => [...cs, { id: newId("cmb"), entityId: e.id, initiative: ed.rollInitiativeFor(e) }]); setToAdd(""); }}><Icon name="plus" />{t("ws.addCombatant")}</button>
            <button disabled={!free.length} onClick={() => upd((cs) => [...cs, ...free.map((e) => ({ id: newId("cmb"), entityId: e.id, initiative: ed.rollInitiativeFor(e) }))])}>{t("ws.addAllCombatants")}</button>
          </div>
          {!ordered.length && <div className="ws-empty">{t("ws.noCombatants")}</div>}
          <div className="ws-combatants">
            {ordered.map((c, i) => {
              const e = entityOf(c.entityId);
              if (!e) return null;
              const type = system.entityTypes.find((x) => x.id === e.typeId);
              const hp = hpField(e.typeId);
              const values = ed.computedFor(e);
              const v = hp ? values[hp.id] : undefined;
              const cur = v && typeof v === "object" ? (v as { current?: number }).current : v;
              const max = v && typeof v === "object" ? (v as { max?: number }).max : undefined;
              return (
                <div key={c.id} className={"ws-combatant" + (i === fight.turn ? " active" : "") + (typeof cur === "number" && cur <= 0 ? " down" : "")}>
                  <div className="ws-order">{i + 1}</div>
                  <div className="ws-combatant-name"><b>{e.name}</b><small>{label(type?.label)}</small></div>
                  <label className="ws-init"><span>{t("ws.initiativeShort")}</span>
                    <input type="number" aria-label={`${t("ws.initiativeShort")}: ${e.name}`} value={c.initiative} onChange={(ev) => upd((cs) => cs.map((x) => (x.id === c.id ? { ...x, initiative: Number(ev.target.value) || 0 } : x)))} />
                  </label>
                  {hp && (
                    <div className="ws-hp">
                      <div className="ws-hp-value">{hp ? label(hp.label) : ""}: <b>{String(cur ?? "—")}{max !== undefined ? ` / ${max}` : ""}</b></div>
                      <div className="ws-hp-adjust">
                        <button aria-label={t("ws.damage")} title={t("ws.damage")} onClick={() => ed.adjust(e.id, hp.id, -(Number(delta[c.id]) || 1))}>−</button>
                        <input type="number" aria-label={t("ws.amount")} placeholder="1" value={delta[c.id] ?? ""} onChange={(ev) => setDelta({ ...delta, [c.id]: ev.target.value })} />
                        <button aria-label={t("ws.heal")} title={t("ws.heal")} onClick={() => ed.adjust(e.id, hp.id, Number(delta[c.id]) || 1)}>+</button>
                      </div>
                    </div>
                  )}
                  <button className="ws-icon-button" title={t("ws.removeCombatant")} aria-label={`${t("ws.removeCombatant")}: ${e.name}`} onClick={() => upd((cs) => cs.filter((x) => x.id !== c.id))}><Icon name="close" /></button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
