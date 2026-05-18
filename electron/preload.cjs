const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  saveFile: (data, filePath) => ipcRenderer.invoke('save-file', { data: Array.from(data), filePath }),
  downloadFile: (data, folder, filename) => ipcRenderer.invoke('download-file', { data: Array.from(data), folder, filename }),
  getAppRoot: () => ipcRenderer.invoke('get-app-root'),
  openFolder: (folderName) => ipcRenderer.invoke('open-folder', folderName),
  openPath: (targetPath) => ipcRenderer.invoke('open-path', targetPath),
  openContainingFolder: (targetPath) => ipcRenderer.invoke('open-containing-folder', targetPath),
  readFileDataUrl: (targetPath) => ipcRenderer.invoke('read-file-data-url', targetPath),
})
