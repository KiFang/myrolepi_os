import { useState } from "react";
import { PERMISSION_KEYS } from "../core";
import type { SettingDef } from "../core";
import { Icon } from "./icons";
import { useLang } from "./lang";
import type { PluginInfo } from "./plugin-host";
import { aiPrompt, pluginTemplate } from "./pluginTemplate";
import type { PluginsApi } from "./usePlugins";

const CONTRIB_ICONS: [keyof PluginInfo["contributes"], string][] = [
  ["functions", "formula"], ["blocks", "studio"], ["systems", "system"], ["themes", "wand"], ["commands", "command"], ["dice", "dice"], ["locales", "book"], ["panels", "panel"],
];

function SettingField({ plugin, def, api }: { plugin: PluginInfo; def: SettingDef; api: PluginsApi }) {
  const { label, t } = useLang();
  const value = api.settingValue(plugin.id, def.id, def.default);
  const set = (v: unknown) => api.setSetting(plugin.id, def.id, v);
  return (
    <label className={"ws-control" + (def.type === "boolean" ? " check" : "")}>
      {def.type === "boolean" ? (
        <span className="ws-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />{label(def.label)}</span>
      ) : (
        <>
          <span>{label(def.label)}</span>
          {def.type === "select" ? (
            <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
              {def.options?.map((o) => <option key={o.value} value={o.value}>{label(o.label)}</option>)}
            </select>
          ) : (
            <input type={def.type === "number" ? "number" : "text"} min={def.min} max={def.max} value={String(value ?? "")} aria-label={label(def.label)}
              onChange={(e) => set(def.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)} />
          )}
        </>
      )}
      {def.description && <small className="ws-field-hint">{label(def.description)}</small>}
      <span hidden>{t("plugins.settings")}</span>
    </label>
  );
}

function PluginCard({ p, api }: { p: PluginInfo; api: PluginsApi }) {
  const { t, label } = useLang();
  const counts = CONTRIB_ICONS.filter(([k]) => p.contributes[k].length);
  return (
    <div className={`plugin-card state-${p.state}`}>
      <div className="plugin-head">
        <div className="plugin-title">
          <b>{label(p.name)}</b> <span className="muted">v{p.version}{p.author ? ` · ${p.author}` : ""}</span>
          <div className="muted plugin-id">{p.id}</div>
        </div>
        <span className={`plugin-badge ${p.state}`}>{t(`plugins.state.${p.state}`)}</span>
      </div>
      {p.description && <p className="plugin-desc">{label(p.description)}</p>}
      {p.errors.map((e, i) => <p className="err" key={i}>{e}</p>)}

      {!!counts.length && (
        <div className="plugin-chips">
          {counts.map(([k, icon]) => <span className="plugin-chip" key={k} title={p.contributes[k].join(", ")}><Icon name={icon} size={13} />{t(`plugins.adds.${k}`)}: {p.contributes[k].length}</span>)}
        </div>
      )}

      {p.state === "needs-approval" && (
        <div className="plugin-consent">
          <div className="plugin-consent-title"><Icon name="shield" size={16} />{t("plugins.consentTitle")}</div>
          <ul>{p.permissions.map((perm) => <li key={perm}>{t(PERMISSION_KEYS[perm])}</li>)}</ul>
          {p.panels.length > 0 || p.permissions.includes("ui") ? <p className="muted">{t("plugins.panelsHint")}</p> : null}
          <p className="muted">{t("plugins.consentWarn")}</p>
          <button className="ws-primary ws-with-icon" onClick={() => void api.approve(p.id, p.hash)}><Icon name="check" size={14} />{t("plugins.approve")}</button>
        </div>
      )}
      {(p.state === "active" || p.state === "disabled") && (
        <div className="plugin-actions">
          <button className="ws-with-icon" onClick={() => void api.setEnabled(p.id, p.state === "disabled")}>{p.state === "disabled" ? t("plugins.enable") : t("plugins.disable")}</button>
          <span className="muted plugin-perms">{t("plugins.allowed")}: {p.permissions.map((x) => t(PERMISSION_KEYS[x])).join(" · ") || "—"}</span>
        </div>
      )}
      {p.state === "active" && p.settings.length > 0 && (
        <div className="plugin-settings">
          <div className="ws-subhead">{t("plugins.settings")}</div>
          {p.settings.map((s) => <SettingField key={s.id} plugin={p} def={s} api={api} />)}
        </div>
      )}
    </div>
  );
}

