const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Local filesystem
  pickFolder:        ()                                       => ipcRenderer.invoke('pick-folder'),
  listFiles:         (folderPath)                             => ipcRenderer.invoke('list-files', folderPath),
  getVideoUrl:       (filePath)                               => ipcRenderer.invoke('get-video-url', filePath),
  moveFile:          (srcPath, folderPath, subdir, fileName)  => ipcRenderer.invoke('move-file', srcPath, folderPath, subdir, fileName),
  renameFile:        (filePath, newName)                      => ipcRenderer.invoke('rename-file', filePath, newName),
  openFolder:        (folderPath)                             => ipcRenderer.invoke('open-folder', folderPath),
  openExternal:      (url)                                    => ipcRenderer.invoke('open-external', url),
  // Dropbox OAuth
  dropboxAuthStart:  (authUrl)                                => ipcRenderer.invoke('dropbox-auth-start', authUrl),
  onAuthCallback:    (cb)                                     => ipcRenderer.on('auth-callback', (_e, url) => cb(url)),
  // Platform info
  platform:          process.platform,
})
