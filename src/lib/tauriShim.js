/**
 * tauriShim.js — expose the same surface as the old Electron preload so the
 * rest of the app doesn't need to know we switched runtimes.
 *
 * Previously `window.electronAPI` came from electron/preload.cjs. Now it is
 * built on top of Tauri's invoke/listen APIs.
 */
export async function initTauriShim() {
  if (!window.__TAURI_INTERNALS__) return false

  const core = await import('@tauri-apps/api/core')
  const { invoke, convertFileSrc } = core

  // Run the remaining imports and the platform IPC concurrently so cold start
  // doesn't pay the round-trip in series after the imports.
  const [{ listen }, { open: openDialog }, opener, platform] = await Promise.all([
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-opener'),
    // Returns a Node-style platform string ("darwin"/"win32"/"linux") so
    // existing call sites comparing to `'darwin'` keep working unchanged.
    invoke('get_platform').catch(() => 'unknown'),
  ])

  window.electronAPI = {
    async pickFolder() {
      const picked = await openDialog({ directory: true, multiple: false })
      if (!picked) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' })
      return picked
    },

    listFiles: (folderPath) => invoke('list_files', { folderPath }),

    getVideoUrl: (filePath) => Promise.resolve(convertFileSrc(filePath)),

    moveFile: (srcPath, folderPath, subdir, fileName) =>
      invoke('move_file', { srcPath, folderPath, subdir, fileName }),

    renameFile: (filePath, newName) =>
      invoke('rename_file', { filePath, newName }),

    openFolder: (folderPath) => opener.revealItemInDir(folderPath).catch(() => opener.openPath(folderPath)),

    openExternal: (url) => opener.openUrl(url),

    // Returns Promise<unlisten>. Callers must invoke unlisten() when the auth
    // flow finishes — otherwise listeners pile up across retries and stale
    // promises resolve on the next callback.
    onAuthCallback: (cb) => listen('auth-callback', (evt) => cb(evt.payload)),

    platform,
  }

  return true
}
