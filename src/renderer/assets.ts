import { collectAssetRefs, isAssetRef } from "../core";

/** Работа с файлами проекта: ссылки "asset:<имя>" в документах превращаются в адреса для показа. */
export { collectAssetRefs, isAssetRef };
const ASSET_REF = /^asset:([a-f0-9]{64}\.(?:png|jpg|webp|gif))$/;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Адрес для <img> и CSS: asset:… → rolepi-asset://…; обычные адреса и data: проходят как есть. */
export function resolveSrc(src?: string): string | undefined {
  if (!src) return undefined;
  const m = ASSET_REF.exec(src);
  if (m) return window.rpi?.assets.url(m[1]);
  return src;
}

export type PutResult = { ok: true; ref: string } | { ok: false; code: "too-big" | "bad-type" | "failed" };

/**
 * Сохраняет картинку как файл проекта и возвращает ссылку для документа.
 * Вне Electron (разработка в браузере) возвращает data:-адрес — документ остаётся рабочим.
 */
export async function putImage(file: File): Promise<PutResult> {
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, code: "too-big" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!window.rpi) {
    const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
    return { ok: true, ref: url };
  }
  const r = await window.rpi.assets.put(bytes);
  if (r.ok) return { ok: true, ref: `asset:${r.id}` };
  return { ok: false, code: r.code === "too-big" || r.code === "bad-type" ? r.code : "failed" };
}
