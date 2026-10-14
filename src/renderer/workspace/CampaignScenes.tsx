import { parseAudioRef } from "../../core";
import type { MapMarker, Scene } from "../../core";
import { audioEngine } from "../audio/engine";
import { titleOf } from "../audio/titleOf";
import { useAudio } from "../audio/useAudio";
import { Icon } from "../icons";
import { useLang } from "../lang";
import { newId } from "../workspace-model";
import type { CampaignEditorState } from "./CampaignEditor";
import { Input } from "./inputs";
import { MapCanvas } from "./MapCanvas";

/** Сцены: участники, карта, музыка и звуки. «Запустить» включает музыку и открывает карту с метками и звуковыми кнопками. */
export function CampaignScenes({ ed }: { ed: CampaignEditorState }) {
  const { t } = useLang();
  const audio = useAudio();
  const { campaign } = ed;
  if (!campaign) return null;
  const scenes = campaign.scenes ?? [];
  const scene = scenes.find((s) => s.id === ed.sceneId) ?? scenes[0];
  const maps = campaign.maps ?? [];
  const patch = (id: string, p: Partial<Scene>) => ed.updateCampaign((c) => ({ ...c, scenes: (c.scenes ?? []).map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const add = () => {
    const s: Scene = { id: newId("scene"), title: t("scene.newTitle", { n: scenes.length + 1 }), entityIds: [] };
    ed.updateCampaign((c) => ({ ...c, scenes: [...(c.scenes ?? []), s] }));
    ed.setSceneId(s.id);
  };
  const remove = (s: Scene) => {
    if (!window.confirm(t("scene.deleteConfirm", { name: s.title }))) return;
    ed.updateCampaign((c) => ({
      ...c,
      scenes: (c.scenes ?? []).filter((x) => x.id !== s.id),
      maps: c.maps?.map((m) => ({ ...m, markers: m.markers.map((k) => (k.sceneId === s.id ? { ...k, sceneId: undefined } : k)) })),
    }));
    if (ed.activeScene === s.id) ed.setActiveScene(null);
    ed.setSceneId(null);
  };
  const music = audio.library.filter((f) => f.kind === "music");
  const sounds = audio.library.filter((f) => f.kind === "sounds");
  const missing = (ref?: string) => !!ref && parseAudioRef(ref) !== null && !audio.library.some((f) => f.ref === ref);
  const openMarker = (m: MapMarker) => ed.openTarget(m);
  const running = scene && ed.activeScene === scene.id;

  const start = (s: Scene) => {
    ed.setActiveScene(s.id);
    if (s.music && parseAudioRef(s.music)) {
      if (audioEngine.getState().loop === "off") audioEngine.setLoop("all"); // музыка сцены играет по кругу
      void audioEngine.play(s.music, [s.music]);
    }
  };
  const stop = () => { ed.setActiveScene(null); audioEngine.stop(); audioEngine.stopSounds(); };

  return (
    <div className="scenes">
      <div className="scene-list">
        <div className="ws-section-heading"><h2>{t("scene.title")} <small>{scenes.length}</small></h2></div>
        <button className="ws-with-icon" onClick={add}><Icon name="plus" size={15} />{t("scene.add")}</button>
        {!scenes.length && <div className="ws-empty">{t("scene.none")}</div>}
        {scenes.map((s) => (
          <button key={s.id} className={"scene-item" + (s.id === scene?.id ? " active" : "")} onClick={() => ed.setSceneId(s.id)}>
            <Icon name="scene" size={15} /><span className="ws-ellipsis">{s.title || t("ws.untitled")}</span>{ed.activeScene === s.id && <span className="scene-live" title={t("scene.running")} />}
          </button>
        ))}
      </div>
      {scene && (
        <div className="scene-editor">
          <div className="scene-head">
            <Input title={t("scene.name")} value={scene.title} onChange={(title) => patch(scene.id, { title })} />
            {running ? (
              <button className="ws-with-icon" onClick={stop}><Icon name="stop" size={14} />{t("scene.stop")}</button>
            ) : (
              <button className="ws-primary ws-with-icon" onClick={() => start(scene)}><Icon name="play" size={14} />{t("scene.start")}</button>
            )}
            <button className="ws-danger ws-with-icon" onClick={() => remove(scene)}><Icon name="trash" size={14} />{t("scene.delete")}</button>
          </div>

          {running && (
            <div className="scene-live-panel data-card" data-testid="scene-live">
              <div className="scene-live-title"><span className="scene-live" /><b>{t("scene.running")}</b>{scene.music && <span className="muted"><Icon name="music" size={13} /> {titleOf(audio.library, scene.music)}{missing(scene.music) ? ` — ${t("scene.fileMissing")}` : ""}</span>}</div>
              {(() => { const m = maps.find((x) => x.id === scene.mapId); return m ? <MapCanvas map={m} onOpen={openMarker} /> : null; })()}
              {!!scene.entityIds.length && (
                <div className="scene-people">{scene.entityIds.map((id) => { const e = campaign.entities.find((x) => x.id === id); return e ? <button key={id} className="ws-chip" onClick={() => ed.openTarget({ entityId: id })}>{e.name}</button> : null; })}</div>
              )}
              {!!scene.sounds?.length && (
                <div className="soundboard">{scene.sounds.map((ref) => <button key={ref} className="sound-pad" disabled={missing(ref)} onClick={() => audioEngine.playSound(ref)}><Icon name="volume" size={14} /><span className="ws-ellipsis">{titleOf(audio.library, ref)}</span></button>)}</div>
              )}
              {scene.notes && <p className="scene-notes">{scene.notes}</p>}
            </div>
          )}

          <Input title={t("scene.notes")} value={scene.notes ?? ""} multiline onChange={(notes) => patch(scene.id, { notes })} />
          <div className="ws-inline">
            <label className="ws-control"><span>{t("scene.map")}</span>
              <select aria-label={t("scene.map")} value={scene.mapId ?? ""} onChange={(e) => patch(scene.id, { mapId: e.target.value || undefined })}>
                <option value="">{t("scene.noMap")}</option>
                {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="ws-control"><span>{t("scene.music")}</span>
              <select aria-label={t("scene.music")} value={scene.music ?? ""} onChange={(e) => patch(scene.id, { music: e.target.value || undefined })}>
                <option value="">{t("scene.noMusic")}</option>
                {missing(scene.music) && <option value={scene.music}>{`${titleOf(audio.library, scene.music)} — ${t("scene.fileMissing")}`}</option>}
                {music.map((f) => <option key={f.ref} value={f.ref}>{f.folder ? `${f.folder} / ${f.title}` : f.title}</option>)}
              </select>
            </label>
          </div>
          {!music.length && <p className="ws-hint">{t("scene.musicHint")}</p>}

          <div className="ws-links">
            <span className="muted">{t("scene.people")}:</span>
            {scene.entityIds.map((id) => { const e = campaign.entities.find((x) => x.id === id); return (
              <span className="ws-chip" key={id}>{e?.name ?? "?"}<button className="ws-icon-button" aria-label={t("ws.unlink")} title={t("ws.unlink")} onClick={() => patch(scene.id, { entityIds: scene.entityIds.filter((x) => x !== id) })}><Icon name="close" size={11} /></button></span>
            ); })}
            <select aria-label={t("scene.addPerson")} value="" onChange={(e) => e.target.value && patch(scene.id, { entityIds: [...scene.entityIds, e.target.value] })}>
              <option value="">{t("scene.addPerson")}</option>
              {campaign.entities.filter((e) => !scene.entityIds.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="ws-links">
            <span className="muted">{t("scene.sounds")}:</span>
            {(scene.sounds ?? []).map((ref) => (
              <span className="ws-chip" key={ref}>{titleOf(audio.library, ref)}{missing(ref) ? " ⚠" : ""}<button className="ws-icon-button" aria-label={t("ws.unlink")} title={t("ws.unlink")} onClick={() => patch(scene.id, { sounds: (scene.sounds ?? []).filter((x) => x !== ref) })}><Icon name="close" size={11} /></button></span>
            ))}
            <select aria-label={t("scene.addSound")} value="" onChange={(e) => e.target.value && patch(scene.id, { sounds: [...(scene.sounds ?? []), e.target.value] })}>
              <option value="">{t("scene.addSound")}</option>
              {sounds.filter((f) => !(scene.sounds ?? []).includes(f.ref)).map((f) => <option key={f.ref} value={f.ref}>{f.folder ? `${f.folder} / ${f.title}` : f.title}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
