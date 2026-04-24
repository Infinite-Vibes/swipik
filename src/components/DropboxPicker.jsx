import { useState, useEffect, useRef } from 'react'
import { isAuthed, startDropboxAuth, handleCallback, listFolder, logout } from '../lib/dropbox.js'
import { isMedia, isVideo } from '../lib/localFs.js'

const isAndroid = window.Capacitor?.getPlatform() === 'android'

export default function DropboxPicker({ onFiles, onBack, initialPath }) {
  const [authed, setAuthed] = useState(isAuthed)
  const [path, setPath]     = useState(initialPath || '')
  // Pre-build breadcrumb stack from initialPath so back-navigation works correctly
  const [stack, setStack]   = useState(() => {
    if (!initialPath) return ['']
    const parts = initialPath.replace(/^\//, '').split('/').filter(Boolean)
    return ['', ...parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'))]
  })
  const [folders, setFolders]   = useState([])
  const [mediaFiles, setMediaFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [connecting, setConnecting] = useState(false)
  const authStarted = useRef(false)

  // Browser OAuth callback: ?code= on mount
  useEffect(() => {
    if (!authed && window.location.search.includes('code=')) {
      handleCallback().then(ok => { if (ok) setAuthed(true) })
    }
  }, [])

  // Android: skip the "Connect Dropbox" tap — open auth immediately
  useEffect(() => {
    if (!authed && isAndroid && !authStarted.current) {
      authStarted.current = true
      handleConnect()
    }
  }, []) // eslint-disable-line

  // Load folder on auth — use initialPath if provided
  useEffect(() => {
    if (authed) loadFolder(initialPath || '')
  }, [authed]) // eslint-disable-line

  async function loadFolder(folderPath) {
    setLoading(true)
    setError('')
    try {
      const entries = await listFolder(folderPath)
      const folds = entries
        .filter(e => e['.tag'] === 'folder')
        .sort((a, b) => a.name.localeCompare(b.name))
      const media = entries.filter(e => e['.tag'] === 'file' && isMedia(e.name))
      setFolders(folds)
      setMediaFiles(media)
      setPath(folderPath)
    } catch (e) {
      if (e.code === 'AUTH_EXPIRED') { logout(); setAuthed(false) }
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    setError('')
    try {
      await startDropboxAuth()   // Electron: resolves after popup; browser: redirects
      setAuthed(true)
      loadFolder('')
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setConnecting(false)
    }
  }

  function navigateTo(folderPath) {
    setStack(s => [...s, folderPath])
    loadFolder(folderPath)
  }

  function navigateBack() {
    const prev = stack.slice(0, -1)
    setStack(prev)
    loadFolder(prev[prev.length - 1] ?? '')
  }

  function useThisFolder() {
    if (mediaFiles.length === 0) return
    const files = mediaFiles.map(e => {
      const f = { name: e.name, path: e.path_display, type: isVideo(e.name) ? 'video' : 'image' }
      return { ...f, handle: f }
    })
    onFiles(files, { _dropboxPath: path })
  }

  // ── Not authenticated ──
  if (!authed) {
    return (
      <div className="screen">
        <h1 className="logo">Swyp<span>ik</span></h1>
        <p className="mode-subtitle">Connect your Dropbox to browse and sort files in the cloud.</p>
        {error && <p className="error-msg">{error}</p>}
        <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}
          style={{ width: '100%', maxWidth: 320 }}>
          {connecting ? 'Connecting…' : 'Connect Dropbox'}
        </button>
        <button className="btn btn-outline" onClick={onBack} style={{ width: '100%', maxWidth: 320 }}>
          ← Back
        </button>
      </div>
    )
  }

  // ── Folder browser ──
  const displayPath = path || '/'

  return (
    <div className="screen" style={{ gap: 10 }}>
      {/* Header row */}
      <div className="dbx-header">
        <div className="dbx-breadcrumb">
          <button className="dbx-back" onClick={stack.length > 1 ? navigateBack : onBack}>
            ←
          </button>
          <span className="dbx-path">{displayPath}</span>
        </div>
        <button className="dbx-disconnect" onClick={() => { logout(); setAuthed(false) }}>
          Disconnect
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* Folder list */}
      <div className="dbx-list">
        {loading
          ? <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
          : folders.length === 0 && mediaFiles.length === 0
            ? <p className="picker-loading">Empty folder.</p>
            : <>
                {folders.map(f => (
                  <div key={f.id} className="dbx-row" onClick={() => navigateTo(f.path_display)}>
                    <span className="dbx-row-icon">📁</span>
                    <span className="dbx-row-name">{f.name}</span>
                    <span className="dbx-row-arrow">›</span>
                  </div>
                ))}
                {mediaFiles.length > 0 && (
                  <div className="dbx-media-count">
                    {mediaFiles.length} media file{mediaFiles.length !== 1 ? 's' : ''} in this folder
                  </div>
                )}
              </>
        }
      </div>

      {/* Actions */}
      {mediaFiles.length > 0 && !loading && (
        <button className="btn btn-primary" onClick={useThisFolder}
          style={{ width: '100%', maxWidth: 480 }}>
          Use this folder ({mediaFiles.length} files)
        </button>
      )}
    </div>
  )
}
