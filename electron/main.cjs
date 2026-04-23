const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, session } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { spawn } = require('child_process')

// Register media:// as a privileged scheme — must happen before app ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'media',
  privileges: { secure: true, supportFetchAPI: true, stream: true },
}])

// ffmpeg binary — unpacked from asar in packaged builds
let ffmpegBin
try {
  ffmpegBin = require('ffmpeg-static')
  if (app.isPackaged) ffmpegBin = ffmpegBin.replace('app.asar', 'app.asar.unpacked')
} catch {}

// Transcode queue — max 2 concurrent ffmpeg jobs
const cache = new Map()
let active = 0
const MAX = 2
const pending = []

function runFfmpeg(filePath) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `swipik_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`)
    const proc = spawn(ffmpegBin, [
      '-i', filePath,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', '120', '-y', tmp,
    ])
    proc.on('close', code => code === 0 ? resolve(tmp) : reject(new Error(`ffmpeg exited ${code}`)))
    proc.on('error', reject)
  })
}

function drain() {
  while (active < MAX && pending.length > 0) {
    const { filePath, resolve, reject } = pending.shift()
    active++
    runFfmpeg(filePath)
      .then(tmp => { active--; drain(); resolve(tmp) })
      .catch(err => { active--; drain(); reject(err) })
  }
}

function transcodeToTemp(filePath) {
  if (cache.has(filePath)) return cache.get(filePath)
  const p = new Promise((resolve, reject) => { pending.push({ filePath, resolve, reject }); drain() })
  cache.set(filePath, p)
  return p
}

// ── IPC handlers ──

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif','bmp','tiff','tif'])
const VIDEO_EXTS = new Set(['mp4','mov','avi','mkv','webm','m4v','3gp','wmv'])
const isMediaFile = n => { const e = n.split('.').pop()?.toLowerCase(); return !!(e && (IMAGE_EXTS.has(e) || VIDEO_EXTS.has(e))) }
const isVidFile   = n => { const e = n.split('.').pop()?.toLowerCase(); return !!(e && VIDEO_EXTS.has(e)) }

ipcMain.handle('list-files', async (_e, folderPath) => {
  const names = fs.readdirSync(folderPath).filter(isMediaFile)
  return names
    .map(name => ({ name, path: path.join(folderPath, name), type: isVidFile(name) ? 'video' : 'image' }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

ipcMain.handle('get-video-url', async (_e, filePath) => {
  if (!ffmpegBin) return null
  const tmp = await transcodeToTemp(filePath)
  return `media:///${tmp.replace(/\\/g, '/')}`
})

ipcMain.handle('open-folder', async (_e, folderPath) => {
  await shell.openPath(folderPath)
})

ipcMain.handle('open-external', async (_e, url) => {
  await shell.openExternal(url)
})

// ── Dropbox OAuth popup ──
// Opens a BrowserWindow with the Dropbox auth URL and intercepts the redirect
// back to localhost to extract the auth code without navigating the main window.
ipcMain.handle('dropbox-auth-start', async (_e, authUrl) => {
  return new Promise((resolve, reject) => {
    const authWin = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Connect Dropbox',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const REDIRECT_PREFIX = 'http://localhost:5299'

    function tryCapture(url) {
      try {
        const parsed = new URL(url)
        const code = parsed.searchParams.get('code')
        if (code) {
          authWin.close()
          resolve(code)
          return true
        }
        const error = parsed.searchParams.get('error')
        if (error) {
          authWin.close()
          reject(Object.assign(new Error(`Dropbox auth error: ${error}`), { name: 'AbortError' }))
          return true
        }
      } catch {}
      return false
    }

    authWin.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(REDIRECT_PREFIX)) {
        event.preventDefault()
        tryCapture(url)
      }
    })

    authWin.webContents.on('will-redirect', (event, url) => {
      if (url.startsWith(REDIRECT_PREFIX)) {
        event.preventDefault()
        tryCapture(url)
      }
    })

    authWin.on('closed', () => {
      reject(Object.assign(new Error('Auth cancelled'), { name: 'AbortError' }))
    })

    authWin.loadURL(authUrl)
  })
})

ipcMain.handle('rename-file', async (_e, filePath, newName) => {
  const dir = path.dirname(filePath)
  await fs.promises.rename(filePath, path.join(dir, newName))
})

ipcMain.handle('move-file', async (_e, srcPath, folderPath, subdir, fileName) => {
  const destDir = path.join(folderPath, subdir)
  fs.mkdirSync(destDir, { recursive: true })
  await fs.promises.rename(srcPath, path.join(destDir, fileName))
})

// Clean up temp files on exit
app.on('before-quit', () => {
  cache.forEach(p => p.then(tmp => fs.unlink(tmp, () => {})).catch(() => {}))
})

// ── Window ──

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 400,
    minHeight: 500,
    title: 'Swipik',
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // Fix Dropbox refusing to auth inside an Electron UA string
  win.webContents.setUserAgent(
    win.webContents.getUserAgent().replace(/Electron\/[\d.]+\s?/g, '')
  )

  if (!app.isPackaged) {
    const tryLoad = (retries) => {
      win.loadURL('http://localhost:5299/swipik.html').catch(() => {
        if (retries > 0) setTimeout(() => tryLoad(retries - 1), 500)
      })
    }
    tryLoad(30)
  } else {
    win.loadFile(path.join(__dirname, '../dist/swipik.html'))
  }
}

app.whenReady().then(() => {
  // Serve local files via media:// protocol
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(request.url.slice('media:///'.length))
    return net.fetch(`file:///${filePath}`)
  })
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
