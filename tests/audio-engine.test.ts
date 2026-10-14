import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioFile } from "../src/core";
import { describeAudio } from "../src/core";
import { AudioEngine } from "../src/renderer/audio/engine";

/** Минимальная подмена HTMLAudioElement: играет мгновенно, конец трека вызывается вручную. */
class FakeAudio {
  static all: FakeAudio[] = [];
  src = ""; volume = 1; paused = true; currentTime = 0; duration = 10; preload = "";
  private handlers: Record<string, (() => void)[]> = {};
  constructor(src?: string) { if (src) this.src = src; FakeAudio.all.push(this); }
  addEventListener(n: string, cb: () => void) { (this.handlers[n] ??= []).push(cb); }
  removeAttribute(n: string) { if (n === "src") this.src = ""; }
  load() {}
  pause() { this.paused = true; }
  async play() { this.paused = false; }
  fire(n: string) { for (const h of this.handlers[n] ?? []) h(); }
}

const lib = (...refs: string[]): AudioFile[] => refs.map((r) => { const i = r.indexOf("/"); return describeAudio(r.slice(0, i) as "music", r.slice(i + 1), 10); });
const flush = async () => { for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(200); } };

beforeEach(() => { vi.useFakeTimers(); FakeAudio.all = []; (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio; (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage; });
afterEach(() => { vi.useRealTimers(); });

const make = () => { const e = new AudioEngine((r) => `url:${r}`); e.setLibrary(lib("music/a.mp3", "music/b.mp3", "music/c.mp3", "sounds/hit.wav")); return e; };
const music = () => FakeAudio.all[0];

describe("audio engine", () => {
  it("plays a track and queues the rest of its list", async () => {
    const e = make();
    await e.play("music/a.mp3", ["music/a.mp3", "music/b.mp3"]);
    await flush();
    expect(e.getState()).toMatchObject({ current: "music/a.mp3", playing: true, queue: ["music/a.mp3", "music/b.mp3"] });
    expect(music().src).toBe("url:music/a.mp3");
    music().fire("ended"); await flush();
    expect(e.getState().current).toBe("music/b.mp3");
  });
  it("loop modes: off ends, all wraps, one repeats", async () => {
    const e = make();
    e.setLoop("off");
    await e.play("music/b.mp3", ["music/a.mp3", "music/b.mp3"]); await flush();
    music().fire("ended"); await flush();
    expect(e.getState().playing).toBe(false);
    e.setLoop("all");
    await e.play("music/b.mp3", ["music/a.mp3", "music/b.mp3"]); await flush();
    music().fire("ended"); await flush();
    expect(e.getState().current).toBe("music/a.mp3");
    e.setLoop("one");
    music().fire("ended"); await flush();
    expect(e.getState().current).toBe("music/a.mp3");
  });
  it("a track that ends while stopping does not start the next one", async () => {
    const e = make();
    await e.play("music/a.mp3", ["music/a.mp3", "music/b.mp3"]); await flush();
    e.stop();
    music().fire("ended"); await flush();
    expect(e.getState()).toMatchObject({ current: null, playing: false, queue: [] });
    expect(music().paused).toBe(true);
  });
  it("scene music started right after stop wins over the old fade-out", async () => {
    const e = make();
    await e.play("music/a.mp3", ["music/a.mp3", "music/b.mp3"]); await flush();
    e.stop();
    await e.play("music/c.mp3", ["music/c.mp3"]); await flush();
    expect(e.getState()).toMatchObject({ current: "music/c.mp3", playing: true });
    expect(music().src).toBe("url:music/c.mp3");
  });
  it("switching tracks while playing fades out then plays the new one only", async () => {
    const e = make();
    await e.play("music/a.mp3"); await flush();
    void e.play("music/b.mp3"); void e.play("music/c.mp3"); await flush();
    expect(e.getState().current).toBe("music/c.mp3");
  });
  it("rejects bad references and plays sounds on top of music", async () => {
    const e = make();
    expect(await e.play("../etc/passwd")).toBe(false);
    expect(e.playSound("music/../x.wav")).toBe(false);
    await e.play("music/a.mp3"); await flush();
    expect(e.playSound("sounds/hit.wav")).toBe(true);
    expect(FakeAudio.all[1].src).toBe("url:sounds/hit.wav");
    expect(music().paused).toBe(false);
  });
  it("limits simultaneous sounds to eight", () => {
    const e = make();
    for (let i = 0; i < 12; i++) e.playSound("sounds/hit.wav");
    expect(FakeAudio.all.filter((a) => !a.paused).length).toBe(8);
  });
  it("a failing file reports the failure instead of throwing", async () => {
    const e = make();
    await e.play("music/a.mp3"); await flush();
    music().fire("error");
    expect(e.getState()).toMatchObject({ playing: false, failed: "music/a.mp3" });
  });
});
