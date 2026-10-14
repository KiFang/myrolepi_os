import { BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import { dataDir } from './paths';
import { audioRoot, ensureAudioDirs, kindDir, listAudio } from './lib/audioLib';
import { AUDIO_KINDS } from '../core/audio';
import type { AudioKind } from '../core/audio';

const README: Record<AudioKind, string> = {
  music: 'Rolepi: сюда кладите музыку (mp3, ogg, wav, flac, m4a, opus). Подпапки работают как плейлисты. Файлы появятся в приложении сами.\nDrop your music files here (mp3, ogg, wav, flac, m4a, opus). Subfolders work as playlists. Files appear in the app by themselves.\n',
  sounds: 'Rolepi: сюда кладите короткие звуки и эффекты. Они появятся на «звуковой панели».\nDrop short sounds and effects here. They appear on the soundboard.\n',
};

/** Папки музыки и звуков + слежение за ними: файлы, добавленные в папку, появляются в приложении без перезапуска. */
export function registerAudioHandlers() {
  ensureAudioDirs(dataDir, README);
  ipcMain.handle('audio:list', () => listAudio(dataDir));
  ipcMain.handle('audio:folders', () => ({ root: audioRoot(dataDir), music: kindDir(dataDir, 'music'), sounds: kindDir(dataDir, 'sounds') }));
  ipcMain.handle('audio:openFolder', (_e, kind: string) => shell.openPath((AUDIO_KINDS as readonly string[]).includes(kind) ? kindDir(dataDir, kind as AudioKind) : audioRoot(dataDir)));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => { clearTimeout(timer); timer = setTimeout(() => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('audio:changed'); }, 400); };
  for (const kind of AUDIO_KINDS) {
    try { fs.watch(kindDir(dataDir, kind), { recursive: true }, changed); }
    catch { try { fs.watch(kindDir(dataDir, kind), changed); } catch { /* без слежения работает кнопка «Обновить» и обновление при возврате в окно */ } }
  }
}
