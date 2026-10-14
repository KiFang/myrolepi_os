import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "../lang";
import { migrateProject } from "../migration";
import { libraryNewer, libraryOld, libraryProblem } from "../workspace-model";
import type { Project } from "../workspace-model";

const empty: Project = { systems: [], campaigns: [] };
const stringify = (v: unknown) => JSON.stringify(v);
const MAX_HISTORY = 80;

export interface Notice { key: string; params?: Record<string, string | number> }

/**
 * Библиотека проекта: загрузка и сохранение JSON через хранилище Electron,
 * история отмены/повтора и горячие клавиши. `active` — реагировать ли на клавиши
 * (когда открыт другой раздел, Ctrl+Z не должен трогать рабочее пространство).
 */
export function useLibrary(active: boolean) {
  const { t } = useLang();
  const [project, setProject] = useState<Project>(empty);
  const [saved, setSaved] = useState(stringify(empty));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>({ key: "ws.opening" });
  const [loadError, setLoadError] = useState("");
  const [undo, setUndo] = useState<Project[]>([]);
  const [redo, setRedo] = useState<Project[]>([]);
  const current = useRef(project);
  current.current = project;
  const dirty = useMemo(() => stringify(project) !== saved, [project, saved]);

  /** Читает документы с диска, при необходимости переносит старый формат (сначала делая копию). */
  const load = useCallback(async () => {
    const api = window.rpi;
    const store = api?.store;
    if (!api || !store) throw new Error("ws.needElectron");
    const read = async (kind: string) => Promise.all((await store.list(kind)).map((id: string) => store.read(kind, id)));
    const [systems, campaigns] = await Promise.all([read("systems"), read("campaigns")]);
    // Не подменяем библиотеку пустой и не трогаем файлы, которые не умеем читать
    if (libraryNewer(systems, campaigns)) throw new Error("ws.newerFormat");
    if (libraryProblem(systems, campaigns)) throw new Error("ws.badFormat");
    let next = { systems, campaigns } as Project;
    let migrated = false;
    if (libraryOld(systems, campaigns)) {
      await api.backups.create("before-migration", "перед переносом на новый формат");
      const put = async (bytes: Uint8Array) => { const r = await api.assets.put(bytes); return r.ok ? `asset:${r.id}` : null; };
      next = await migrateProject(systems, campaigns, put);
      for (const sys of next.systems) await store.write("systems", sys.id, sys);
      for (const c of next.campaigns) await store.write("campaigns", c.id, c);
      migrated = true;
    }
    setProject(next);
    setSaved(stringify(next));
    setUndo([]);
    setRedo([]);
    setLoadError("");
    setReady(true);
    setNotice({ key: migrated ? "ws.migrated" : "ws.opened" });
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => load().catch((e) => {
      if (!alive) return;
      const key = (e as Error).message;
      setLoadError(key.startsWith("ws.") ? t(key) : key);
      setNotice({ key: "ws.openFailed" });
    });
    void run();
    // восстановление копии или импорт меняют файлы на диске — читаем заново
    const onChanged = () => void run();
    window.addEventListener("rolepi:data-changed", onChanged);
    return () => { alive = false; window.removeEventListener("rolepi:data-changed", onChanged); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = useCallback((update: (p: Project) => Project) => {
    const previous = current.current;
    const next = update(previous);
    if (stringify(previous) === stringify(next)) return;
    setUndo((h) => [...h.slice(-(MAX_HISTORY - 1)), previous]);
    setRedo([]);
    current.current = next;
    setProject(next);
  }, []);

  const step = useCallback((direction: "undo" | "redo") => {
    const stack = direction === "undo" ? undo : redo;
    if (!stack.length) return false;
    const next = stack[stack.length - 1];
    const previous = current.current;
    if (direction === "undo") { setUndo(stack.slice(0, -1)); setRedo((h) => [...h, previous]); }
    else { setRedo(stack.slice(0, -1)); setUndo((h) => [...h, previous]); }
    current.current = next;
    setProject(next);
    return true;
  }, [undo, redo]);

  const save = useCallback(async () => {
    const store = window.rpi?.store;
    if (!ready || saving || !store) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const invalid = document.querySelector<HTMLInputElement>(".workspace input:invalid");
    if (invalid) {
      invalid.reportValidity();
      setNotice({ key: "ws.fixInvalid" });
      return;
    }
    const snapshot = current.current;
    setSaving(true);
    try {
      for (const s of snapshot.systems) await store.write("systems", s.id, s);
      for (const c of snapshot.campaigns) await store.write("campaigns", c.id, c);
      const before = JSON.parse(saved) as Project;
      for (const s of before.systems) if (!snapshot.systems.some((x) => x.id === s.id)) await store.remove("systems", s.id);
      for (const c of before.campaigns) if (!snapshot.campaigns.some((x) => x.id === c.id)) await store.remove("campaigns", c.id);
      setSaved(stringify(snapshot));
      setNotice({ key: "ws.saved" });
      void window.rpi?.backups?.auto(); // автоматическая копия, не чаще раза в 10 минут
    } catch (e) {
      setNotice({ key: "ws.saveError", params: { msg: (e as Error).message } });
    } finally {
      setSaving(false);
    }
  }, [ready, saving, saved]);

  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (!active || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); void save(); return; }
      // в текстовых полях остаётся обычная отмена ввода
      const typing = e.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable);
      if (typing) return;
      if (key === "z") { e.preventDefault(); step(e.shiftKey ? "redo" : "undo"); }
      if (key === "y") { e.preventDefault(); step("redo"); }
    };
    const leave = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("beforeunload", leave);
    return () => { window.removeEventListener("keydown", keyboard); window.removeEventListener("beforeunload", leave); };
  }, [active, dirty, save, step]);

  const getProject = useCallback(() => current.current, []);
  return {
    getProject, reload: () => void load(),
    project, ready, saving, dirty, notice, setNotice, loadError, change, save,
    canUndo: undo.length > 0, canRedo: redo.length > 0,
    undo: () => step("undo"), redo: () => step("redo"),
  };
}