export function Plugins({ api }: { api: PluginsApi }) {
  const { t, lang } = useLang();
  const [idea, setIdea] = useState("");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(aiPrompt(idea, lang)); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setMsg(t("plugins.copyFailed")); }
  };
  const savePrompt = () => {
    const url = URL.createObjectURL(new Blob([aiPrompt(idea, lang)], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = "rolepi-plugin-prompt.md";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // в Electron нет window.prompt(), поэтому имя нового плагина спрашиваем встроенной формой
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-plugin";
    try { const dir = await api.scaffold(id, pluginTemplate(id, name, lang)); setMsg(t("plugins.created", { dir })); setCreating(false); await api.reload(); }
    catch (e) { setMsg((e as Error).message); }
  };
  const examples = async () => { const n = await api.installExamples(); setMsg(t("plugins.examplesCopied", { n })); await api.reload(); };

  return (
    <>
      <h1><Icon name="plugin" size={24} />{t("plugins.title")}</h1>
      <p className="muted">{t("plugins.intro")}</p>
      <div className="plugin-warning"><Icon name="shield" size={16} /><span>{t("plugins.trust")}</span></div>
      <div className="plugin-toolbar">
        <button className="ws-with-icon" onClick={() => window.rpi?.openPluginsFolder()} disabled={!api.available}><Icon name="folder" size={15} />{t("plugins.folder")}</button>
        <button className="ws-with-icon" onClick={() => { setNewName(t("plugins.newNameDefault")); setCreating((v) => !v); }} disabled={!api.available} aria-expanded={creating}><Icon name="plus" size={15} />{t("plugins.create")}</button>
        <button className="ws-with-icon" onClick={examples} disabled={!api.available}><Icon name="download" size={15} />{t("plugins.examples")}</button>
        <button className="ws-with-icon" onClick={() => void api.reload()} disabled={!api.available}><Icon name="refresh" size={15} />{t("plugins.reload")}</button>
      </div>
      {creating && (
        <form className="plugin-create" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <label className="ws-control"><span>{t("plugins.newName")}</span>
            <input autoFocus value={newName} aria-label={t("plugins.newName")} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button type="submit" className="ws-primary ws-with-icon" disabled={!newName.trim()}><Icon name="check" size={14} />{t("plugins.createGo")}</button>
          <button type="button" onClick={() => setCreating(false)}>{t("plugins.cancel")}</button>
        </form>
      )}
      {msg && <p className="muted plugin-msg">{msg}</p>}

      <div className="ai-helper">
        <div className="ai-helper-head"><Icon name="wand" size={18} /><b>{t("plugins.aiTitle")}</b></div>
        <ol className="ai-steps"><li>{t("plugins.ai1")}</li><li>{t("plugins.ai2")}</li><li>{t("plugins.ai3")}</li></ol>
        <textarea aria-label={t("plugins.aiTitle")} value={idea} placeholder={t("plugins.aiPlaceholder")} onChange={(e) => setIdea(e.target.value)} />
        <div className="ai-helper-actions">
          <button className="ws-primary ws-with-icon" onClick={copyPrompt}><Icon name={copied ? "check" : "copy"} size={15} />{copied ? t("plugins.copied") : t("plugins.copyPrompt")}</button>
          <button className="ws-with-icon" onClick={savePrompt}><Icon name="download" size={15} />{t("plugins.savePrompt")}</button>
        </div>
      </div>

      <h3>{t("plugins.installed")}</h3>
      {api.loading && !api.plugins.length && <p className="muted">{t("plugins.loading")}</p>}
      {!api.loading && !api.plugins.length && <div className="ws-empty">{t("plugins.none")}</div>}
      {api.plugins.map((p) => <PluginCard key={p.id + p.dir} p={p} api={api} />)}
    </>
  );
}
