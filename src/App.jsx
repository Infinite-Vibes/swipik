import { useState, useEffect } from 'react'
import ModeSelect     from './components/ModeSelect.jsx'
import FolderPicker   from './components/FolderPicker.jsx'
import DropboxPicker  from './components/DropboxPicker.jsx'
import Sorter         from './components/Sorter.jsx'
import Rater          from './components/Rater.jsx'
import Done           from './components/Done.jsx'
import PermissionsSetup from './components/PermissionsSetup.jsx'
import { handleCallback, isAuthed } from './lib/dropbox.js'

const isAndroid = window.Capacitor?.getPlatform() === 'android'

// Android back button handling
const setupBackButton = (onBack) => {
  try {
    const { App } = window.Capacitor
    if (App) {
      App.addListener('backButton', () => {
        onBack?.()
      })
    }
  } catch {}
}

export default function App() {
  const [screen,    setScreen]    = useState('pick')       // start by picking location
  const [mode,      setMode]      = useState(null)         // 'sort' | 'rate'
  const [files,     setFiles]     = useState([])
  const [dirHandle, setDirHandle] = useState(null)
  const [stats,     setStats]     = useState({})
  const [setupComplete, setSetupComplete] = useState(() => {
    // Check localStorage for setup completion flag
    if (!isAndroid) return true // Desktop doesn't need setup
    return localStorage.getItem('swipik-setup-complete') === 'true'
  })

  // Browser-mode Dropbox OAuth callback: ?code= on page load
  useEffect(() => {
    if (window.location.search.includes('code=') && !isAuthed()) {
      handleCallback().then(ok => {
        if (ok) setScreen('dropbox-pick')
      })
    }
  }, [])

  // Android hardware back button handling
  useEffect(() => {
    const handleBackPress = () => {
      if (screen === 'sort' || screen === 'rate' || screen === 'done') {
        handleExit()
      } else if (screen === 'mode-select') {
        handleBackFromModeSelect()
      } else if (screen === 'dropbox-pick') {
        setScreen('pick')
      }
      // From 'pick': do nothing (stay on main screen)
    }
    setupBackButton(handleBackPress)
  }, [screen])

  function handleModeSelect(m) {
    setMode(m)
    setScreen(m)  // 'sort' | 'rate'
  }

  function handleDone(finalStats) {
    setStats(finalStats)
    setScreen('done')
  }

  function handleExit() {
    setScreen('mode-select')  // back from sort/rate to mode selection
  }

  function handleBackFromModeSelect() {
    // Back from mode selection returns to folder picker, keeping folder choice
    if (dirHandle?._dropboxPath !== undefined) {
      setScreen('dropbox-pick')
    } else {
      setScreen('pick')
    }
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

  function handleSetupComplete() {
    localStorage.setItem('swipik-setup-complete', 'true')
    setSetupComplete(true)
  }

  // Derive file source from dirHandle shape
  const fileSource    = dirHandle?._dropboxPath !== undefined ? 'dropbox' : 'local'
  const dropboxPath   = dirHandle?._dropboxPath ?? null
  const localFolder   = dirHandle?._electronFolder ?? null

  // Show permissions setup on first Android launch
  if (isAndroid && !setupComplete) {
    return <PermissionsSetup onComplete={handleSetupComplete} />
  }

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
      onBack={handleBackFromModeSelect}
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
