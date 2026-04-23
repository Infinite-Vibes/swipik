import { useState, useEffect } from 'react'
import { pickFolder, listMediaFiles } from '../lib/localFs.js'
import { hasAppKey } from '../lib/dropbox.js'

const isAndroid = window.Capacitor?.getPlatform() === 'android'

const ANDROID_PATHS = [
  { label: 'Camera',          path: 'DCIM/Camera' },
  { label: 'Screenshots',     path: 'DCIM/Screenshots' },
  { label: 'Pictures',        path: 'Pictures' },
  { label: 'Downloads',       path: 'Download' },
  { label: 'WhatsApp Images', path: 'WhatsApp/Media/WhatsApp Images' },
]

export default function FolderPicker({ onFiles, onDropbox, onBack }) {
  const [status, setStatus]     = useState('idle')
  const [error, setError]       = useState('')
  const [showPaths, setShowPaths] = useState(false)

  const showDropbox = hasAppKey()

  async function pick(androidPath) {
    setStatus('loading')
    setShowPaths(false)
    try {
      const dirHandle = await pickFolder(androidPath)
      const files = await listMediaFiles(dirHandle)
      if (files.length === 0) {
        setError('No images or videos found in that folder.')
        setStatus('error')
        return
      }
      onFiles(files, dirHandle)
    } catch (e) {
      if (e.name === 'AbortError') setStatus('idle')
      else { setError(e.message); setStatus('error') }
    }
  }

  // On desktop, auto-open the system folder dialog immediately.
  // On Android there's no dialog — show the button screen so user can choose.
  useEffect(() => { if (!isAndroid) pick() }, []) // eslint-disable-line

  return (
    <div className="screen">
      <h1 className="logo">Swip<span>ik</span></h1>

      {status === 'loading' && (
        <>
          <div className="spinner" />
          <p className="picker-loading">Reading folder…</p>
        </>
      )}

      {status === 'error' && (
        <>
          <p className="error-msg">{error}</p>
          {isAndroid
            ? <button className="btn btn-secondary" onClick={() => { setStatus('idle'); setError('') }}
                style={{ width: '100%', maxWidth: 320 }}>← Choose folder</button>
            : <button className="btn btn-secondary" onClick={() => pick()}
                style={{ width: '100%', maxWidth: 320 }}>Try again</button>
          }
          <button className="btn btn-outline" onClick={onBack} style={{ width: '100%', maxWidth: 320 }}>← Back</button>
        </>
      )}

      {status === 'idle' && !showPaths && (
        <>
          <p className="mode-subtitle">Choose a source.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
            <button className="btn btn-primary"
              onClick={isAndroid ? () => setShowPaths(true) : () => pick()}>
              Pick local folder
            </button>
            {showDropbox && (
              <button className="btn btn-primary" onClick={onDropbox}>Browse Dropbox</button>
            )}
            <button className="btn btn-outline" onClick={onBack}>← Back</button>
          </div>
        </>
      )}

      {status === 'idle' && showPaths && (
        <>
          <p className="mode-subtitle">Choose a folder:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
            {ANDROID_PATHS.map(({ label, path }) => (
              <button key={path} className="btn btn-secondary" onClick={() => pick(path)}>
                {label}
              </button>
            ))}
            <button className="btn btn-outline" onClick={() => setShowPaths(false)}>← Back</button>
          </div>
        </>
      )}
    </div>
  )
}
