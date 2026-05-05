import { createRoot } from 'react-dom/client'
import '@fontsource/syne/400.css'
import '@fontsource/syne/600.css'
import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import './index.css'
import App from './App.jsx'
import { initTauriShim } from './lib/tauriShim.js'

// When running inside Tauri, install the window.electronAPI shim before React
// mounts so components can detect it synchronously via `!!window.electronAPI`.
await initTauriShim()

createRoot(document.getElementById('root')).render(<App />)
