/** Сохранить данные в JSON-файл (диалог загрузки браузера/Electron). */
export function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]+/g, "_") + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Imported = { kind: "system" | "campaign"; data: unknown } | null;

/** Определяет, что за документ в файле. */
export function detectDocument(data: unknown): Imported {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.entityTypes)) return { kind: "system", data };
  if (Array.isArray(o.entities) && Array.isArray(o.notes)) return { kind: "campaign", data };
  return null;
}

/** Сохранить двоичные данные (например, пакет .rolepi) через диалог загрузки. */
export function downloadBytes(filename: string, bytes: Uint8Array, type = "application/octet-stream"): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

export function downloadText(filename: string, text: string, type = "application/json"): void {
  downloadBytes(filename, new TextEncoder().encode(text), type);
}
