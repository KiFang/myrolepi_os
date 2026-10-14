import { useState } from "react";
import type { GameMap, MapMarker } from "../../core";
import { putImage } from "../assets";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { newId } from "../workspace-model";
import type { CampaignEditorState } from "./CampaignEditor";
import { Input } from "./inputs";
import { MARKER_COLORS, MapCanvas } from "./MapCanvas";

type LinkKind = "none" | "scene" | "entity" | "note";
const kindOf = (m: MapMarker): LinkKind => (m.sceneId ? "scene" : m.entityId ? "entity" : m.noteId ? "note" : "none");

/** Карты кампании: картинка, метки (перетаскиваются) и связи меток со сценами, героями и заметками. */
export function CampaignMaps({ ed }: { ed: CampaignEditorState }) {
  const { t } = useLang();
  const { campaign } = ed;
  const [adding, setAdding] = useState(false);
  const [markerId, setMarkerId] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!campaign) return null;
  const maps = campaign.maps ?? [];
  const map = maps.find((m) => m.id === ed.mapId) ?? maps[0];
  const marker = map?.markers.find((m) => m.id === markerId);

  const patchMap = (id: string, fn: (m: GameMap) => GameMap) => ed.updateCampaign((c) => ({ ...c, maps: (c.maps ?? []).map((m) => (m.id === id ? fn(m) : m)) }));
  const patchMarker = (id: string, patch: Partial<MapMarker>) => map && patchMap(map.id, (m) => ({ ...m, markers: m.markers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addMap = async (file?: File) => {
    if (!file) return;
    setError("");
    const r = await putImage(file);
    if (!r.ok) { setError(t(r.code === "too-big" ? "ws.imageTooBig" : r.code === "bad-type" ? "ws.imageBadType" : "ws.imageFailed")); return; }
    const created: GameMap = { id: newId("map"), name: file.name.replace(/\.[^.]+$/, "") || t("map.newName"), image: r.ref, markers: [] };
    ed.updateCampaign((c) => ({ ...c, maps: [...(c.maps ?? []), created] }));
    ed.setMapId(created.id);
    setMarkerId(null);
  };
  const removeMap = () => {
    if (!map || !window.confirm(t("map.deleteConfirm", { name: map.name }))) return;
    ed.updateCampaign((c) => ({
      ...c,
      maps: (c.maps ?? []).filter((m) => m.id !== map.id),
      scenes: c.scenes?.map((s) => (s.mapId === map.id ? { ...s, mapId: undefined } : s)),
    }));
    ed.setMapId(null);
    setMarkerId(null);
  };
  const setLink = (m: MapMarker, kind: LinkKind, target?: string) =>
    patchMarker(m.id, { sceneId: kind === "scene" ? target : undefined, entityId: kind === "entity" ? target : undefined, noteId: kind === "note" ? target : undefined });
  const targets = (kind: LinkKind) =>
    kind === "scene" ? (campaign.scenes ?? []).map((s) => ({ id: s.id, name: s.title }))
    : kind === "entity" ? campaign.entities.map((e) => ({ id: e.id, name: e.name }))
    : kind === "note" ? campaign.notes.map((n) => ({ id: n.id, name: n.title })) : [];

  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("map.title")} <small>{maps.length}</small></h2>
        <div className="ws-inline">
          <label className="ws-file-button ws-with-icon"><Icon name="plus" size={15} />{t("map.add")}<input type="file" accept="image/*" hidden aria-label={t("map.add")} onChange={(e) => { void addMap(e.target.files?.[0]); e.target.value = ""; }} /></label>
        </div>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {!maps.length && <div className="ws-empty">{t("map.none")}</div>}
      {maps.length > 1 && (
        <div className="ws-mode-tabs ws-mini-tabs">
          {maps.map((m) => <button key={m.id} className={m.id === map?.id ? "active" : ""} onClick={() => { ed.setMapId(m.id); setMarkerId(null); }}>{m.name}</button>)}
        </div>
      )}
      {map && (
        <div className="map-editor">
          <div className="map-toolbar">
            <Input title={t("map.name")} value={map.name} onChange={(name) => patchMap(map.id, (m) => ({ ...m, name }))} />
            <button className={"ws-with-icon" + (adding ? " ws-primary" : "")} aria-pressed={adding} onClick={() => setAdding((v) => !v)}><Icon name="pin" size={15} />{adding ? t("map.addingOn") : t("map.addMarker")}</button>
            <button className="ws-danger ws-with-icon" onClick={removeMap}><Icon name="trash" size={15} />{t("map.delete")}</button>
          </div>
          <p className="ws-hint">{adding ? t("map.hintAdding") : t("map.hint")}</p>
          <MapCanvas map={map} editable adding={adding} selectedId={markerId}
            onSelect={setMarkerId}
            onAdd={(x, y) => {
              const m: MapMarker = { id: newId("marker"), x, y, label: t("map.markerDefault", { n: map.markers.length + 1 }), color: MARKER_COLORS[map.markers.length % MARKER_COLORS.length] };
              patchMap(map.id, (mm) => ({ ...mm, markers: [...mm.markers, m] }));
              setMarkerId(m.id);
              setAdding(false);
            }}
            onMove={(id, x, y) => patchMarker(id, { x, y })} />
          {marker ? (
            <div className="map-marker-editor data-card" data-testid="marker-editor">
              <Input title={t("map.markerLabel")} value={marker.label} onChange={(label) => patchMarker(marker.id, { label })} />
              <div className="map-colors" role="radiogroup" aria-label={t("map.markerColor")}>
                {MARKER_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={(marker.color ?? MARKER_COLORS[0]) === c} aria-label={c} className={"map-swatch" + ((marker.color ?? MARKER_COLORS[0]) === c ? " on" : "")} style={{ background: c }} onClick={() => patchMarker(marker.id, { color: c })} />)}
              </div>
              <div className="ws-inline">
                <label className="ws-control"><span>{t("map.linkKind")}</span>
                  <select aria-label={t("map.linkKind")} value={kindOf(marker)} onChange={(e) => setLink(marker, e.target.value as LinkKind, targets(e.target.value as LinkKind)[0]?.id)}>
                    <option value="none">{t("map.link.none")}</option><option value="scene">{t("map.link.scene")}</option><option value="entity">{t("map.link.entity")}</option><option value="note">{t("map.link.note")}</option>
                  </select>
                </label>
                {kindOf(marker) !== "none" && (
                  <label className="ws-control"><span>{t("map.linkTarget")}</span>
                    <select aria-label={t("map.linkTarget")} value={marker.sceneId ?? marker.entityId ?? marker.noteId ?? ""} onChange={(e) => setLink(marker, kindOf(marker), e.target.value)}>
                      {targets(kindOf(marker)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </label>
                )}
                <button className="ws-danger ws-with-icon" onClick={() => { patchMap(map.id, (m) => ({ ...m, markers: m.markers.filter((x) => x.id !== marker.id) })); setMarkerId(null); }}><Icon name="trash" size={14} />{t("map.deleteMarker")}</button>
              </div>
            </div>
          ) : (
            !!map.markers.length && <p className="ws-hint">{t("map.selectHint")}</p>
          )}
        </div>
      )}
    </>
  );
}
