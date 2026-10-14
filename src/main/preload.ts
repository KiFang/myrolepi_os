import { contextBridge, ipcRenderer } from 'electron';

const api = {
  env: () => ipcRenderer.invoke('env:info'),
  plugins: () => ipcRenderer.invoke('plugins:list'),
  changelog: () => ipcRenderer.invoke('changelog:read'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  openRelease: (url: string) => ipcRenderer.invoke('updates:openRelease', url),
  openPluginsFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  store: {
    list: (kind: string) => ipcRenderer.invoke('store:list', kind),
    read: (kind: string, id: string) => ipcRenderer.invoke('store:read', kind, id),
    write: (kind: string, id: string, data: unknown) => ipcRenderer.invoke('store:write', kind, id, data),
  },
};

contextBridge.exposeInMainWorld('rpi', api);
export type RpiApi = typeof api;
