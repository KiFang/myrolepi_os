import { useState } from "react";
import { CardRenderer } from "../cards/CardRenderer";
import { useLang } from "../lang";
import type { CampaignEditorState } from "./CampaignEditor";

/** Все герои и существа кампании карточками. Фильтр по виду объектов — это и есть бестиарий. */
export function CampaignGallery({ ed }: { ed: CampaignEditorState }) {
  const { t, label } = useLang();
  const { campaign, system } = ed;
  const [category, setCategory] = useState("all");
  if (!campaign || !system) return null;
  const categories = [...new Set(system.entityTypes.map((x) => x.category))];
  const shown = campaign.entities.filter((e) => category === "all" || system.entityTypes.find((x) => x.id === e.typeId)?.category === category);
  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("ws.ctab.cards")} <small>{shown.length}</small></h2>
        <label className="ws-inline"><span className="muted">{t("ws.filter")}</span>
          <select aria-label={t("ws.filter")} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">{t("ws.filterAll")}</option>
            {categories.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
          </select>
        </label>
      </div>
      <p className="ws-hint ws-hint-tight">{t("ws.galleryHint")}</p>
      {!shown.length && <div className="ws-empty">{t("ws.galleryEmpty")}</div>}
      <div className="ws-gallery">
        {shown.map((e) => {
          const type = system.entityTypes.find((x) => x.id === e.typeId);
          const view = type?.cardViews.find((v) => v.id === e.cardView) ?? type?.cardViews[0];
          if (!type || !view) return null;
          return (
            <div className="ws-gallery-item" key={e.id}>
              <CardRenderer type={type} view={view} name={e.name} values={ed.computedFor(e)} registry={ed.registry} onRun={(a) => ed.run(e, a)} />
              {type.cardViews.length > 1 && (
                <select aria-label={t("ws.chooseView")} value={view.id} onChange={(ev) => ed.patchEntity(e.id, (x) => ({ ...x, cardView: ev.target.value }))}>
                  {type.cardViews.map((v) => <option key={v.id} value={v.id}>{label(v.name)}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
