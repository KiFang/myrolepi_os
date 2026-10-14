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
