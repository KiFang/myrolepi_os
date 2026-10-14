import type { Author } from "../core";
import type { ExchangeApi } from "./exchange";

/** Подключает обмен и подписи к настоящему окружению (Electron). Вне Electron возвращает null. */
export function exchangeApi(): ExchangeApi | null {
  const api = window.rpi;
  if (!api) return null;
  return {
    readAsset: (id) => api.assets.read(id),
    putAsset: async (bytes) => { const r = await api.assets.put(bytes); return r.ok ? { ok: true, id: r.id } : { ok: false }; },
    ensureAuthor: (name) => api.keys.ensure(name) as Promise<Author>,
    sign: (payload) => api.keys.sign(payload),
    verify: (publicKey, payload, signature) => api.keys.verify(publicKey, payload, signature),
    backup: () => api.backups.create("before-import", "перед импортом"),
  };
}

/** Проверка подписи для интерфейса; null, если проверить нечем (разработка в браузере). */
export const verifier = (): ExchangeApi["verify"] | null => (window.rpi?.keys ? (k, p, s) => window.rpi!.keys.verify(k, p, s) : null);
