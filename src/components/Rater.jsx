import { useState, useEffect, useRef, useCallback } from 'react'
import { getFileURL, renameLocalFile } from '../lib/localFs.js'
import { getTempLink, renameFile as dropboxRename } from '../lib/dropbox.js'

const COLORS = ['#FF3B4A', '#FF7A00', '#FFB800', '#84cc16', '#3DDC7A']
const FLASH_MS = 160

const fileKey = f => f?.path || f?.name || ''

function addRatingPrefix(name, rating) {
  return `${rating}_${name.replace(/^[1-5]_/, '')}`
}

export default function Rater({ files, fileSource = 'local', onDone, onExit }) {
  const [queue, setQueue] = useState(() => [...files])
  const [ratedCount, setRatedCount] = useState(0)
  const [flashing, setFlashing] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [videoError, setVideoError] = useState(false)

  const urlCache = useRef({})
  const loadingRef = useRef({})
  const actionRef = useRef(null)
  const queueRef = useRef(queue)
  queueRef.current = queue

  const [, tick] = useState(0)

  useEffect(() => {
    if (queue.length === 0 && files.length > 0) onDone({ rated: ratedCount })
  }, [queue.length]) // eslint-disable-line

  // Revoke blob URLs on unmount (browser mode only)
  useEffect(() => {
    return () => {
      Object.values(urlCache.current).forEach(url => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  async function fetchURL(f) {
    try {
      const url = fileSource === 'dropbox' ? await getTempLink(f.handle.path) : await getFileURL(f.handle)
      if (f.type === 'image' && url) new Image().src = url
      return url
    } catch { return null }
  }

  // Local: load all upfront (createObjectURL is instant). Dropbox: sliding 10-ahead window.
  const preloadKey = fileSource === 'dropbox' ? fileKey(queue[0]) : ''
  useEffect(() => {
    const toLoad = fileSource === 'dropbox' ? queue.slice(0, 10) : files
    toLoad.forEach(async f => {
      const key = fileKey(f)
      if (urlCache.current[key] || loadingRef.current[key]) return
      loadingRef.current[key] = true
      const url = await fetchURL(f)
      delete loadingRef.current[key]
      if (url) { urlCache.current[key] = url; tick(n => n + 1) }
    })
  }, [fileSource === 'local' ? null : preloadKey]) // eslint-disable-line

  useEffect(() => { setVideoError(false) }, [fileKey(queue[0])])

  const handleRate = useCallback(async (rating) => {
    if (processing || flashing !== null || queueRef.current.length === 0) return
    const file = queueRef.current[0]

    setProcessing(true)
    setFlashing(rating)

    setTimeout(async () => {
      setFlashing(null)
      setProcessing(false)
      setRatedCount(c => c + 1)
      setQueue(q => q.slice(1))
      try {
        const newName = addRatingPrefix(file.name, rating)
        if (fileSource === 'dropbox') {
          await dropboxRename(file.handle.path, newName)
        } else if (window.electronAPI) {
          await window.electronAPI.renameFile(file.handle.path, newName)
        } else {
          await renameLocalFile(file.handle.path, newName)  // Android / future
        }
      } catch (e) {
        console.error('Rename failed:', e)
      }
    }, FLASH_MS)
  }, [processing, flashing])

  const handleSkip = useCallback(() => {
    if (processing || flashing !== null || queueRef.current.length === 0) return
    setQueue(q => [...q.slice(1), q[0]])
  }, [processing, flashing])

  actionRef.current = { rate: handleRate, skip: handleSkip }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onExit(); return }
      const n = parseInt(e.key)
      if (n >= 1 && n <= 5) { e.preventDefault(); actionRef.current.rate(n); return }
      if (e.key === ' ' || e.key === 's') { e.preventDefault(); actionRef.current.skip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const currentFile = queue[0]
  const currentURL = currentFile ? urlCache.current[fileKey(currentFile)] : null
  const skippedCount = queue.length - (files.length - ratedCount)

  return (
    <div className="sorter">
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${(ratedCount / files.length) * 100}%` }} />
      </div>

      <button className="sorter-exit" onClick={onExit}>← Exit</button>

      <div className="progress-label">
        <span className="progress-sorted">{ratedCount}</span>
        <span className="progress-total">/ {files.length}</span>
        {skippedCount > 0 && <div className="progress-skipped">{skippedCount} skipped</div>}
      </div>

      {currentFile && (
        <div className="card-wrap" style={{ cursor: 'default' }}>
          <div className="card">
            {!currentURL
              ? <div className="card-loading"><div className="spinner" /></div>
              : currentFile.type === 'video'
                ? videoError
                  ? <div className="card-loading">
                      <span style={{ fontSize: '2rem' }}>⚠️</span>
                      <span style={{ fontSize: '0.75rem', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                        Can't preview this video.
                      </span>
                    </div>
                  : <video key={currentURL} src={currentURL} autoPlay muted loop playsInline controls onError={() => setVideoError(true)} />
                : <img key={currentURL} src={currentURL} alt={currentFile.name} draggable={false} />
            }
            <div className="card-filename">{currentFile.name}</div>
            {flashing !== null && (
              <div className="card-overlay" style={{ background: `${COLORS[flashing - 1]}40` }}>
                <span style={{
                  fontSize: 'clamp(5rem, 14vw, 10rem)',
                  fontWeight: 800,
                  color: COLORS[flashing - 1],
                  letterSpacing: '-0.04em',
                  textShadow: '0 4px 24px rgba(0,0,0,0.6)',
                  lineHeight: 1,
                }}>
                  {flashing}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rater-controls">
        <div className="rater-bar">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              className={`rater-btn${flashing === n ? ' active' : ''}`}
              style={{ '--rater-color': COLORS[n - 1] }}
              onClick={() => handleRate(n)}
            >
              <span>{n}</span>
            </button>
          ))}
          <button className="rater-skip" onClick={handleSkip}>Skip</button>
        </div>

        <div className="kbd-hint">
          <span className="kbd">1</span> – <span className="kbd">5</span>&nbsp; rate &nbsp;·&nbsp;
          <span className="kbd">Space</span>&nbsp; skip &nbsp;·&nbsp;
          <span className="kbd">Esc</span>&nbsp; exit
        </div>
      </div>
    </div>
  )
}
