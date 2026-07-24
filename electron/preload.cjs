const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nightwaveDesktop', {
  saveFile: (payload) => ipcRenderer.invoke('nightwave:save-file', payload),
  listExtensions: () => ipcRenderer.invoke('nightwave:list-extensions'),
  openEditor: (payload) => ipcRenderer.invoke('nightwave:open-editor', payload),
  openPackager: () => ipcRenderer.invoke('nightwave:open-packager'),
  pickPackagerDirectory: (payload) => ipcRenderer.invoke('nightwave:pick-packager-directory', payload),
  scanPackagerProjects: (rootDirectory) => ipcRenderer.invoke('nightwave:scan-packager-projects', rootDirectory),
  runPackager: (payload) => ipcRenderer.invoke('nightwave:run-packager', payload),
  onPackagerProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('nightwave:packager-progress', listener);
    return () => ipcRenderer.removeListener('nightwave:packager-progress', listener);
  },
  pickMusicDirectory: () => ipcRenderer.invoke('nightwave:pick-music-directory'),
  readMusicDirectory: (directoryPath) => ipcRenderer.invoke('nightwave:read-music-directory', directoryPath),
  readMusicFile: (filePath, options) => ipcRenderer.invoke('nightwave:read-music-file', filePath, options),
  decodeNcm: (filePath) => ipcRenderer.invoke('nightwave:decode-ncm', filePath),
  searchLyrics: (provider, query) => ipcRenderer.invoke('nightwave:search-lyrics', provider, query),
  resolveLyrics: (provider, result) => ipcRenderer.invoke('nightwave:resolve-lyrics', provider, result),
  getDataUpdateState: () => ipcRenderer.invoke('nightwave:get-data-update-state'),
  checkDataUpdate: () => ipcRenderer.invoke('nightwave:check-data-update'),
  installDataUpdate: (version) => ipcRenderer.invoke('nightwave:install-data-update', version),
  writeLyrics: (payload) => ipcRenderer.invoke('nightwave:write-lyrics', payload),
  loadUserState: () => ipcRenderer.invoke('nightwave:load-user-state'),
  saveUserState: (state) => ipcRenderer.invoke('nightwave:save-user-state', state),
});
