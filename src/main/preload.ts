import { contextBridge, ipcRenderer } from 'electron';
import type { BackupManifest } from './lib/backups';

const api = {
  env: () => ipcRenderer.invoke('env:info'),
  plugins: () => ipcRenderer.invoke('plugins:list'),
  changelog: () => ipcRenderer.invoke('changelog:read'),
  scaffoldPlugin: (id: string, files: Record<string, string>) => ipcRenderer.invoke('plugins:scaffold', id, files),
  installExamples: () => ipcRenderer.invoke('plugins:installExamples'),
  /** адрес страницы панели плагина (открывается в изолированной рамке) */
  panelUrl: (pluginId: string, entry: string) => `rolepi-plugin://${pluginId}/${entry.split('/').map(encodeURIComponent).join('/')}`,
  openPluginsFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  store: {
    list: (kind: string) => ipcRenderer.invoke('store:list', kind),
    read: (kind: string, id: string) => ipcRenderer.invoke('store:read', kind, id),
    remove: (kind: string, id: string) => ipcRenderer.invoke('store:remove', kind, id),
    write: (kind: string, id: string, data: unknown) => ipcRenderer.invoke('store:write', kind, id, data),
  },
  /** Файлы проекта: картинки хранятся отдельно от JSON и адресуются содержимым. */
  assets: {
    put: (bytes: Uint8Array) => ipcRenderer.invoke('assets:put', bytes) as Promise<{ ok: true; id: string; size: number; existed: boolean } | { ok: false; code: string; message: string }>,
    read: (id: string) => ipcRenderer.invoke('assets:read', id) as Promise<Uint8Array | null>,
    list: () => ipcRenderer.invoke('assets:list') as Promise<{ id: string; size: number }[]>,
    gc: (extraRefs: string[]) => ipcRenderer.invoke('assets:gc', extraRefs) as Promise<{ deleted: number; bytes: number; kept: number }>,
    url: (id: string) => `rolepi-asset://${id}`,
  },
  /** Музыка и звуки из папок приложения (появляются сами, когда файлы кладут в папку). */
  audio: {
    list: () => ipcRenderer.invoke('audio:list') as Promise<import('../core/audio').AudioFile[]>,
    folders: () => ipcRenderer.invoke('audio:folders') as Promise<{ root: string; music: string; sounds: string }>,
    openFolder: (kind?: 'music' | 'sounds') => ipcRenderer.invoke('audio:openFolder', kind) as Promise<string>,
    url: (ref: string) => { const i = ref.indexOf('/'); return `rolepi-audio://${ref.slice(0, i)}/${ref.slice(i + 1).split('/').map(encodeURIComponent).join('/')}`; },
    onChange: (cb: () => void) => { const h = () => cb(); ipcRenderer.on('audio:changed', h); return () => { ipcRenderer.removeListener('audio:changed', h); }; },
  },
  /** Ключ автора для подписи защищённых систем. */
  keys: {
    author: () => ipcRenderer.invoke('keys:author') as Promise<{ publicKey: string; keyId: string; name?: string } | null>,
    ensure: (name?: string) => ipcRenderer.invoke('keys:ensure', name) as Promise<{ publicKey: string; keyId: string; name?: string }>,
    setName: (name: string) => ipcRenderer.invoke('keys:setName', name) as Promise<{ publicKey: string; keyId: string; name?: string } | null>,
    sign: (payload: string) => ipcRenderer.invoke('keys:sign', payload) as Promise<string>,
    verify: (publicKey: string, payload: string, signature: string) => ipcRenderer.invoke('keys:verify', publicKey, payload, signature) as Promise<boolean>,
    export: () => ipcRenderer.invoke('keys:export') as Promise<string | null>,
    import: (text: string) => ipcRenderer.invoke('keys:import', text) as Promise<{ publicKey: string; keyId: string; name?: string } | null>,
  },
  backups: {
    list: () => ipcRenderer.invoke('backups:list') as Promise<BackupManifest[]>,
    create: (reason?: 'manual' | 'before-migration' | 'before-import', note?: string) => ipcRenderer.invoke('backups:create', reason ?? 'manual', note) as Promise<BackupManifest>,
    auto: () => ipcRenderer.invoke('backups:auto') as Promise<BackupManifest | null>,
    restore: (id: string) => ipcRenderer.invoke('backups:restore', id) as Promise<{ restored: BackupManifest; safety: BackupManifest } | null>,
    delete: (id: string) => ipcRenderer.invoke('backups:delete', id) as Promise<boolean>,
    openFolder: () => ipcRenderer.invoke('backups:openFolder') as Promise<string>,
  },
};

contextBridge.exposeInMainWorld('rpi', api);
export type RpiApi = typeof api;
