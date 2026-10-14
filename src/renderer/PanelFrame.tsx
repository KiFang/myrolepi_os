import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PanelDef } from "../core";
import { createBridge } from "./panel-bridge";
import type { BridgeDeps } from "./panel-bridge";
import { onPanelEvent } from "./panelEvents";
import type { PluginInfo } from "./plugin-host";
import { useLang } from "./lang";

/** То, что Shell даёт панелям: общие возможности приложения (уведомления, кубики, переход по разделам, оформление). */
export interface PanelsContextValue {
  deps: (plugin: PluginInfo) => Omit<BridgeDeps, "pluginId" | "permissions">;
  vars: Record<string, string>;
  lang: string;
}
export const PanelsContext = createContext<PanelsContextValue | null>(null);

const SELECTION_PERMISSION = "project.read";

/** Изолированная рамка панели: sandbox без allow-same-origin, общение только через MessagePort и мост с проверкой прав. */
export function PanelFrame({ plugin, panel }: { plugin: PluginInfo; panel: PanelDef }) {
  const ctx = useContext(PanelsContext);
  const { t, label } = useLang();
  const frame = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const url = useMemo(() => window.rpi?.panelUrl?.(plugin.id, panel.entry) ?? "about:blank", [plugin.id, panel.entry]);
  const handle = useMemo(() => (ctx ? createBridge({ ...ctx.deps(plugin), pluginId: plugin.id, permissions: plugin.permissions }) : null), [plugin.id, plugin.hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(ctx); latest.current = ctx;

  useEffect(() => { const id = setTimeout(() => setSlow(true), 5000); return () => clearTimeout(id); }, []);
  useEffect(() => () => { port.current?.close(); port.current = null; started.current = false; }, []);

  // тема и язык
  useEffect(() => { if (ctx) port.current?.postMessage({ event: "theme", vars: ctx.vars, lang: ctx.lang }); }, [ctx?.vars, ctx?.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // события приложения
  useEffect(() => onPanelEvent((name, data) => {
    if (name === "selection" && !plugin.permissions.includes(SELECTION_PERMISSION)) return;
    port.current?.postMessage({ event: name, data });
  }), [plugin.permissions]);

  const onLoad = () => {
    const win = frame.current?.contentWindow;
    const c = latest.current;
    if (started.current || !win || !c || !handle) return; // подключаем только первую загруженную страницу: ушедшая по ссылке рамка порт не получит
    started.current = true;
    const ch = new MessageChannel();
    ch.port1.onmessage = async (e: MessageEvent) => {
      const m = e.data as { id?: unknown; method?: unknown; params?: unknown; ready?: boolean } | null;
      if (m?.ready) { setReady(true); return; }
      if (!m || typeof m.id !== "number" || typeof m.method !== "string") return;
      try { ch.port1.postMessage({ id: m.id, ok: true, result: await handle(m.method, m.params) }); }
      catch (err) { ch.port1.postMessage({ id: m.id, ok: false, error: (err as Error).message }); }
    };
    port.current = ch.port1;
    win.postMessage({ rolepi: "init", vars: c.vars, lang: c.lang, appVersion: c.deps(plugin).appVersion }, "*", [ch.port2]);
  };

  return (
    <div className="panel-frame" data-testid={`panel-${plugin.id}-${panel.id}`}>
      <iframe ref={frame} title={label(panel.title)} src={url} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={onLoad} />
      {!ready && <div className="panel-status">{slow ? t("panel.slow") : t("panel.loading")}</div>}
    </div>
  );
}
