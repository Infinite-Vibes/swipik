import { useState, useEffect } from 'react'
import { pickFolder, listMediaFiles } from '../lib/localFs.js'
import { hasAppKey } from '../lib/dropbox.js'

export default function FolderPicker({ onFiles, onDropbox, onBack }) {
  const [status, setStatus] = useState('idle')
  const [error, setError]   = useState('')

  const showDropbox = hasAppKey()

  async function pick() {
    setStatus('loading')
    try {
      const dirHandle = await pickFolder()
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

  useEffect(() => { pick() }, []) // eslint-disable-line

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
          <button className="btn btn-secondary" onClick={pick} style={{ width: '100%', maxWidth: 320 }}>Try again</button>
          <button className="btn btn-outline"   onClick={onBack} style={{ width: '100%', maxWidth: 320 }}>← Back</button>
        </>
      )}

      {status === 'idle' && (
        <>
          <p className="mode-subtitle">Choose a source.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 320 }}>
            <button className="btn btn-primary"    onClick={pick}>Pick local folder</button>
            {showDropbox && (
              <button className="btn btn-secondary" onClick={onDropbox}>Browse Dropbox</button>
            )}
            <button className="btn btn-outline"    onClick={onBack}>← Back</button>
          </div>
        </>
      )}
    </div>
  )
}
