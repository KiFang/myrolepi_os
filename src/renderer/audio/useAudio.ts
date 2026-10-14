import { useEffect, useSyncExternalStore } from "react";
import { audioEngine } from "./engine";

export const useAudio = () => useSyncExternalStore(audioEngine.subscribe, audioEngine.getState);

/** Держит список файлов из папок звука актуальным: при запуске, при изменении папок и при возврате в окно. */
export function useAudioLibrary() {
  useEffect(() => {
    const api = window.rpi?.audio;
    if (!api) return;
    let alive = true;
    const load = () => { void api.list().then((list) => { if (alive) audioEngine.setLibrary(list); }).catch(() => {}); };
    load();
    const off = api.onChange(load);
    window.addEventListener("focus", load);
    return () => { alive = false; off(); window.removeEventListener("focus", load); };
  }, []);
}
