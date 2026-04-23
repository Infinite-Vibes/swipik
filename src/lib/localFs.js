// ── Platform detection ──────────────────────────────────────────────────────
const IS_ELECTRON = () => !!window.electronAPI
const IS_ANDROID  = () => window.Capacitor?.getPlatform() === 'android'

// ── Shared helpers ──────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif','bmp','tiff','tif'])
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','m4v','3gp','wmv'])

export function isMedia(name) {
  const e = name.split('.').pop()?.toLowerCase()
  return !!(e && (IMAGE_EXTS.has(e) || VIDEO_EXTS.has(e)))
}

export function isVideo(name) {
  const e = name.split('.').pop()?.toLowerCase()
  return !!(e && VIDEO_EXTS.has(e))
}

export function isLocalSupported() {
  return IS_ELECTRON() || IS_ANDROID() || 'showDirectoryPicker' in window
}

// ── pickFolder ──────────────────────────────────────────────────────────────
export async function pickFolder() {
  if (IS_ELECTRON()) {
    const folderPath = await window.electronAPI.pickFolder()
    if (!folderPath) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' })
    return { _electronFolder: folderPath }
  }

  if (IS_ANDROID()) {
    const { pickFolderAndroid } = await import('./androidFs.js')
    return pickFolderAndroid()
  }

  if (!('showDirectoryPicker' in window)) {
    throw new Error('Local folder access requires Chrome or Edge.')
  }
  return showDirectoryPicker({ mode: 'readwrite' })
}

// ── listMediaFiles ──────────────────────────────────────────────────────────
export async function listMediaFiles(dirHandle) {
  if (dirHandle._electronFolder) {
    const files = await window.electronAPI.listFiles(dirHandle._electronFolder)
    return files.map(f => ({ ...f, handle: f }))  // self-referential handle
  }

  if (dirHandle._androidFolder) {
    const { listMediaFilesAndroid } = await import('./androidFs.js')
    return listMediaFilesAndroid(dirHandle)
  }

  // Browser File System Access API
  const files = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && isMedia(name)) {
      files.push({ name, handle, type: isVideo(name) ? 'video' : 'image' })
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

// ── getFileURL ──────────────────────────────────────────────────────────────
export async function getFileURL(fileHandle) {
  // Electron: fileHandle is { name, path, type }
  if (fileHandle.path && IS_ELECTRON()) {
    if (isVideo(fileHandle.name)) {
      return window.electronAPI.getVideoUrl(fileHandle.path)
    }
    return `media:///${fileHandle.path.replace(/\\/g, '/')}`
  }

  // Android: convert native path to Capacitor WebView URL
  if (fileHandle.path && IS_ANDROID()) {
    const { getAndroidFileURL } = await import('./androidFs.js')
    return getAndroidFileURL(fileHandle.path)
  }

  // Browser: FileSystemFileHandle
  const file = await fileHandle.getFile()
  if (file.name.toLowerCase().endsWith('.mov')) {
    return URL.createObjectURL(file.slice(0, file.size, 'video/mp4'))
  }
  return URL.createObjectURL(file)
}

// ── moveToSubfolder ─────────────────────────────────────────────────────────
export async function moveToSubfolder(dirHandle, fileName, fileHandle, subdir) {
  if (fileHandle.path && IS_ELECTRON()) {
    await window.electronAPI.moveFile(fileHandle.path, dirHandle._electronFolder, subdir, fileName)
    return
  }

  if (fileHandle.path && IS_ANDROID()) {
    const { moveToSubfolderAndroid } = await import('./androidFs.js')
    await moveToSubfolderAndroid(dirHandle, fileName, fileHandle, subdir)
    return
  }

  // Browser: File System Access API read → write → delete
  const subDirHandle = await dirHandle.getDirectoryHandle(subdir, { create: true })
  const file         = await fileHandle.getFile()
  const buffer       = await file.arrayBuffer()
  const destHandle   = await subDirHandle.getFileHandle(fileName, { create: true })
  const writable     = await destHandle.createWritable()
  await writable.write(buffer)
  await writable.close()
  await dirHandle.removeEntry(fileName)
}

// ── renameFile (for Rater) ──────────────────────────────────────────────────
export async function renameLocalFile(filePath, newName) {
  if (IS_ANDROID()) {
    const { renameFileAndroid } = await import('./androidFs.js')
    await renameFileAndroid(filePath, newName)
    return
  }
  // Electron handled directly in Rater.jsx via window.electronAPI
}
