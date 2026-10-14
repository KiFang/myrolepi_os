import { nextTrack, parseAudioRef, prevTrack } from "../../core";
import type { AudioFile, LoopMode } from "../../core";

export interface AudioState {
  library: AudioFile[];
  /** ссылка на играющий (или поставленный на паузу) трек */
  current: string | null;
  queue: string[];
  playing: boolean;
  volume: number;
  sfxVolume: number;
  loop: LoopMode;
  shuffle: boolean;
  position: number;
  duration: number;
  /** ссылка трека, который не удалось воспроизвести */
  failed: string | null;
}

const KEY = "rpi.audio";
const FADE_MS = 500;
const MAX_SFX = 8;

type Settings = Pick<AudioState, "volume" | "sfxVolume" | "loop" | "shuffle">;
const DEFAULTS: Settings = { volume: 0.7, sfxVolume: 0.9, loop: "all", shuffle: false };

function loadSettings(): Settings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    const num = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    return { volume: num(j.volume, DEFAULTS.volume), sfxVolume: num(j.sfxVolume, DEFAULTS.sfxVolume), loop: j.loop === "off" || j.loop === "one" || j.loop === "all" ? j.loop : DEFAULTS.loop, shuffle: j.shuffle === true };
  } catch { return DEFAULTS; }
}

/**
 * Плеер музыки и звуковая панель. Один на всё приложение: музыка не прерывается при смене страниц.
 * Адрес файла по ссылке задаёт приложение (rolepi-audio://…), в тестах его можно подменить.
 */
export class AudioEngine {
  private state: AudioState;
  private listeners = new Set<() => void>();
  private music: HTMLAudioElement | null = null;
  private sfx: HTMLAudioElement[] = [];
  private fade: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;
  /** какой трек нужно доиграть после затухания предыдущего (защита от гонок) */
  private token = 0;

  constructor(private urlFor: (ref: string) => string = (ref) => window.rpi?.audio?.url(ref) ?? "") {
    this.state = { library: [], current: null, queue: [], playing: false, position: 0, duration: 0, failed: null, ...loadSettings() };
  }

  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  getState = () => this.state;
  private set(patch: Partial<AudioState>) { this.state = { ...this.state, ...patch }; for (const l of [...this.listeners]) l(); }
  private save() { try { const { volume, sfxVolume, loop, shuffle } = this.state; localStorage.setItem(KEY, JSON.stringify({ volume, sfxVolume, loop, shuffle })); } catch { /* без сохранения */ } }

  setLibrary(library: AudioFile[]) { this.set({ library }); }
  has(ref: string) { return this.state.library.some((f) => f.ref === ref); }

