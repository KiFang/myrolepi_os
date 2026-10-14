import { useState } from "react";
import type { FieldDef } from "../../core";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { Popover } from "../Popover";
import { FIELD_PRESETS, PRESET_GROUPS, TYPE_TEMPLATES } from "../templates";
import type { FieldPreset, TypeTemplate } from "../templates";

/** «Готовые параметры»: отметьте нужные (Здоровье, Броня, шесть характеристик…) и добавьте одним нажатием. */
export function FieldPresetsMenu({ existing, onAdd }: { existing: FieldDef[]; onAdd: (presets: FieldPreset[]) => void }) {
  const { t, lang } = useLang();
  const [picked, setPicked] = useState<string[]>([]);
  const ids = new Set(existing.map((f) => f.id));
  const present = (p: FieldPreset) => p.fields.every((f) => ids.has(f.id));
  const text = (v: { ru: string; en: string }) => (lang === "ru" ? v.ru : v.en);
  return (
    <Popover label={t("tpl.presets")} icon={<Icon name="wand" size={15} />} title={t("tpl.presetsTitle")}>
      {(close) => (
        <div className="preset-menu">
          <p className="ws-hint ws-hint-tight">{t("tpl.presetsHint")}</p>
          <div className="preset-groups">
            {PRESET_GROUPS.map((g) => (
              <div key={g.id} className="preset-group">
                <div className="preset-group-title">{text(g.label)}</div>
                {FIELD_PRESETS.filter((p) => p.group === g.id).map((p) => (
                  <label key={p.key} className={"preset-row" + (present(p) ? " done" : "")}>
                    <input type="checkbox" disabled={present(p)} checked={picked.includes(p.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.key] : picked.filter((k) => k !== p.key))} />
                    <span>{text(p.label)}</span>
                    {p.fields.length > 1 && <small className="muted">+{p.fields.length}</small>}
                    {present(p) && <small className="muted">{t("tpl.have")}</small>}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="preset-foot">
            <button className="ws-primary ws-with-icon" disabled={!picked.length} onClick={() => { onAdd(FIELD_PRESETS.filter((p) => picked.includes(p.key))); setPicked([]); close(); }}><Icon name="plus" size={14} />{t("tpl.addPicked", { n: picked.length })}</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

/** «Из шаблона»: готовый тип (персонаж, существо, корабль…) с параметрами, карточкой и действиями. */
export function TypeTemplatesMenu({ onPick }: { onPick: (tpl: TypeTemplate) => void }) {
  const { t, lang } = useLang();
  const text = (v: { ru: string; en: string }) => (lang === "ru" ? v.ru : v.en);
  return (
    <Popover label={t("tpl.fromTemplate")} icon={<Icon name="system" size={15} />} title={t("tpl.fromTemplateTitle")}>
      {(close) => (
        <div className="preset-menu">
          <p className="ws-hint ws-hint-tight">{t("tpl.templatesHint")}</p>
          {TYPE_TEMPLATES.map((tpl) => (
            <button key={tpl.key} className="template-row" onClick={() => { onPick(tpl); close(); }}>
              <b>{text(tpl.label)}</b>
              <small className="muted">{text(tpl.description)}</small>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
