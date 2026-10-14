import { formatKeyId } from "../core";
import type { ProtectionStatus } from "../core";
import { Icon } from "./icons";
import { useLang } from "./lang";

/** Полоса над защищённой системой: кто автор, подлинна ли она и можно ли сделать правимую копию. */
export function ProtectionBanner({ status, system, canFork, onFork }: { status: ProtectionStatus; system: { protection?: { keyId: string }; meta?: { author?: string; license?: string; derivedFrom?: { title: string; author?: string } } }; canFork: boolean; onFork: () => void }) {
  const { t } = useLang();
  if (status.state === "none") return null;
  const bad = status.state === "tampered";
  const keyId = system.protection?.keyId ? formatKeyId(system.protection.keyId) : "";
  return (
    <div className={"protect-banner " + (bad ? "bad" : status.state === "unverified" ? "warn" : "ok")} role="status">
      <Icon name={bad ? "warn" : "shield"} size={18} />
      <div className="protect-text">
        <b>{t(`prot.${status.state}.title`)}</b>
        <span>{t(`prot.${status.state}.text`, { author: system.meta?.author ?? "—", key: keyId, license: system.meta?.license ?? "—" })}</span>
      </div>
      {canFork ? <button className="ws-primary ws-with-icon" onClick={onFork}><Icon name="copy" size={14} />{t("prot.fork")}</button> : <span className="muted protect-nofork">{t("prot.noFork")}</span>}
    </div>
  );
}
