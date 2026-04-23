import { useState, useEffect } from 'react'
import ModeSelect     from './components/ModeSelect.jsx'
import FolderPicker   from './components/FolderPicker.jsx'
import DropboxPicker  from './components/DropboxPicker.jsx'
import Sorter         from './components/Sorter.jsx'
import Rater          from './components/Rater.jsx'
import Done           from './components/Done.jsx'
import { handleCallback, isAuthed } from './lib/dropbox.js'

export default function App() {
  const [screen,    setScreen]    = useState('pick')       // start by picking location
  const [mode,      setMode]      = useState(null)         // 'sort' | 'rate'
  const [files,     setFiles]     = useState([])
  const [dirHandle, setDirHandle] = useState(null)
  const [stats,     setStats]     = useState({})

  // Browser-mode Dropbox OAuth callback: ?code= on page load
  useEffect(() => {
    if (window.location.search.includes('code=') && !isAuthed()) {
      handleCallback().then(ok => {
        if (ok) setScreen('dropbox-pick')
      })
    }
  }, [])

  function handleModeSelect(m) {
    setMode(m)
    setScreen(m)  // 'sort' | 'rate'
  }

  function handleDone(finalStats) {
    setStats(finalStats)
    setScreen('done')
  }

  function handleExit() {
    setScreen('pick')
    setFiles([])
    setDirHandle(null)
  }

  // "Sort/Rate more files" — go back to the same folder, keeping mode
  function handleContinue() {
    setFiles([])
    setStats({})
    if (dirHandle?._dropboxPath !== undefined) {
      setScreen('dropbox-pick')   // DropboxPicker reopens at same dropboxPath
    } else {
      setScreen('pick')           // Local: re-pick folder
    }
    // mode stays set — handleFiles will skip mode-select and go directly to sort/rate
  }

  function handleFiles(loadedFiles, handle) {
    setFiles(loadedFiles)
    setDirHandle(handle)
    // If mode already set (continuing), skip mode-select
    setScreen(mode || 'mode-select')
  }

  function handleRestart() {
    setScreen('pick')
    setMode(null)
    setFiles([])
    setDirHandle(null)
    setStats({})
  }

  // Derive file source from dirHandle shape
  const fileSource    = dirHandle?._dropboxPath !== undefined ? 'dropbox' : 'local'
  const dropboxPath   = dirHandle?._dropboxPath ?? null
  const localFolder   = dirHandle?._electronFolder ?? null

  if (screen === 'pick')        return (
    <FolderPicker
      onFiles={handleFiles}
      onDropbox={() => setScreen('dropbox-pick')}
    />
  )

  if (screen === 'dropbox-pick') return (
    <DropboxPicker
      initialPath={dropboxPath}
      onFiles={handleFiles}
      onBack={() => setScreen('pick')}
    />
  )

  if (screen === 'mode-select') return (
    <ModeSelect
      onSelect={handleModeSelect}
      onBack={handleExit}
    />
  )

  if (screen === 'sort') return (
    <Sorter
      files={files}
      mode={fileSource}
      dirHandle={dirHandle}
      dropboxPath={dropboxPath}
      onDone={handleDone}
      onExit={handleExit}
    />
  )

  if (screen === 'rate') return (
    <Rater
      files={files}
      fileSource={fileSource}
      onDone={handleDone}
      onExit={handleExit}
    />
  )

  if (screen === 'done') return (
    <Done
      stats={stats}
      mode={mode}
      fileSource={fileSource}
      localFolder={localFolder}
      dropboxPath={dropboxPath}
      onContinue={handleContinue}
      onRestart={handleRestart}
    />
  )
}
