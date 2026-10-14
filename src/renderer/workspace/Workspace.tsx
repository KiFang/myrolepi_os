import { useEffect, useRef, useState } from "react";
import { SCHEMA_VERSION, canFork, forkSystem, isLocked } from "../../core";
import type { Campaign, GameSystem } from "../../core";
import example from "../../../examples/space-opera.system.json";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { rememberSimple, simpleChosen, useSimpleState } from "../simple";
import { PanelFrame } from "../PanelFrame";
import { emitPanelEvent } from "../panelEvents";
import type { PanelDef } from "../../core";
import type { PluginInfo } from "../plugin-host";
import { registerProject, registerProjectApi } from "../projectBridge";
import { useToast } from "../toasts";
import type { PluginRegistry } from "../plugin-host";
import { ExportDialog } from "../ExportDialog";
import { ImportError, importData } from "../exchange";
import { ProtectionBanner } from "../ProtectionBanner";
import { exchangeApi } from "../rpiApi";
import { useProtection } from "../useProtection";
import { both, copyOf, newId, newSystem, renameFieldInCampaign, renameFieldInSystem, systemIssues } from "../workspace-model";
import { CampaignCanvas, CampaignInspector, useCampaignEditor } from "./CampaignEditor";
import { SystemCanvas, SystemInspector, useSystemEditor } from "./SystemEditor";
import type { RollEntry } from "../rolls";
import { useLibrary } from "./useLibrary";
import "../workspace.css";

type Selection = { kind: "system" | "campaign"; id: string };
const same = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

export interface PanelItem { plugin: PluginInfo; panel: PanelDef }

