const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pkAPI', {
  loadCreds: () => ipcRenderer.invoke('creds:load'),
  saveCreds: (accounts) => ipcRenderer.invoke('creds:save', accounts),
  clearAccount: (i) => ipcRenderer.invoke('conta:limpar', i),
  setAwake: (on) => ipcRenderer.invoke('awake:set', on),
  webhook: (url, text) => ipcRenderer.invoke('webhook:send', url, text),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  saveBackup: (name, content) => ipcRenderer.invoke('backup:save', name, content),
  appVersion: (() => { try { return ipcRenderer.sendSync('app:version'); } catch { return '1.0.0'; } })()
});

