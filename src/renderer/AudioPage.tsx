import { useEffect, useMemo, useState } from "react";
import type { AudioFile } from "../core";
import { audioEngine } from "./audio/engine";
import { useAudio } from "./audio/useAudio";
import { Icon } from "./icons";
import { useLang } from "./lang";

const fmtTime = (s: number) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const titleOf = (library: AudioFile[], ref: string | null | undefined) => (ref ? library.find((f) => f.ref === ref)?.title ?? ref.split("/").pop() ?? ref : "");

/** Раздел «Звук»: музыка из папки, плеер и звуковая панель. Файлы, брошенные в папки, появляются сами. */
export function AudioPage() {
  const { t } = useLang();
  const a = useAudio();
  const api = window.rpi?.audio;
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<{ music: string; sounds: string } | null>(null);
  useEffect(() => { void api?.folders().then(setFolders); }, [api]);

  const q = query.trim().toLowerCase();
  const match = (f: AudioFile) => !q || f.title.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q);
  const music = useMemo(() => a.library.filter((f) => f.kind === "music"), [a.library]);
  const sounds = useMemo(() => a.library.filter((f) => f.kind === "sounds"), [a.library]);
  const group = (list: AudioFile[]) => { const m = new Map<string, AudioFile[]>(); for (const f of list.filter(match)) (m.get(f.folder) ?? m.set(f.folder, []).get(f.folder)!).push(f); return [...m]; };
  const musicGroups = group(music);
  const soundGroups = group(sounds);
  const loopNext = { off: "all", all: "one", one: "off" } as const;

  if (!api) return (<><h1><Icon name="music" size={24} />{t("audio.title")}</h1><div className="ws-empty">{t("audio.desktopOnly")}</div></>);
  return (
    <>
      <h1><Icon name="music" size={24} />{t("audio.title")}</h1>
      <p className="muted">{t("audio.intro")}</p>
      <div className="audio-folders">
        <button className="ws-with-icon" onClick={() => void api.openFolder("music")}><Icon name="folder" size={15} />{t("audio.openMusic")}</button>
        <button className="ws-with-icon" onClick={() => void api.openFolder("sounds")}><Icon name="folder" size={15} />{t("audio.openSounds")}</button>
        <button className="ws-with-icon" onClick={() => void api.list().then((l) => audioEngine.setLibrary(l))}><Icon name="refresh" size={15} />{t("audio.refresh")}</button>
        {folders && <span className="muted audio-path" title={folders.music}>{folders.music}</span>}
      </div>

      <div className="audio-player data-card" aria-label={t("audio.player")}>
        <div className="audio-now">
          <b>{a.current ? titleOf(a.library, a.current) : t("audio.nothing")}</b>
          {a.failed && a.failed === a.current && <span className="err">{t("audio.failed")}</span>}
        </div>
        <div className="audio-controls">
          <button className="ws-icon-button" title={t("audio.prev")} aria-label={t("audio.prev")} onClick={() => audioEngine.prev()}><Icon name="prev" size={18} /></button>
          <button className="ws-primary ws-icon-button audio-play" title={a.playing ? t("audio.pause") : t("audio.play")} aria-label={a.playing ? t("audio.pause") : t("audio.play")} onClick={() => audioEngine.toggle()}><Icon name={a.playing ? "pause" : "play"} size={20} /></button>
          <button className="ws-icon-button" title={t("audio.next")} aria-label={t("audio.next")} onClick={() => audioEngine.next()}><Icon name="next" size={18} /></button>
          <button className="ws-icon-button" title={t("audio.stop")} aria-label={t("audio.stop")} onClick={() => audioEngine.stop()}><Icon name="stop" size={16} /></button>
          <span className="audio-time">{fmtTime(a.position)}</span>
          <input type="range" className="audio-seek" aria-label={t("audio.seek")} min={0} max={a.duration || 0} step={1} value={Math.min(a.position, a.duration || 0)} disabled={!a.duration} onChange={(e) => audioEngine.seek(Number(e.target.value))} />
          <span className="audio-time">{fmtTime(a.duration)}</span>
          <button className="ws-icon-button" aria-pressed={a.shuffle} title={t("audio.shuffle")} aria-label={t("audio.shuffle")} onClick={() => audioEngine.setShuffle(!a.shuffle)}><Icon name="shuffle" size={16} /></button>
          <button className="ws-icon-button" aria-pressed={a.loop !== "off"} title={t(`audio.loop.${a.loop}`)} aria-label={t(`audio.loop.${a.loop}`)} onClick={() => audioEngine.setLoop(loopNext[a.loop])}><Icon name="repeat" size={16} /><small>{a.loop === "one" ? "1" : ""}</small></button>
          <Icon name="volume" size={16} />
          <input type="range" className="audio-volume" aria-label={t("audio.volume")} min={0} max={1} step={0.05} value={a.volume} onChange={(e) => audioEngine.setVolume(Number(e.target.value))} />
        </div>
      </div>

      <div className="ws-section-heading">
        <h2>{t("audio.music")} <small>{music.length}</small></h2>
        <input type="search" aria-label={t("audio.search")} placeholder={t("audio.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {!music.length && <div className="ws-empty">{t("audio.noMusic")}</div>}
      {!!music.length && !musicGroups.length && <div className="ws-empty">{t("audio.nothingFound")}</div>}
      {musicGroups.map(([folder, files]) => (
        <div className="audio-group" key={folder || "_root"}>
          {folder && <div className="audio-folder"><Icon name="folder" size={14} /><b>{folder}</b><button className="ws-with-icon" onClick={() => void audioEngine.play(files[0].ref, files.map((f) => f.ref))}><Icon name="play" size={13} />{t("audio.playFolder")}</button></div>}
          {files.map((f) => (
            <div key={f.ref} className={"audio-row" + (a.current === f.ref ? " current" : "")}>
              <button className="ws-icon-button" aria-label={`${t("audio.play")}: ${f.title}`} title={t("audio.play")} onClick={() => void audioEngine.play(f.ref, files.map((x) => x.ref))}><Icon name={a.current === f.ref && a.playing ? "pause" : "play"} size={15} /></button>
              <span className="ws-ellipsis" title={f.path}>{f.title}</span>
              <small className="muted">{fmtSize(f.size)}</small>
            </div>
          ))}
        </div>
      ))}

      <div className="ws-section-heading">
        <h2>{t("audio.sounds")} <small>{sounds.length}</small></h2>
        <div className="ws-inline">
          <Icon name="volume" size={16} />
          <input type="range" aria-label={t("audio.sfxVolume")} min={0} max={1} step={0.05} value={a.sfxVolume} onChange={(e) => audioEngine.setSfxVolume(Number(e.target.value))} />
          <button className="ws-with-icon" onClick={() => audioEngine.stopSounds()}><Icon name="stop" size={14} />{t("audio.stopSounds")}</button>
        </div>
      </div>
      {!sounds.length && <div className="ws-empty">{t("audio.noSounds")}</div>}
      {soundGroups.map(([folder, files]) => (
        <div className="audio-group" key={folder || "_root"}>
          {folder && <div className="audio-folder"><Icon name="folder" size={14} /><b>{folder}</b></div>}
          <div className="soundboard">{files.map((f) => <button key={f.ref} className="sound-pad" onClick={() => audioEngine.playSound(f.ref)} title={f.path}><Icon name="volume" size={14} /><span className="ws-ellipsis">{f.title}</span></button>)}</div>
        </div>
      ))}
    </>
  );
}

/** Маленький плеер в шапке: виден, пока есть выбранный трек. */
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { t } = useLang();
  const a = useAudio();
  if (!a.current) return null;
  return (
    <div className="mini-player" role="group" aria-label={t("audio.player")}>
      <button className="ws-icon-button" aria-label={a.playing ? t("audio.pause") : t("audio.play")} title={a.playing ? t("audio.pause") : t("audio.play")} onClick={() => audioEngine.toggle()}><Icon name={a.playing ? "pause" : "play"} size={14} /></button>
      <button className="mini-title" title={t("audio.open")} onClick={onOpen}><span className={"mini-eq" + (a.playing ? " on" : "")} aria-hidden="true" /><span className="ws-ellipsis">{titleOf(a.library, a.current)}</span></button>
    </div>
  );
}
