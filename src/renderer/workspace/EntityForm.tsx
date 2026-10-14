import type { EntityType } from "../../core";
import { putImage, resolveSrc } from "../assets";
import { useLang } from "../lang";
import { Input, JsonInput } from "./inputs";

/** Форма значений параметров объекта (герой в кампании, запись бестиария). Вычисляемые параметры только показываются. */
export function EntityForm({ type, values, computed, onSet }: { type: EntityType; values: Record<string, unknown>; computed?: { values: Record<string, unknown>; errors: Record<string, string> }; onSet: (fieldId: string, value: unknown) => void }) {
  const { t, label } = useLang();
  return (
    <div className="ws-sheet-fields">
      {type.fields.map((f) => {
        const value = values[f.id] ?? f.default;
        const set = (v: unknown) => onSet(f.id, v);
        const numeric = f.type === "number" || f.type === "resource";
        return (
          <div key={f.id}>
            {f.formula ? (
              <div className="ws-computed">
                <span>{label(f.label)} <small>ƒ</small></span>
                <strong>{computed?.errors[f.id] ? <span className="err">{computed.errors[f.id]}</span> : String(computed?.values[f.id] ?? "—")}</strong>
              </div>
            ) : f.type === "boolean" ? (
              <label className="ws-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(e) => set(e.target.checked)} />{label(f.label)}</label>
            ) : f.type === "select" ? (
              <label className="ws-control">
                <span>{label(f.label)}</span>
                <select value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
                  <option value="">{t("ws.notSelected")}</option>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{label(o.label)}</option>)}
                </select>
              </label>
            ) : f.type === "image" ? (
              <div className="ws-control">
                <span>{label(f.label)}</span>
                {typeof value === "string" && value && <img className="ws-image-preview" src={resolveSrc(value)} alt="" />}
                <input type="file" accept="image/*" aria-label={label(f.label)} onChange={async (ev) => {
                  const file = ev.target.files?.[0];
                  ev.target.value = "";
                  if (!file) return;
                  const r = await putImage(file);
                  if (r.ok) set(r.ref);
                  else window.alert(t(r.code === "too-big" ? "ws.imageTooBig" : r.code === "bad-type" ? "ws.imageBadType" : "ws.imageFailed"));
                }} />
                {typeof value === "string" && value && <button onClick={() => set("")}>{t("ws.removeImage")}</button>}
              </div>
            ) : f.type === "list" || (f.type === "resource" && typeof value === "object") ? (
              <JsonInput title={label(f.label)} value={value} onChange={set} />
            ) : (
              <Input title={label(f.label)} value={String(value ?? "")} type={numeric ? "number" : "text"} min={f.min} max={f.max} multiline={f.type === "longtext"} onChange={(v) => set(numeric ? (v === "" ? undefined : Number(v)) : v)} />
            )}
          </div>
        );
      })}
    </div>

  );
}
