/**
 * androidFs.js — Filesystem and media helpers for the Capacitor/Android build.
 *
 * On Android, `window.electronAPI` is undefined and `showDirectoryPicker` is
 * unavailable.  This module wraps the Capacitor Filesystem plugin instead and
 * is imported only when `window.Capacitor?.getPlatform() === 'android'`.
 *
 * Media URLs use Capacitor's `convertFileSrc()` helper to turn native file
 * paths into web-safe URLs the WebView can load.
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif','bmp'])
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','m4v','3gp'])

export const isMedia  = n => { const e = ext(n); return IMAGE_EXTS.has(e) || VIDEO_EXTS.has(e) }
export const isVideo  = n => VIDEO_EXTS.has(ext(n))
const ext = n => n.split('.').pop()?.toLowerCase() ?? ''

/**
 * On Android there's no directory picker API in the WebView.
 * Instead we read well-known paths.  For the first version we default to
 * the DCIM/Camera folder; a future version can use SAF via a native plugin.
 */
export async function pickFolderAndroid() {
  // Default to DCIM/Camera — the most common media location.
  // You can add more paths (Downloads, Pictures, etc.) here later.
  const path = 'DCIM/Camera'
  return { _androidFolder: path, _androidDirectory: Directory.ExternalStorage }
}

export async function listMediaFilesAndroid(dirHandle) {
  const { _androidFolder: folder, _androidDirectory: directory } = dirHandle
  const result = await Filesystem.readdir({ path: folder, directory })
  const files = result.files
    .filter(f => f.type === 'file' && isMedia(f.name))
    .map(f => {
      const nativePath = `${folder}/${f.name}`
      return {
        name:   f.name,
        path:   nativePath,
        type:   isVideo(f.name) ? 'video' : 'image',
        handle: { name: f.name, path: nativePath, type: isVideo(f.name) ? 'video' : 'image' },
      }
    })
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Convert a native Android path to a URL the Capacitor WebView can load.
 * Capacitor's convertFileSrc adds the special `_capacitor_file_://` scheme.
 */
export function getAndroidFileURL(filePath) {
  return Capacitor.convertFileSrc(
    filePath.startsWith('file://') ? filePath : `file:///storage/emulated/0/${filePath}`
  )
}

/**
 * Move a file to a subfolder (sort action).
 * Uses Filesystem.copy + Filesystem.deleteFile since Capacitor has no move.
 */
export async function moveToSubfolderAndroid(dirHandle, fileName, fileHandle, subdir) {
  const { _androidDirectory: directory } = dirHandle
  const srcPath  = fileHandle.path
  const destPath = `${srcPath.split('/').slice(0, -1).join('/')}/${subdir}/${fileName}`

  // Ensure destination dir exists
  try {
    await Filesystem.mkdir({
      path:      `${fileHandle.path.split('/').slice(0, -1).join('/')}/${subdir}`,
      directory,
      recursive: true,
    })
  } catch { /* already exists */ }

  await Filesystem.copy({ from: srcPath, to: destPath, toDirectory: directory, directory })
  await Filesystem.deleteFile({ path: srcPath, directory })
}

/**
 * Rename a file (rate action — adds N_ prefix).
 */
export async function renameFileAndroid(filePath, newName, directory = Directory.ExternalStorage) {
  const dir     = filePath.split('/').slice(0, -1).join('/')
  const destPath = `${dir}/${newName}`
  await Filesystem.rename({ from: filePath, to: destPath, directory })
}