  private el(): HTMLAudioElement {
    if (this.music) return this.music;
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("ended", () => this.onEnded());
    a.addEventListener("error", () => { if (a.src) this.set({ playing: false, failed: this.state.current }); });
    a.addEventListener("loadedmetadata", () => this.set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }));
    a.addEventListener("timeupdate", () => { const t = Date.now(); if (t - this.lastTick > 250) { this.lastTick = t; this.set({ position: a.currentTime }); } });
    this.music = a;
    return a;
  }

  private ramp(a: HTMLAudioElement, to: number, done?: () => void) {
    clearInterval(this.fade);
    const from = a.volume, steps = 10, step = (to - from) / steps;
    let n = 0;
    this.fade = setInterval(() => {
      n++;
      a.volume = Math.min(1, Math.max(0, n >= steps ? to : from + step * n));
      if (n >= steps) { clearInterval(this.fade); done?.(); }
    }, FADE_MS / steps);
  }

  /** Включает трек. queue — список, по которому пойдёт «дальше» (по умолчанию вся музыка). */
  async play(ref: string, queue?: string[]): Promise<boolean> {
    if (!parseAudioRef(ref)) return false;
    const list = queue ?? (this.state.queue.includes(ref) ? this.state.queue : this.state.library.filter((f) => f.kind === "music").map((f) => f.ref));
    const a = this.el();
    const token = ++this.token;
    const start = async () => {
      if (token !== this.token) return;
      a.src = this.urlFor(ref);
      a.volume = 0;
      this.set({ current: ref, queue: list.includes(ref) ? list : [ref, ...list], position: 0, duration: 0, failed: null });
      try { await a.play(); } catch { if (token === this.token) this.set({ playing: false, failed: ref }); return; }
      if (token !== this.token) return;
      this.set({ playing: true });
      this.ramp(a, this.state.volume);
    };
    if (this.state.playing && a.src) { this.ramp(a, 0, () => void start()); } else await start();
    return true;
  }

  pause() { const a = this.music; if (!a) return; this.token++; this.ramp(a, 0, () => a.pause()); this.set({ playing: false }); }
  async resume() { const a = this.music; if (!a || !this.state.current) return; this.token++; try { await a.play(); this.set({ playing: true, failed: null }); this.ramp(a, this.state.volume); } catch { this.set({ failed: this.state.current }); } }
  toggle() { if (this.state.playing) this.pause(); else if (this.state.current) void this.resume(); else { const first = this.state.library.find((f) => f.kind === "music"); if (first) void this.play(first.ref); } }
  stop() {
    const a = this.music;
    const tk = ++this.token;
    // очередь сбрасывается сразу: трек, доигрывающий последние мгновения затухания, не должен запустить следующий
    this.set({ playing: false, current: null, queue: [], position: 0, duration: 0, failed: null });
    if (a) this.ramp(a, 0, () => { if (tk === this.token) { a.pause(); a.removeAttribute("src"); a.load(); } });
  }

  next() { const { queue, current, loop, shuffle } = this.state; const i = current ? queue.indexOf(current) : -1; const n = nextTrack(Math.max(i, 0), queue.length, loop === "one" ? "all" : loop, shuffle); if (n !== null) void this.play(queue[n], queue); }
  prev() { const { queue, current } = this.state; if (this.music && this.music.currentTime > 3) { this.music.currentTime = 0; return; } const n = prevTrack(current ? queue.indexOf(current) : 0, queue.length); if (n !== null) void this.play(queue[n], queue); }
  private onEnded() {
    const { queue, current, loop, shuffle } = this.state;
    if (!current || !this.state.playing) return; // остановлено пользователем
    if (loop === "one" && this.music) { this.music.currentTime = 0; void this.music.play(); return; }
    const n = nextTrack(current ? queue.indexOf(current) : 0, queue.length, loop, shuffle);
    if (n === null) this.set({ playing: false, position: 0 }); else void this.play(queue[n], queue);
  }
  seek(sec: number) { if (this.music && Number.isFinite(sec)) { this.music.currentTime = sec; this.set({ position: sec }); } }
  setVolume(v: number) { const volume = Math.min(1, Math.max(0, v)); this.set({ volume }); if (this.music && this.state.playing) { clearInterval(this.fade); this.music.volume = volume; } this.save(); }
  setSfxVolume(v: number) { this.set({ sfxVolume: Math.min(1, Math.max(0, v)) }); this.save(); }
  setLoop(loop: LoopMode) { this.set({ loop }); this.save(); }
  setShuffle(shuffle: boolean) { this.set({ shuffle }); this.save(); }

  /** Короткий звук поверх музыки; одновременно звучит не больше восьми. */
  playSound(ref: string): boolean {
    if (!parseAudioRef(ref)) return false;
    const a = new Audio(this.urlFor(ref));
    a.volume = this.state.sfxVolume;
    const drop = () => { this.sfx = this.sfx.filter((x) => x !== a); };
    a.addEventListener("ended", drop);
    a.addEventListener("error", drop);
    this.sfx.push(a);
    while (this.sfx.length > MAX_SFX) { const old = this.sfx.shift()!; old.pause(); }
    void a.play().catch(drop);
    return true;
  }
  stopSounds() { for (const a of this.sfx) a.pause(); this.sfx = []; }
}

export const audioEngine = new AudioEngine();