export function Workspace({ registry, active, panels = [] }: { registry: PluginRegistry; active: boolean; panels?: PanelItem[] }) {
  const { t, label, lang } = useLang();
  const notify = useToast();
  const lib = useLibrary(active);
  const { project, change } = lib;
  useEffect(() => { registerProject(lib.getProject); return () => registerProject(null); }, [lib.getProject]);
  const selRef = useRef<Selection | null>(null);
  useEffect(() => {
    registerProjectApi({ get: () => lib.getProject() as never, change: (fn) => lib.change(fn), selection: () => selRef.current });
    return () => registerProjectApi(null);
  }, [lib.getProject, lib.change]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openTabs, setOpenTabs] = useState<Selection[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [bottomTab, setBottomTab] = useState<string>("problems");
  const [rightTab, setRightTab] = useState<string>("props");
  const [seenPanels, setSeenPanels] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const simpleState = useSimpleState();
  const [hintGone, setHintGone] = useState(simpleChosen);
  const prot = useProtection(project.systems);

  const pKey = (x: PanelItem) => `${x.plugin.id}:${x.panel.id}`;
  const rightPanels = panels.filter((x) => x.panel.placement === "right");
  const bottomPanels = panels.filter((x) => x.panel.placement === "bottom");
  const visiblePanel = (x: PanelItem) => (x.panel.placement === "right" ? rightTab === pKey(x) && inspectorOpen : bottomTab === pKey(x));
  useEffect(() => {
    const shown = panels.filter(visiblePanel).map(pKey).filter((k) => !seenPanels.includes(k));
    if (shown.length) setSeenPanels((s) => [...s, ...shown]);
  });
  useEffect(() => { if (rightTab !== "props" && !rightPanels.some((x) => pKey(x) === rightTab)) setRightTab("props"); }, [rightPanels.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bottomTab !== "problems" && bottomTab !== "rolls" && !bottomPanels.some((x) => pKey(x) === bottomTab)) setBottomTab("problems"); }, [bottomPanels.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const system = selection?.kind === "system" ? project.systems.find((s) => s.id === selection.id) : undefined;
  const campaign = selection?.kind === "campaign" ? project.campaigns.find((c) => c.id === selection.id) : undefined;
  selRef.current = selection;
  useEffect(() => { emitPanelEvent("selection", selection); }, [selection?.kind, selection?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = campaign && project.systems.find((s) => s.id === campaign.systemId);

  const locked = isLocked(system);
  const blocked = () => notify(t("prot.readOnly"));
  // защищённая система открыта только для чтения: любая правка отклоняется
  const updateSystem = (fn: (s: GameSystem) => GameSystem) => {
    if (locked) return blocked();
    change((p) => ({ ...p, systems: p.systems.map((s) => (s.id === system?.id ? fn(s) : s)) }));
  };
  const updateCampaign = (fn: (c: Campaign) => Campaign) =>
    change((p) => ({ ...p, campaigns: p.campaigns.map((c) => (c.id === campaign?.id ? fn(c) : c)) }));
  // переименование параметра: система и все кампании на ней обновляются одним шагом
  const renameField = (typeId: string, from: string, to: string) =>
    locked ? blocked() : change((p) => ({
      ...p,
      systems: p.systems.map((s) => (s.id === system?.id ? renameFieldInSystem(s, typeId, from, to) : s)),
      campaigns: p.campaigns.map((c) => (c.systemId === system?.id ? renameFieldInCampaign(c, typeId, from, to) : c)),
    }));
  const sys = useSystemEditor(system, updateSystem, registry, renameField);
  const cam = useCampaignEditor(campaign, linked, updateCampaign, registry, (entry) => {
    setRolls((r) => [{ ...entry, id: newId("roll"), time: Date.now() }, ...r].slice(0, 100));
    setBottomTab("rolls");
  });
  const applyRoll = (entry: RollEntry) => {
    if (!entry.entityId) return;
    cam.applyEffects(entry.entityId, entry.effects);
    setRolls((r) => r.map((x) => (x.id === entry.id ? { ...x, applied: true } : x)));
  };

  const open = (sel: Selection) => {
    setSelection(sel);
    setOpenTabs((tabs) => (tabs.some((x) => same(x, sel)) ? tabs : [...tabs, sel]));
    sys.reset();
    cam.reset();
  };
  const closeTab = (sel: Selection) => {
    const rest = openTabs.filter((x) => !same(x, sel));
    setOpenTabs(rest);
    if (selection && same(selection, sel)) {
      const i = openTabs.findIndex((x) => same(x, sel));
      setSelection(rest[Math.min(i, rest.length - 1)] ?? null);
      sys.reset();
      cam.reset();
    }
  };
  const addSystem = (template?: GameSystem) => {
    const s = template ? copyOf(template) : newSystem();
    change((p) => ({ ...p, systems: [...p.systems, s] }));
    open({ kind: "system", id: s.id });
  };
  const addCampaign = () => {
    const s = system ?? linked ?? project.systems[0];
    if (!s) return lib.setNotice({ key: "ws.createSystemFirst" });
    const c: Campaign = { schema: SCHEMA_VERSION, id: newId("campaign"), name: label(both("ws.defaultCampaignName")), systemId: s.id, entities: [], notes: [] };
    change((p) => ({ ...p, campaigns: [...p.campaigns, c] }));
    open({ kind: "campaign", id: c.id });
  };
  const removeDoc = (sel: Selection) => {
    const name = sel.kind === "system" ? label(project.systems.find((s) => s.id === sel.id)?.name) : project.campaigns.find((c) => c.id === sel.id)?.name ?? "";
    if (!window.confirm(t(sel.kind === "system" ? "ws.deleteSystemConfirm" : "ws.deleteCampaignConfirm", { name }))) return;
    change((p) => ({
      ...p,
      systems: sel.kind === "system" ? p.systems.filter((s) => s.id !== sel.id) : p.systems,
      campaigns: sel.kind === "campaign" ? p.campaigns.filter((c) => c.id !== sel.id) : p.campaigns,
    }));
    closeTab(sel);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const importFile = async (file?: File) => {
    if (!file) return;
    const api = exchangeApi();
    try {
      if (!api) throw new ImportError("not-recognized", "no api");
      const out = await importData(new Uint8Array(await file.arrayBuffer()), { existingSystems: project.systems, newId }, api);
      change((p) => ({ ...p, systems: [...p.systems, ...out.systems], campaigns: [...p.campaigns, ...out.campaigns] }));
      open(out.focus);
      const notes = [
        out.protectedSystem && !out.duplicateSystem && t("imp.protected"),
        out.duplicateSystem && t("imp.duplicate"),
        out.missingSystem && t("imp.missingSystem"),
        out.lostAssets > 0 && t("imp.lost", { n: out.lostAssets }),
      ].filter(Boolean);
      notify([t("imp.done"), ...notes].join("; "));
      lib.setNotice({ key: "ws.imported" });
    } catch (e) {
      notify(e instanceof ImportError ? t(`imp.err.${e.code}`) : t("ws.importFailed"));
      lib.setNotice({ key: "ws.importFailed" });
    }
  };
  const fork = () => {
    if (!system) return;
    const copy = copyOf(forkSystem(system));
    change((p) => ({ ...p, systems: [...p.systems, copy] }));
    open({ kind: "system", id: copy.id });
    notify(t("prot.forked"));
  };
  // команды из палитры (Ctrl+K) приходят событием: новая система, кампания, сохранить, импорт
  const commandsRef = useRef({ addSystem, addCampaign, save: lib.save, pick: () => fileInput.current?.click() });
  commandsRef.current = { addSystem, addCampaign, save: lib.save, pick: () => fileInput.current?.click() };
  useEffect(() => {
    const on = (e: Event) => {
      const c = (e as CustomEvent<string>).detail;
      const h = commandsRef.current;
      if (c === "new-system") h.addSystem();
      else if (c === "new-campaign") h.addCampaign();
      else if (c === "save") void h.save();
      else if (c === "import") h.pick();
    };
    window.addEventListener("rolepi:command", on);
    return () => window.removeEventListener("rolepi:command", on);
  }, []);
  // итог важных действий — коротким уведомлением
  useEffect(() => {
    if (["ws.saved", "ws.migrated", "ws.saveError", "ws.fixInvalid", "ws.createSystemFirst"].includes(lib.notice.key)) notify(t(lib.notice.key, lib.notice.params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.notice]);
  const undo = () => { if (lib.undo()) sys.setFieldIndex(null); };
  const redo = () => { if (lib.redo()) sys.setFieldIndex(null); };

  const doc = system ?? linked;
  const issues = doc ? systemIssues(doc, lang) : [];
  const issueTexts = new Set(issues.map((i) => i.message));
  const computedErrors = Object.entries((system ? sys.computed : cam.computed)?.errors ?? {}).filter(([, m]) => !issueTexts.has(m));
  const problems = issues.length + computedErrors.length;
  const errorCount = issues.filter((i) => i.level === "error").length + computedErrors.length;

  const tabs = openTabs.flatMap((sel) => {
    const title = sel.kind === "system" ? label(project.systems.find((s) => s.id === sel.id)?.name) : project.campaigns.find((c) => c.id === sel.id)?.name;
    const exists = sel.kind === "system" ? project.systems.some((s) => s.id === sel.id) : project.campaigns.some((c) => c.id === sel.id);
    return exists ? [{ sel, title: title || t("ws.untitled") }] : [];
  });
  const columns = `${treeOpen ? "232px" : "0px"} minmax(340px, 1fr) ${inspectorOpen ? "300px" : "0px"}`;

  return (
    <div className="ws-view">
      <div className="ws-toolbar">
        <button className="ws-icon-button" aria-pressed={treeOpen} title={t("ws.hideTree")} aria-label={t("ws.hideTree")} onClick={() => setTreeOpen((v) => !v)}><Icon name="panelLeft" size={18} /></button>
        <span className="ws-separator" />
        <button className="ws-with-icon" disabled={!lib.ready} onClick={() => addSystem()}><Icon name="system" />{t("ws.newSystem")}</button>
        <button className="ws-with-icon" disabled={!lib.ready || !project.systems.length} onClick={addCampaign}><Icon name="campaign" />{t("ws.newCampaign")}</button>
        <button className="ws-with-icon" disabled={!lib.ready} title={t("ws.importTitle")} onClick={() => fileInput.current?.click()}><Icon name="upload" />{t("ws.import")}</button>
        <input ref={fileInput} type="file" accept=".rolepi,application/zip,application/json,.json" hidden aria-label={t("ws.import")} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
        <span className="ws-separator" />
        <button className="ws-with-icon" disabled={!lib.canUndo} onClick={undo} title={t("ws.undoTitle")}><Icon name="undo" />{t("ws.undo")}</button>
        <button className="ws-with-icon" disabled={!lib.canRedo} onClick={redo} title={t("ws.redoTitle")}><Icon name="redo" />{t("ws.redo")}</button>
        <span className="ws-grow" />
        <span className={"ws-save-state" + (lib.dirty ? " dirty" : "")}>{lib.dirty ? t("ws.dirty") : t("ws.clean")}</span>
        <button className="ws-primary ws-with-icon" title={t("ws.saveTitle")} disabled={!lib.ready || lib.saving || !lib.dirty} onClick={() => void lib.save()}>
          <Icon name="save" />{lib.saving ? t("ws.saving") : t("ws.save")}
        </button>
        <span className="ws-separator" />
        <button className="ws-icon-button" aria-pressed={inspectorOpen} title={t("ws.hideInspector")} aria-label={t("ws.hideInspector")} onClick={() => setInspectorOpen((v) => !v)}><Icon name="panelRight" size={18} /></button>
      </div>
      <div className="ws-body" style={{ gridTemplateColumns: columns }}>
        <aside className="ws-tree" hidden={!treeOpen}>
          <div className="ws-panel-title">{t("ws.explorer")}</div>
          {(["system", "campaign"] as const).map((kind) => {
            const items = kind === "system" ? project.systems.map((s) => ({ id: s.id, title: label(s.name) })) : project.campaigns.map((c) => ({ id: c.id, title: c.name }));
            return (
              <div key={kind}>
                <div className="ws-tree-section">{t(kind === "system" ? "ws.systems" : "ws.campaigns")} <span>{items.length}</span></div>
                {!items.length && <div className="ws-tree-empty">{t(kind === "system" ? "ws.treeEmptySystems" : "ws.treeEmptyCampaigns")}</div>}
                {items.map((it) => {
                  const sel = { kind, id: it.id };
                  return (
                    <div key={it.id} className={"ws-row" + (selection && same(selection, sel) ? " selected" : "")}>
                      <button className="ws-row-main" onClick={() => open(sel)}><Icon name={kind} /><span className="ws-ellipsis">{it.title || t("ws.untitled")}</span>{kind === "system" && prot.status[it.id] && <span className={"ws-lock " + prot.status[it.id].state} title={t(prot.status[it.id].state === "tampered" ? "prot.tamperedTip" : "prot.lockedTip")}><Icon name={prot.status[it.id].state === "tampered" ? "warn" : "shield"} size={13} /></span>}</button>
                      <button className="ws-icon-button ws-row-action" title={t("ws.delete")} aria-label={`${t("ws.delete")}: ${it.title}`} onClick={() => removeDoc(sel)}><Icon name="trash" size={14} /></button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="ws-tree-footer">{t("ws.treeHint")}</div>
        </aside>
        <section className="ws-document">
          <div className="ws-tabs" role="tablist" aria-label={t("ws.documents")}>
            {tabs.map(({ sel, title }) => (
              <div key={sel.kind + sel.id} className={"ws-tab" + (selection && same(selection, sel) ? " active" : "")}>
                <button role="tab" aria-selected={!!selection && same(selection, sel)} className="ws-tab-main" onClick={() => open(sel)}><Icon name={sel.kind} size={14} /><span className="ws-ellipsis">{title}</span></button>
                <button className="ws-icon-button ws-tab-close" title={t("ws.close")} aria-label={`${t("ws.close")}: ${title}`} onClick={() => closeTab(sel)}><Icon name="close" size={12} /></button>
              </div>
            ))}
          </div>
          <div className="ws-canvas">
            {lib.loadError ? (
              <div className="ws-welcome">
                <h1>{t("ws.libraryUnavailable")}</h1>
                <p role="alert" className="err">{lib.loadError}</p>
                <p>{t("ws.libraryKept")}</p>
              </div>
            ) : system ? (
              <>
                {system.protection && prot.status[system.id] && (
                  <ProtectionBanner status={prot.status[system.id]} system={system} canFork={canFork(system, prot.status[system.id], prot.author?.keyId)} onFork={fork} />
                )}
                <div className="ws-anim" key={`s:${system.id}:${sys.mode}`}><SystemCanvas ed={sys} /></div>
              </>
            ) : campaign ? (
              <div className="ws-anim" key={`c:${campaign.id}:${cam.tab}`}><CampaignCanvas ed={cam} /></div>
            ) : (
              <div className="ws-welcome">
                <img className="ws-hero-logo" src="./logo.svg" alt="" width={72} height={72} />
                <div className="ws-eyebrow">{t("ws.eyebrow")}</div>
                <h1>{t("ws.heroTitle")}</h1>
                <p>{t("ws.heroText")}</p>
                {!hintGone && !simpleState.simple && (
                  <div className="simple-hint" data-testid="simple-hint">
                    <div><b>{t("simple.hintTitle")}</b><span className="muted">{t("simple.hintText")}</span></div>
                    <button className="ws-primary ws-with-icon" onClick={() => { simpleState.setSimple(true); setHintGone(true); }}><Icon name="wand" size={14} />{t("simple.enable")}</button>
                    <button onClick={() => { rememberSimple(false); setHintGone(true); }}>{t("simple.dismiss")}</button>
                  </div>
                )}
                <div className="ws-welcome-actions">
                  <button className="ws-primary ws-with-icon" disabled={!lib.ready} onClick={() => addSystem()}><Icon name="plus" />{t("ws.createSystem")}</button>
                  <button className="ws-with-icon" disabled={!lib.ready} onClick={() => addSystem(example as unknown as GameSystem)}><Icon name="dice" />{t("ws.openExample")}</button>
                  {registry.systems.map((s) => (
                    <button key={s.id} className="ws-with-icon" disabled={!lib.ready} onClick={() => addSystem(s)}><Icon name="plugin" />{t("ws.fromPlugin", { name: label(s.name) })}</button>
                  ))}
                </div>
                <div className="ws-stages">
                  {[1, 2, 3].map((n) => (
                    <div key={n}><b>{t(`ws.stage${n}`)}</b><p>{t(`ws.stage${n}Text`)}</p></div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className={"ws-diagnostics" + (bottomPanels.some((x) => pKey(x) === bottomTab) ? " has-panel" : "")}>
            <div className="ws-panel-title ws-bottom-tabs">
              <button className={bottomTab === "problems" ? "active" : ""} onClick={() => setBottomTab("problems")}>{t("ws.tabProblems")} <span className={errorCount ? "bad" : problems ? "warn" : "ok"}>{problems}</span></button>
              <button className={bottomTab === "rolls" ? "active" : ""} onClick={() => setBottomTab("rolls")}>{t("ws.tabRolls")} <span>{rolls.length}</span></button>
              {bottomPanels.map((x) => <button key={pKey(x)} className={bottomTab === pKey(x) ? "active" : ""} onClick={() => setBottomTab(pKey(x))}>{label(x.panel.title)}</button>)}
              {bottomTab === "rolls" && !!rolls.length && <button className="ws-clear" onClick={() => setRolls([])}>{t("ws.clearRolls")}</button>}
            </div>
            {bottomPanels.filter((x) => seenPanels.includes(pKey(x))).map((x) => (
              <div key={pKey(x) + x.plugin.hash} className="ws-diagnostics-panel" hidden={bottomTab !== pKey(x)}><PanelFrame plugin={x.plugin} panel={x.panel} /></div>
            ))}
            <div className="ws-diagnostics-list" hidden={bottomTab !== "problems" && bottomTab !== "rolls"}>
              {bottomTab === "problems" ? (
                <>
                  {issues.map((issue, i) => (
                    <div key={i} className={"ws-issue " + issue.level}>
                      <Icon name={issue.level === "error" ? "warn" : "info"} size={14} />
                      <span>{issue.message} <small>{issue.path}</small></span>
                    </div>
                  ))}
                  {computedErrors.map(([id, error]) => (
                    <div className="ws-issue error" key={id}><Icon name="warn" size={14} /><span>{error} <small>{id}</small></span></div>
                  ))}
                  {!problems && <div className="ws-issue ok"><Icon name="check" size={14} /><span>{doc ? t("ws.systemOk") : t("ws.openToCheck")}</span></div>}
                </>
              ) : (
                <>
                  {!rolls.length && <div className="ws-issue"><Icon name="dice" size={14} /><span>{t("ws.noRolls")}</span></div>}
                  {rolls.map((r) => (
                    <div className="ws-roll" key={r.id}>
                      <strong className="ws-roll-total">{String(r.value)}</strong>
                      <span className="ws-roll-what"><b>{r.who}</b> · {r.action}
                        <small>{r.rolls.map((x) => `${x.notation}: ${x.rolls.map((v, k) => (x.kept.includes(k) ? v : `(${v})`)).join(" ")}`).join(" · ")}</small>
                      </span>
                      {!!r.effects.length && (r.applied ? <span className="muted">{t("ws.applied")}</span> : <button onClick={() => applyRoll(r)}>{t("ws.applyEffects")}: {r.effects.map((e) => `${e.field} → ${typeof e.to === "object" ? (e.to as { current?: number }).current : String(e.to)}`).join(", ")}</button>)}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
        <aside className="ws-inspector" hidden={!inspectorOpen}>
          {rightPanels.length ? (
            <div className="ws-panel-title ws-bottom-tabs">
              <button className={rightTab === "props" ? "active" : ""} onClick={() => setRightTab("props")}>{t("ws.inspector")}</button>
              {rightPanels.map((x) => <button key={pKey(x)} className={rightTab === pKey(x) ? "active" : ""} onClick={() => setRightTab(pKey(x))}>{label(x.panel.title)}</button>)}
            </div>
          ) : <div className="ws-panel-title">{t("ws.inspector")}</div>}
          {rightPanels.filter((x) => seenPanels.includes(pKey(x))).map((x) => (
            <div key={pKey(x) + x.plugin.hash} className="ws-inspector-panel" hidden={rightTab !== pKey(x)}><PanelFrame plugin={x.plugin} panel={x.panel} /></div>
          ))}
          <div className="ws-inspector-content" hidden={rightTab !== "props"}>
            {(system || campaign) && <button className="ws-with-icon ws-export" title={t("ws.exportTitle")} onClick={() => setExporting(true)}><Icon name="download" />{t("ws.export")}</button>}
            {system ? <fieldset className="ws-fieldset" disabled={locked}><SystemInspector ed={sys} /></fieldset> : campaign ? <CampaignInspector ed={cam} /> : (
              <>
                <p className="ws-hint">{t("ws.inspectorEmpty")}</p>
                <div className="ws-property-group">{t("ws.hotkeys")}</div>
                <p className="ws-hint">{t("ws.hotkeyList")}</p>
              </>
            )}
          </div>
        </aside>
      </div>
      {exporting && (system || campaign) && (
        <ExportDialog kind={system ? "system" : "campaign"} system={system ?? linked} campaign={campaign} onClose={() => setExporting(false)} />
      )}
      <footer className="ws-status" role="status">
        <span className={lib.loadError ? "err" : ""}>● {t(lib.notice.key, lib.notice.params)}</span>
        {doc && <span className={errorCount ? "err" : ""}>{t("ws.rulesErrors", { n: errorCount })}</span>}
        <span className="ws-grow" />
        <span>{t("ws.statusFooter")}</span>
      </footer>
    </div>
  );
}
