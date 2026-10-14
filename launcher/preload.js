const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld('asteia', {
  list: call('modules:list'),
  releases: call('releases:get'),
  install: call('module:install'),
  select: call('module:select'),
  uninstall: call('module:uninstall'),
  launch: call('module:launch'),
  openFolder: call('open:folder'),
  onProgress: (fn) => ipcRenderer.on('install:progress', (_e, p) => fn(p)),
});
