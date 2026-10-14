import { useCallback, useEffect, useRef, useState } from "react";
import { tm } from "../core";
import { PluginInfo, PluginData, PluginRegistry, PluginState, RawPlugin, STORAGE_LIMIT, createRegistry, loadPlugins, sha256Hex } from "./plugin-host";

const EMPTY_STATE: PluginState = { approved: {}, disabled: [] };

/**
 * Жизненный цикл плагинов: чтение папки, согласия пользователя, включение/выключение,
 * настройки и личные данные плагинов. Всё хранится файлами в папке данных приложения.
 */
export function usePlugins(getLang: () => string) {
  const [registry, setRegistry] = useState<PluginRegistry>(createRegistry);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState("0.0.0");
  const [, bump] = useState(0);
  const data = useRef<Record<string, PluginData>>({});
  const state = useRef<PluginState>(EMPTY_STATE);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lang = useRef(getLang);
  lang.current = getLang;

  const reload = useCallback(async () => {
    const api = window.rpi;
    if (!api) { setLoading(false); return; }
    setLoading(true);
    try {
      const env: { version: string } = await api.env();
      setVersion(env.version);
      const raw: RawPlugin[] = await api.plugins();
      state.current = { ...EMPTY_STATE, ...((await api.store.read("app", "plugins")) ?? {}) };
      const result = await loadPlugins(raw, {
        sha256: sha256Hex,
        state: state.current,
        appVersion: env.version,
        getLang: () => lang.current(),
        readData: async (id) => (await api.store.read("plugin-data", id)) ?? { storage: {}, settings: {} },
        writeData: (id, d) => {
          clearTimeout(timers.current[id]);
          timers.current[id] = setTimeout(() => void api.store.write("plugin-data", id, d), 400);
        },
      });
      data.current = result.data;
      setRegistry(result.registry);
      setPlugins(result.plugins);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const writeState = async (next: PluginState) => {
    state.current = next;
    await window.rpi?.store.write("app", "plugins", next);
    await reload();
  };

  return {
    registry, plugins, loading, version, reload,
    /** пользователь разрешил плагин с этим отпечатком кода */
    approve: (id: string, hash: string) => writeState({ approved: { ...state.current.approved, [id]: hash }, disabled: state.current.disabled.filter((x) => x !== id) }),
    setEnabled: (id: string, on: boolean) => writeState({ ...state.current, disabled: on ? state.current.disabled.filter((x) => x !== id) : [...new Set([...state.current.disabled, id])] }),
    settingValue: (id: string, key: string, fallback: unknown) => data.current[id]?.settings?.[key] ?? fallback,
    setSetting: (id: string, key: string, value: unknown) => {
      const d = data.current[id];
      if (!d) return;
      d.settings = { ...d.settings, [key]: value };
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => void window.rpi?.store.write("plugin-data", id, d), 300);
      bump((n) => n + 1);
    },
    /** личное хранилище плагина для его панелей (право storage проверяет мост) */
    panelStorage: (id: string) => ({
      get: (key: string) => { const v = data.current[id]?.storage?.[key]; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },
      set: (key: string, value: unknown) => {
        const d = data.current[id];
        if (!d) throw new Error(tm("plug.storageFull"));
        const next = { ...d.storage, [key]: value === undefined ? undefined : JSON.parse(JSON.stringify(value)) };
        if (JSON.stringify(next).length > STORAGE_LIMIT) throw new Error(tm("plug.storageFull"));
        d.storage = next;
        clearTimeout(timers.current[id]);
        timers.current[id] = setTimeout(() => void window.rpi?.store.write("plugin-data", id, d), 400);
      },
    }),
    scaffold: (id: string, files: Record<string, string>): Promise<string> => window.rpi!.scaffoldPlugin(id, files),
    installExamples: (): Promise<number> => window.rpi!.installExamples(),
    available: !!window.rpi,
  };
}
export type PluginsApi = ReturnType<typeof usePlugins>;
