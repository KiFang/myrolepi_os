import { audioEngine } from "./engine";
import { titleOf } from "./titleOf";
import { useAudio } from "./useAudio";
import { Icon } from "../icons";
import { useLang } from "../lang";

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
