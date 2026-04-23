import { useState, useEffect, useRef, useCallback } from 'react'
import { getTempLink, ensureFolder, moveFile } from '../lib/dropbox.js'
import { getFileURL, moveToSubfolder } from '../lib/localFs.js'

const ACTIONS = {
  right: { label: 'Yes',       emoji: '👍', color: 'var(--good)', bg: 'rgba(34,197,94,0.55)',  subdir: 'yes',        skip: false },
  left:  { label: 'No',        emoji: '👎', color: 'var(--bad)',  bg: 'rgba(239,68,68,0.55)',  subdir: 'no',         skip: false },
  up:    { label: 'Favourite', emoji: '⭐', color: 'var(--fave)', bg: 'rgba(245,158,11,0.55)', subdir: 'favourites', skip: false },
  down:  { label: 'Skip',      emoji: '🦘', color: '#94a3b8',     bg: 'rgba(148,163,184,0.35)', subdir: null,         skip: true  },
}

const FLY_MS = 260

function getThreshold() {
  return Math.min(window.innerWidth, window.innerHeight) * 0.22
}

function getDragDir(x, y) {
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y < 0 ? 'up' : 'down')
}

const fileKey = f => f?.path || f?.name || ''

export default function Sorter({ files, mode, dirHandle, dropboxPath, onDone, onExit }) {
  const [queue, setQueue] = useState(() => [...files])
  const [sortedCount, setSortedCount] = useState(0)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const [flyDir, setFlyDir] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [videoError, setVideoError] = useState(false)

  const statsRef = useRef({ yes: 0, no: 0, favourites: 0 })
  const urlCache = useRef({})
  const loadingRef = useRef({})
  const ensuredFolders = useRef(new Set())
  const thresholdRef = useRef(getThreshold())
  const pointerStart = useRef(null)
  const actionRef = useRef(null)
  const queueRef = useRef(queue)
  queueRef.current = queue

  // Done detection
  useEffect(() => {
    if (queue.length === 0 && files.length > 0) {
      onDone({ ...statsRef.current })
    }
  }, [queue.length]) // eslint-disable-line

  // Cache threshold; update on resize
  useEffect(() => {
    const onResize = () => { thresholdRef.current = getThreshold() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Revoke blob URLs on unmount (browser mode only)
  useEffect(() => {
    return () => {
      Object.values(urlCache.current).forEach(url => {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      })
    }
  }, [])

  const [, tick] = useState(0)

  // Local mode: batch-load ALL file URLs upfront (createObjectURL is lazy, near-instant)
  useEffect(() => {
    if (mode !== 'local') return
    let count = 0
    files.forEach(async f => {
      const key = fileKey(f)
      if (urlCache.current[key] || loadingRef.current[key]) return
      loadingRef.current[key] = true
      try {
        const url = await getFileURL(f.handle)
        delete loadingRef.current[key]
        urlCache.current[key] = url
        if (f.type === 'image') new Image().src = url  // pre-decode
        count++
        if (count <= 3 || count % 20 === 0) tick(n => n + 1)
      } catch { delete loadingRef.current[key] }
    })
  }, []) // eslint-disable-line

  // Dropbox: preload 10 ahead, re-triggered on every swipe
  const preloadKey = mode === 'dropbox' ? fileKey(queue[0]) : ''
  useEffect(() => {
    if (mode !== 'dropbox') return
    queue.slice(0, 10).forEach(f => {
      const key = fileKey(f)
      if (urlCache.current[key] || loadingRef.current[key]) return
      loadingRef.current[key] = true
      fetchURL(f).then(url => {
        delete loadingRef.current[key]
        if (url) { urlCache.current[key] = url; tick(n => n + 1) }
      })
    })
  }, [preloadKey]) // eslint-disable-line

  async function fetchURL(file) {
    try {
      const url = mode === 'local' ? await getFileURL(file.handle) : await getTempLink(file.path)
      if (file.type === 'image' && url) new Image().src = url  // pre-decode
      return url
    } catch { return null }
  }

  // Reset video error when file changes
  useEffect(() => { setVideoError(false) }, [fileKey(queue[0])])

  const handleAction = useCallback(async (dir) => {
    if (processing || flyDir || queueRef.current.length === 0) return
    const file = queueRef.current[0]
    const action = ACTIONS[dir]

    setProcessing(true)
    setFlyDir(dir)

    setTimeout(async () => {
      setFlyDir(null)
      setDrag({ x: 0, y: 0, active: false })
      setProcessing(false)

      if (action.skip) {
        setQueue(q => [...q.slice(1), q[0]])
      } else {
        statsRef.current[action.subdir]++
        setSortedCount(c => c + 1)
        setQueue(q => q.slice(1))
        // File move happens in background so UI advances instantly
        try {
          if (mode === 'local') {
            await moveToSubfolder(dirHandle, file.name, file.handle, action.subdir)
          } else {
            const base = dropboxPath || ''
            const tf = base ? `${base}/${action.subdir}` : `/${action.subdir}`
            if (!ensuredFolders.current.has(tf)) {
              await ensureFolder(tf)
              ensuredFolders.current.add(tf)
            }
            await moveFile(file.path, `${tf}/${file.name}`)
          }
        } catch (e) {
          console.error('Move failed:', e)
        }
      }
    }, FLY_MS)
  }, [processing, flyDir, mode, dirHandle, dropboxPath])

  actionRef.current = handleAction

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onExit(); return }
      const map = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up', ArrowDown: 'down' }
      const dir = map[e.key]
      if (dir) { e.preventDefault(); actionRef.current(dir) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  // Pointer gestures
  const onPointerDown = (e) => {
    if (processing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerStart.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0, active: true })
  }
  const onPointerMove = (e) => {
    if (!pointerStart.current) return
    setDrag({ x: e.clientX - pointerStart.current.x, y: e.clientY - pointerStart.current.y, active: true })
  }
  const onPointerUp = () => {
    if (!pointerStart.current) return
    pointerStart.current = null
    const { x, y } = drag
    if (Math.abs(x) > thresholdRef.current || Math.abs(y) > thresholdRef.current) {
      handleAction(getDragDir(x, y))
    } else {
      setDrag({ x: 0, y: 0, active: false })
    }
  }

  const currentFile = queue[0]
  const currentURL = currentFile ? urlCache.current[fileKey(currentFile)] : null
  const rotation = drag.active ? drag.x * 0.07 : 0
  const dragDist = Math.sqrt(drag.x ** 2 + drag.y ** 2)
  const dragProgress = Math.min(dragDist / thresholdRef.current, 1)
  const activeDir = drag.active && dragDist > 12 ? getDragDir(drag.x, drag.y) : null
  const skippedCount = queue.length - (files.length - sortedCount)

  let cardStyle = {}
  if (flyDir) {
    // Short travel (50-60vw) + opacity fade — the card visibly sweeps AND fades
    // simultaneously, fully visible within the viewport before disappearing.
    const fly = {
      right: { transform: 'translate(58vw, -6vh) rotate(14deg)',  opacity: 0 },
      left:  { transform: 'translate(-58vw, -6vh) rotate(-14deg)', opacity: 0 },
      up:    { transform: 'translate(8vw, -52vh) rotate(6deg)',   opacity: 0 },
      down:  { transform: 'translate(0, 44vh)',                   opacity: 0 },
    }
    cardStyle = {
      ...fly[flyDir],
      transition: `transform ${FLY_MS}ms cubic-bezier(.4,0,.6,1), opacity ${FLY_MS}ms ease-in`,
      animation: 'none',  // kill any lingering cardIn fill that would block the transition
    }
  } else if (drag.active) {
    cardStyle = { transform: `translate(${drag.x}px,${drag.y}px) rotate(${rotation}deg)`, transition: 'none', opacity: 1 }
  } else {
    cardStyle = { transform: 'translate(0,0) rotate(0deg)', transition: 'transform 0.3s ease-out', opacity: 1 }
  }

  return (
    <div className="sorter">
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${(sortedCount / files.length) * 100}%` }} />
      </div>

      <button className="sorter-exit" onClick={onExit}>← Exit</button>

      <div className="progress-label">
        <span className="progress-sorted">{sortedCount}</span>
        <span className="progress-total">/ {files.length}</span>
        {skippedCount > 0 && <div className="progress-skipped">{skippedCount} skipped</div>}
      </div>

      {currentFile && (
        <div
          className="card-wrap"
          style={cardStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="card">
            {!currentURL
              ? <div className="card-loading"><div className="spinner" /></div>
              : currentFile.type === 'video'
                ? videoError
                  ? <div className="card-loading">
                      <span style={{fontSize:'2rem'}}>⚠️</span>
                      <span style={{fontSize:'0.75rem',textAlign:'center',maxWidth:220,lineHeight:1.6}}>
                        Can't preview this video.
                      </span>
                    </div>
                  : <video key={currentURL} src={currentURL} autoPlay muted loop playsInline controls onError={() => setVideoError(true)} />
                : <img key={currentURL} src={currentURL} alt={currentFile.name} draggable={false} />
            }
            <div className="card-filename">{currentFile.name}</div>
            {activeDir && (
              <div className="card-overlay" style={{
                background: ACTIONS[activeDir].bg,
                opacity: Math.pow(dragProgress, 0.5),
              }}>
                <span className="card-overlay-emoji">{ACTIONS[activeDir].emoji}</span>
                <span className="card-overlay-label" style={{ color: ACTIONS[activeDir].color }}>{ACTIONS[activeDir].label}</span>
              </div>
            )}
          </div>

          {/* Direction hints — inside card-wrap, overlaid on the image */}
          <div className="card-hints">
            {Object.entries(ACTIONS).map(([dir, a]) => (
              <div key={dir} className={`card-hint card-hint-${dir}${activeDir === dir ? ' active' : ''}`}>
                <span className="card-hint-emoji">{a.emoji}</span>
                {activeDir === dir && <span className="card-hint-label">{a.label}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
