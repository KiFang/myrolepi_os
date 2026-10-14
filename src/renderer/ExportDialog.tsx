import { useEffect, useState } from "react";
import { isLocked, formatKeyId } from "../core";
import type { Campaign, GameSystem } from "../core";
import { buildBundle } from "./exchange";
import { downloadBytes } from "./fileio";
import { Icon } from "./icons";
import { useLang } from "./lang";
import { Modal } from "./Modal";
import { exchangeApi } from "./rpiApi";
import { useToast } from "./toasts";

const LICENSES: { id: string; label: string | { ru: string; en: string } }[] = [
  { id: "cc-by", label: "CC BY 4.0" },
  { id: "cc-by-sa", label: "CC BY-SA 4.0" },
  { id: "orc", label: "ORC" },
  { id: "personal", label: { ru: "Только для личного пользования", en: "Personal use only" } },
  { id: "custom", label: { ru: "Другая…", en: "Other…" } },
];

interface Props { kind: "system" | "campaign"; system?: GameSystem; campaign?: Campaign; onClose: () => void }

/** Окно «Сохранить в файл»: пакет .rolepi с картинками; для системы — подпись и защита от правки. */
export function ExportDialog({ kind, system, campaign, onClose }: Props) {
  const { t, lang, label } = useLang();
  const notify = useToast();
  const api = window.rpi;
  const alreadyProtected = isLocked(system);
  const [protect, setProtect] = useState(false);
  const [author, setAuthor] = useState("");
  const [keyId, setKeyId] = useState<string | null>(null);
  const [license, setLicense] = useState("cc-by");
  const [customLicense, setCustomLicense] = useState("");
  const [allowFork, setAllowFork] = useState(true);
  const [includeSystem, setIncludeSystem] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api?.keys?.author().then((a) => { if (a) { setKeyId(a.keyId); setAuthor(a.name ?? ""); } });
  }, [api]);

  const title = kind === "system" ? label(system?.name) : campaign?.name ?? "";
  const licenseText = license === "custom" ? customLicense.trim() : (() => { const l = LICENSES.find((x) => x.id === license)!.label; return typeof l === "string" ? l : l[lang === "ru" ? "ru" : "en"]; })();
  const canSave = !busy && (!protect || (author.trim().length > 0 && licenseText.length > 0));

  const save = async () => {
    const ex = exchangeApi();
    if (!ex) { setError(t("exp.desktopOnly")); return; }
    setBusy(true);
    setError("");
    try {
      const appVersion = String(((await api?.env?.()) as { version?: string } | undefined)?.version ?? "");
      const { bytes, filename } = await buildBundle({
        kind, system, campaign, title: title || t("ws.untitled"), appVersion,
        includeSystem: kind === "campaign" ? includeSystem && !!system : undefined,
        protect: kind === "system" && protect ? { author: author.trim(), license: licenseText, allowFork } : undefined,
      }, ex);
      downloadBytes(filename, bytes, "application/zip");
      notify(t(protect ? "exp.doneProtected" : "exp.done", { name: filename }));
      onClose();
    } catch (e) {
      setError(t("exp.failed", { msg: (e as Error).message }));
    } finally { setBusy(false); }
  };

  return (
    <Modal title={t("exp.title")} onClose={onClose} footer={<>
      <button onClick={onClose}>{t("plugins.cancel")}</button>
      <button className="ws-primary ws-with-icon" disabled={!canSave} onClick={() => void save()}><Icon name="download" size={15} />{t("exp.save")}</button>
    </>}>
      <p className="muted">{t("exp.intro", { name: title })}</p>
      {kind === "campaign" && system && (
        <label className="ws-checkbox exp-row"><input type="checkbox" checked={includeSystem} onChange={(e) => setIncludeSystem(e.target.checked)} />{t("exp.includeSystem", { name: label(system.name) })}</label>
      )}
      {kind === "campaign" && !system && <p className="muted">{t("exp.noSystem")}</p>}
      {kind === "system" && alreadyProtected && <p className="exp-note"><Icon name="shield" size={15} />{t("exp.alreadyProtected")}</p>}
      {kind === "system" && !alreadyProtected && (
        <>
          <label className="ws-checkbox exp-row"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />{t("exp.protect")}</label>
          <p className="ws-hint">{t("exp.protectHint")}</p>
          {protect && (
            <div className="exp-protect">
              <label className="ws-control"><span>{t("exp.author")}</span><input aria-label={t("exp.author")} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder={t("exp.authorPlaceholder")} /></label>
              <label className="ws-control"><span>{t("exp.license")}</span>
                <select aria-label={t("exp.license")} value={license} onChange={(e) => setLicense(e.target.value)}>
                  {LICENSES.map((l) => <option key={l.id} value={l.id}>{typeof l.label === "string" ? l.label : l.label[lang === "ru" ? "ru" : "en"]}</option>)}
                </select>
              </label>
              {license === "custom" && <label className="ws-control"><span>{t("exp.licenseText")}</span><input aria-label={t("exp.licenseText")} value={customLicense} onChange={(e) => setCustomLicense(e.target.value)} /></label>}
              <label className="ws-checkbox exp-row"><input type="checkbox" checked={allowFork} onChange={(e) => setAllowFork(e.target.checked)} />{t("exp.allowFork")}</label>
              <p className="ws-hint">{keyId ? t("exp.keyKnown", { id: formatKeyId(keyId) }) : t("exp.keyNew")}</p>
              <p className="exp-warn"><Icon name="warn" size={15} />{t("exp.honest")}</p>
            </div>
          )}
        </>
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </Modal>
  );
}
