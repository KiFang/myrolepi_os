import { contextBridge, ipcRenderer } from 'electron';

const api = {
  env: () => ipcRenderer.invoke('env:info'),
  plugins: () => ipcRenderer.invoke('plugins:list'),
  changelog: () => ipcRenderer.invoke('changelog:read'),
  scaffoldPlugin: (id: string, files: Record<string, string>) => ipcRenderer.invoke('plugins:scaffold', id, files),
  installExamples: () => ipcRenderer.invoke('plugins:installExamples'),
  openPluginsFolder: () => ipcRenderer.invoke('plugins:openFolder'),
  store: {
    list: (kind: string) => ipcRenderer.invoke('store:list', kind),
    read: (kind: string, id: string) => ipcRenderer.invoke('store:read', kind, id),
    remove: (kind: string, id: string) => ipcRenderer.invoke('store:remove', kind, id),
    write: (kind: string, id: string, data: unknown) => ipcRenderer.invoke('store:write', kind, id, data),
  },
};

contextBridge.exposeInMainWorld('rpi', api);
export type RpiApi = typeof api;
