import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compareAudio, describeAudio, isAudioFile, nextTrack, parseAudioRef, prevTrack, safeAudioPath } from "../src/core";
import { ensureAudioDirs, listAudio, parseRange, resolveAudio } from "../src/main/lib/audioLib";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rolepi-au-"));
const readme = { music: "m", sounds: "s" };

describe("audio refs", () => {
  it("recognises audio files", () => {
    expect(isAudioFile("a.MP3")).toBe(true);
    expect(isAudioFile("a.exe")).toBe(false);
    expect(isAudioFile("noext")).toBe(false);
  });
  it("accepts only safe paths", () => {
    for (const ok of ["a.mp3", "боевая/битва 2.ogg", "x/y/z.wav"]) expect(safeAudioPath(ok), ok).toBe(true);
    for (const bad of ["", "../a.mp3", "a/../b.mp3", "/a.mp3", "a\\b.mp3", ".hidden.mp3", "a//b.mp3", "a.txt", "a/.x/b.mp3", "a\0.mp3"]) expect(safeAudioPath(bad), JSON.stringify(bad)).toBe(false);
  });
  it("parses refs", () => {
    expect(parseAudioRef("music/a/b.mp3")).toEqual({ kind: "music", path: "a/b.mp3" });
    expect(parseAudioRef("sounds/hit.wav")).toEqual({ kind: "sounds", path: "hit.wav" });
    for (const bad of ["other/a.mp3", "music", "music/../a.mp3", 5, null]) expect(parseAudioRef(bad)).toBeNull();
  });
  it("describes and sorts naturally", () => {
    const a = describeAudio("music", "Бой/10 финал.mp3", 5), b = describeAudio("music", "Бой/2 старт.mp3", 5), c = describeAudio("music", "Город.mp3", 5);
    expect(a).toMatchObject({ title: "10 финал", folder: "Бой", ref: "music/Бой/10 финал.mp3" });
    expect(c.folder).toBe("");
    expect([a, c, b].sort(compareAudio).map((x) => x.title)).toEqual(["Город", "2 старт", "10 финал"]);
  });
});

describe("queue", () => {
  it("steps and wraps", () => {
    expect(nextTrack(0, 3, "off", false)).toBe(1);
    expect(nextTrack(2, 3, "off", false)).toBeNull();
    expect(nextTrack(2, 3, "all", false)).toBe(0);
    expect(nextTrack(1, 3, "one", false)).toBe(1);
    expect(nextTrack(0, 0, "all", false)).toBeNull();
    expect(prevTrack(0, 3)).toBe(2);
    expect(prevTrack(2, 3)).toBe(1);
  });
  it("shuffle never repeats the current track", () => {
    for (let i = 0; i < 50; i++) expect(nextTrack(1, 4, "all", true)).not.toBe(1);
    expect(nextTrack(0, 1, "off", true)).toBeNull();
    expect(nextTrack(0, 1, "all", true)).toBe(0);
  });
});

describe("audio library", () => {
  it("lists audio from both folders, skipping junk", () => {
    const d = tmp(); ensureAudioDirs(d, readme);
    fs.mkdirSync(path.join(d, "audio/music/Бой"), { recursive: true });
    fs.writeFileSync(path.join(d, "audio/music/Бой/a.mp3"), "x");
    fs.writeFileSync(path.join(d, "audio/music/b.ogg"), "yy");
    fs.writeFileSync(path.join(d, "audio/music/notes.txt"), "no");
    fs.writeFileSync(path.join(d, "audio/music/.hidden.mp3"), "no");
    fs.writeFileSync(path.join(d, "audio/sounds/hit.wav"), "z");
    const list = listAudio(d);
    expect(list.map((x) => x.ref).sort()).toEqual(["music/b.ogg", "music/Бой/a.mp3", "sounds/hit.wav"].sort());
    expect(list.find((x) => x.ref === "music/b.ogg")!.size).toBe(2);
  });
  it("is empty (not an error) when folders are missing", () => { expect(listAudio(path.join(tmp(), "nowhere"))).toEqual([]); });
  it("resolves only files inside the folder", () => {
    const d = tmp(); ensureAudioDirs(d, readme);
    fs.writeFileSync(path.join(d, "audio/music/a.mp3"), "x");
    fs.writeFileSync(path.join(d, "secret.mp3"), "s");
    expect(resolveAudio(d, "music", "a.mp3")).toBeTruthy();
    expect(resolveAudio(d, "music", "missing.mp3")).toBeNull();
    expect(resolveAudio(d, "music", "../../secret.mp3")).toBeNull();
    expect(resolveAudio(d, "evil", "a.mp3")).toBeNull();
    try { fs.symlinkSync(d, path.join(d, "audio/music/link")); } catch { return; }
    expect(resolveAudio(d, "music", "link/secret.mp3")).toBeNull();
  });
});

describe("range header", () => {
  it("parses ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=9-3", 100)).toBe("invalid");
    expect(parseRange("bytes=0-1", 0)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
  });
});
