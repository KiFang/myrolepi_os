import { useCallback, useEffect, useState } from "react";
import type { BackupManifest } from "../main/lib/backups";
import { collectAssetRefs } from "./assets";
import { Icon } from "./icons";
import { useLang } from "./lang";
import { currentProject } from "./projectBridge";
import { useToast } from "./toasts";

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Раздел «Данные»: резервные копии и файлы проекта. */
export function DataPage() {
  const { t, lang } = useLang();
  const notify = useToast();
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [files, setFiles] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const api = window.rpi;

  const refresh = useCallback(async () => {
    if (!api) return;
    setBackups(await api.backups.list());
    const list = await api.assets.list();
    setFiles({ count: list.length, bytes: list.reduce((n, a) => n + a.size, 0) });
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const create = async () => {
    if (!api) return;
    setBusy(true);
    try { await api.backups.create("manual", note.trim() || undefined); setNote(""); notify(t("data.created")); await refresh(); } finally { setBusy(false); }
  };
  const restore = async (b: BackupManifest) => {
    if (!api || !window.confirm(t("data.restoreConfirm", { date: new Date(b.createdAt).toLocaleString(lang) }))) return;
    setBusy(true);
    try {
      const r = await api.backups.restore(b.id);
      if (!r) { notify(t("data.restoreFailed")); return; }
      window.dispatchEvent(new CustomEvent("rolepi:data-changed"));
      notify(t("data.restored"));
      await refresh();
    } finally { setBusy(false); }
  };
  const remove = async (b: BackupManifest) => {
    if (!api || !window.confirm(t("data.deleteConfirm"))) return;
    await api.backups.delete(b.id);
    await refresh();
  };
  const clean = async () => {
    if (!api) return;
    const r = await api.assets.gc(collectAssetRefs(currentProject()));
    notify(r.deleted ? t("data.cleaned", { n: r.deleted, size: fmtBytes(r.bytes) }) : t("data.nothingToClean"));
    await refresh();
  };

  if (!api) return (<><h1><Icon name="folder" size={24} />{t("data.title")}</h1><div className="ws-empty">{t("data.desktopOnly")}</div></>);
  return (
    <>
      <h1><Icon name="folder" size={24} />{t("data.title")}</h1>
      <p className="muted">{t("data.intro")}</p>

      <h3>{t("data.backups")}</h3>
      <div className="data-card">
        <p className="muted">{t("data.backupsHint")}</p>
        <div className="data-create">
          <input value={note} placeholder={t("data.notePlaceholder")} aria-label={t("data.notePlaceholder")} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} />
          <button className="ws-primary ws-with-icon" disabled={busy} onClick={() => void create()}><Icon name="save" size={15} />{t("data.createNow")}</button>
          <button className="ws-with-icon" onClick={() => void api.backups.openFolder()}><Icon name="folder" size={15} />{t("data.openFolder")}</button>
        </div>
      </div>
      {!backups.length && <div className="ws-empty">{t("data.noBackups")}</div>}
      <div className="data-list">
        {backups.map((b) => (
          <div className="data-row" key={b.id}>
            <div className="data-when"><b>{new Date(b.createdAt).toLocaleString(lang)}</b><span className={`data-reason ${b.reason}`}>{t(`data.reason.${b.reason}`)}</span></div>
            <div className="muted data-what">{t("data.counts", { systems: b.systems, campaigns: b.campaigns, size: fmtBytes(b.bytes) })}{b.note ? ` · ${b.note}` : ""}</div>
            <div className="data-actions">
              <button disabled={busy} onClick={() => void restore(b)}>{t("data.restore")}</button>
              <button className="ws-icon-button" title={t("ws.delete")} aria-label={`${t("ws.delete")}: ${b.id}`} onClick={() => void remove(b)}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
      </div>

      <h3>{t("data.files")}</h3>
      <div className="data-card">
        <p>{t("data.filesStat", { n: files.count, size: fmtBytes(files.bytes) })}</p>
        <p className="muted">{t("data.filesHint")}</p>
        <button className="ws-with-icon" onClick={() => void clean()}><Icon name="trash" size={15} />{t("data.clean")}</button>
      </div>
    </>
  );
}
