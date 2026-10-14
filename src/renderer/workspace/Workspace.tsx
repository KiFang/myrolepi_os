import { useState } from "react";
import type { Campaign, GameSystem } from "../../core";
import example from "../../../examples/space-opera.system.json";
import { Icon } from "../icons";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { both, copyOf, newId, newSystem, systemIssues } from "../workspace-model";
import { CampaignCanvas, CampaignInspector, useCampaignEditor } from "./CampaignEditor";
import { SystemCanvas, SystemInspector, useSystemEditor } from "./SystemEditor";
import { useLibrary } from "./useLibrary";
import "../workspace.css";

type Selection = { kind: "system" | "campaign"; id: string };
const same = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

export function Workspace({ registry, active }: { registry: PluginRegistry; active: boolean }) {
  const { t, label, lang } = useLang();
  const lib = useLibrary(active);
  const { project, change } = lib;
  const [selection, setSelection] = useState<Selection | null>(null);
  const [openTabs, setOpenTabs] = useState<Selection[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const system = selection?.kind === "system" ? project.systems.find((s) => s.id === selection.id) : undefined;
  const campaign = selection?.kind === "campaign" ? project.campaigns.find((c) => c.id === selection.id) : undefined;
  const linked = campaign && project.systems.find((s) => s.id === campaign.systemId);

  const updateSystem = (fn: (s: GameSystem) => GameSystem) =>
    change((p) => ({ ...p, systems: p.systems.map((s) => (s.id === system?.id ? fn(s) : s)) }));
  const updateCampaign = (fn: (c: Campaign) => Campaign) =>
    change((p) => ({ ...p, campaigns: p.campaigns.map((c) => (c.id === campaign?.id ? fn(c) : c)) }));
  const sys = useSystemEditor(system, updateSystem, registry);
  const cam = useCampaignEditor(campaign, linked, updateCampaign, registry);

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
    const c: Campaign = { schema: 1, id: newId("campaign"), name: label(both("ws.defaultCampaignName")), systemId: s.id, entities: [], notes: [] };
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
                      <button className="ws-row-main" onClick={() => open(sel)}><Icon name={kind} /><span className="ws-ellipsis">{it.title || t("ws.untitled")}</span></button>
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
              <SystemCanvas ed={sys} />
            ) : campaign ? (
              <CampaignCanvas ed={cam} />
            ) : (
              <div className="ws-welcome">
                <img className="ws-hero-logo" src="./logo.svg" alt="" width={72} height={72} />
                <div className="ws-eyebrow">{t("ws.eyebrow")}</div>
                <h1>{t("ws.heroTitle")}</h1>
                <p>{t("ws.heroText")}</p>
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
          <div className="ws-diagnostics">
            <div className="ws-panel-title">{t("ws.diagnostics")} <span className={errorCount ? "bad" : problems ? "warn" : "ok"}>{problems}</span></div>
            <div className="ws-diagnostics-list">
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
            </div>
          </div>
        </section>
        <aside className="ws-inspector" hidden={!inspectorOpen}>
          <div className="ws-panel-title">{t("ws.inspector")}</div>
          <div className="ws-inspector-content">
            {system ? <SystemInspector ed={sys} /> : campaign ? <CampaignInspector ed={cam} /> : (
              <>
                <p className="ws-hint">{t("ws.inspectorEmpty")}</p>
                <div className="ws-property-group">{t("ws.hotkeys")}</div>
                <p className="ws-hint">{t("ws.hotkeyList")}</p>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="ws-status" role="status">
        <span className={lib.loadError ? "err" : ""}>● {t(lib.notice.key, lib.notice.params)}</span>
        {doc && <span className={errorCount ? "err" : ""}>{t("ws.rulesErrors", { n: errorCount })}</span>}
        <span className="ws-grow" />
        <span>{t("ws.statusFooter")}</span>
      </footer>
    </div>
  );
}
