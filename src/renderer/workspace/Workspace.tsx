import { useState } from "react";
import type { Campaign, GameSystem } from "../../core";
import example from "../../../examples/space-opera.system.json";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { copyOf, newId, newSystem, systemIssues, both } from "../workspace-model";
import { CampaignCanvas, CampaignInspector, useCampaignEditor } from "./CampaignEditor";
import { SystemCanvas, SystemInspector, useSystemEditor } from "./SystemEditor";
import { useLibrary } from "./useLibrary";
import "../workspace.css";

type Selection = { kind: "system" | "campaign"; id: string };

export function Workspace({ registry, active }: { registry: PluginRegistry; active: boolean }) {
  const { t, label, lang } = useLang();
  const lib = useLibrary(active);
  const { project, change } = lib;
  const [selection, setSelection] = useState<Selection | null>(null);

  const system = selection?.kind === "system" ? project.systems.find((s) => s.id === selection.id) : undefined;
  const campaign = selection?.kind === "campaign" ? project.campaigns.find((c) => c.id === selection.id) : undefined;
  const linked = campaign && project.systems.find((s) => s.id === campaign.systemId);

  const updateSystem = (fn: (s: GameSystem) => GameSystem) =>
    change((p) => ({ ...p, systems: p.systems.map((s) => (s.id === system?.id ? fn(s) : s)) }));
  const updateCampaign = (fn: (c: Campaign) => Campaign) =>
    change((p) => ({ ...p, campaigns: p.campaigns.map((c) => (c.id === campaign?.id ? fn(c) : c)) }));
  const sys = useSystemEditor(system, updateSystem, registry);
  const cam = useCampaignEditor(campaign, linked, updateCampaign, registry);

  const open = (kind: Selection["kind"], id: string) => {
    setSelection({ kind, id });
    sys.reset();
    cam.reset();
  };
  const addSystem = (template?: GameSystem) => {
    const s = template ? copyOf(template) : newSystem();
    change((p) => ({ ...p, systems: [...p.systems, s] }));
    open("system", s.id);
  };
  const addCampaign = () => {
    const s = system ?? project.systems[0];
    if (!s) return lib.setNotice({ key: "ws.createSystemFirst" });
    const c: Campaign = { schema: 1, id: newId("campaign"), name: label(both("ws.newCampaign")), systemId: s.id, entities: [], notes: [] };
    change((p) => ({ ...p, campaigns: [...p.campaigns, c] }));
    open("campaign", c.id);
  };
  const undo = () => { if (lib.undo()) sys.setFieldIndex(null); };
  const redo = () => { if (lib.redo()) sys.setFieldIndex(null); };

  const doc = system ?? linked;
  const issues = doc ? systemIssues(doc, lang) : [];
  const computedErrors = Object.entries((system ? sys.computed : cam.computed)?.errors ?? {});
  const errorCount = issues.filter((i) => i.level === "error").length;
  const tabs = [
    ...project.systems.map((s) => ({ kind: "system" as const, id: s.id, title: label(s.name), icon: "◇" })),
    ...project.campaigns.map((c) => ({ kind: "campaign" as const, id: c.id, title: c.name, icon: "▤" })),
  ];

  return (
    <div className="ws-view">
      <div className="ws-toolbar">
        <button disabled={!lib.ready} onClick={() => addSystem()}>{t("ws.addSystem")}</button>
        <button disabled={!lib.ready || !project.systems.length} onClick={addCampaign}>{t("ws.addCampaign")}</button>
        <span className="ws-separator" />
        <button disabled={!lib.canUndo} onClick={undo} title={t("ws.undoTitle")}>{t("ws.undo")}</button>
        <button disabled={!lib.canRedo} onClick={redo} title={t("ws.redoTitle")}>{t("ws.redo")}</button>
        <span className="ws-grow" />
        <span className={"ws-save-state" + (lib.dirty ? " dirty" : "")}>{lib.dirty ? t("ws.dirty") : t("ws.clean")}</span>
        <button className="ws-primary" disabled={!lib.ready || lib.saving || !lib.dirty} onClick={() => void lib.save()}>
          {lib.saving ? t("ws.saving") : t("ws.saveAll")} <kbd>Ctrl S</kbd>
        </button>
      </div>
      <div className="ws-body">
        <aside className="ws-tree">
          <div className="ws-panel-title">{t("ws.explorer")}</div>
          <div className="ws-tree-section">{t("ws.systems")} <span>{project.systems.length}</span></div>
          {project.systems.map((s) => (
            <button key={s.id} className={selection?.id === s.id ? "selected" : ""} onClick={() => open("system", s.id)}>
              <span>◇</span>{label(s.name)}
            </button>
          ))}
          <div className="ws-tree-section">{t("ws.campaigns")} <span>{project.campaigns.length}</span></div>
          {project.campaigns.map((c) => (
            <button key={c.id} className={selection?.id === c.id ? "selected" : ""} onClick={() => open("campaign", c.id)}>
              <span>▤</span>{c.name}
            </button>
          ))}
          <div className="ws-tree-footer">{t("ws.treeHint")}</div>
        </aside>
        <section className="ws-document">
          <div className="ws-tabs" role="tablist" aria-label={t("ws.documents")}>
            {tabs.map((tab) => (
              <button role="tab" aria-selected={selection?.id === tab.id} key={tab.id} onClick={() => open(tab.kind, tab.id)}>
                {tab.icon} {tab.title}
              </button>
            ))}
            {!selection && <span>{t("ws.getStarted")}</span>}
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
                <div className="ws-eyebrow">{t("ws.eyebrow")}</div>
                <h1>{t("ws.heroTitle")}</h1>
                <p>{t("ws.heroText")}</p>
                <div className="ws-welcome-actions">
                  <button className="ws-primary" disabled={!lib.ready} onClick={() => addSystem()}>{t("ws.createSystem")}</button>
                  <button disabled={!lib.ready} onClick={() => addSystem(example as unknown as GameSystem)}>{t("ws.openExample")}</button>
                </div>
                <div className="ws-stages">
                  {[1, 2, 3].map((n) => (
                    <div key={n}><b>{t(`ws.stage${n}`)}</b><p>{t(`ws.stage${n}Text`)}</p></div>
                  ))}
                </div>
                <div className="ws-welcome-actions">
                  {registry.systems.map((s) => (
                    <button key={s.id} disabled={!lib.ready} onClick={() => addSystem(s)}>{t("ws.fromPlugin", { name: label(s.name) })}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="ws-diagnostics">
            <div className="ws-panel-title">{t("ws.diagnostics")} <span className={issues.length + computedErrors.length ? "bad" : ""}>{issues.length + computedErrors.length}</span></div>
            {issues.map((issue, i) => (
              <div key={i} className={issue.level === "error" ? "err" : "muted"}>
                <b>{issue.level === "error" ? t("ws.error") : t("ws.note")}</b> · {issue.message} <small>{issue.path}</small>
              </div>
            ))}
            {computedErrors.map(([id, error]) => (<div className="err" key={id}>{id}: {error}</div>))}
            {!issues.length && !computedErrors.length && <div className="muted">{doc ? t("ws.systemOk") : t("ws.openToCheck")}</div>}
          </div>
        </section>
        <aside className="ws-inspector">
          <div className="ws-panel-title">{t("ws.inspector")}</div>
          <div className="ws-inspector-content">
            {system ? <SystemInspector ed={sys} /> : campaign ? <CampaignInspector ed={cam} /> : (
              <>
                <div className="ws-property-group">{t("ws.groupWorkspace")}</div>
                <p className="ws-hint">{t("ws.workspaceHint")}</p>
                <div className="ws-property-group">{t("ws.hotkeys")}</div>
                <p className="ws-hint">{t("ws.hotkeyList")}</p>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="ws-status" role="status">
        <span className={lib.loadError ? "err" : ""}>● {t(lib.notice.key, lib.notice.params)}</span>
        <span>{t("ws.rulesErrors", { n: errorCount })}</span>
        <span className="ws-grow" />
        <span>{t("ws.statusFooter")}</span>
      </footer>
    </div>
  );
}
