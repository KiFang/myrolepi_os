import { useEffect, useState } from "react";
import { verifyProtection } from "../core";
import type { Author, GameSystem, ProtectionStatus } from "../core";
import { verifier } from "./rpiApi";

/** Проверяет подписи защищённых систем и знает ваш ключ автора (если он уже создан). */
export function useProtection(systems: GameSystem[]) {
  const [status, setStatus] = useState<Record<string, ProtectionStatus>>({});
  const [author, setAuthor] = useState<Author | null>(null);
  const key = systems.filter((s) => s.protection).map((s) => `${s.id}:${s.protection!.signature}:${s.name && JSON.stringify(s.name)}:${s.version}`).join("|");

  useEffect(() => {
    let alive = true;
    (async () => {
      const next: Record<string, ProtectionStatus> = {};
      for (const s of systems) if (s.protection) next[s.id] = await verifyProtection(s, verifier());
      if (alive) setStatus(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refreshAuthor = async () => { setAuthor((await window.rpi?.keys?.author()) ?? null); };
  useEffect(() => { void refreshAuthor(); }, []);
  return { status, author, refreshAuthor };
}
