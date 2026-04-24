import { useEffect, useState } from 'react'
import { Filesystem } from '@capacitor/filesystem'
import { App as CapApp } from '@capacitor/app'

export default function PermissionsSetup({ onComplete }) {
  const [permissionStatus, setPermissionStatus] = useState('checking')
  const [hasStoragePermission, setHasStoragePermission] = useState(false)

  useEffect(() => {
    checkPermissions()
  }, [])

  async function checkPermissions() {
    try {
      const status = await Filesystem.checkPermissions()
      const granted = status.publicStorage === 'granted'
      setHasStoragePermission(granted)
      setPermissionStatus('ready')
      if (granted) {
        // Auto-proceed if already granted
        setTimeout(() => onComplete(), 500)
      }
    } catch (e) {
      setPermissionStatus('ready')
    }
  }

  async function requestPermissions() {
    try {
      const result = await Filesystem.requestPermissions()
      if (result.publicStorage === 'granted') {
        setHasStoragePermission(true)
        setTimeout(() => onComplete(), 500)
      }
    } catch {}
  }

  async function openSettings() {
    try {
      await CapApp.openUrl({ url: 'package://com.android.settings/com.swipik.app' })
    } catch {
      // Fallback: try to open app settings directly
      try {
        await CapApp.openUrl({ url: 'android.settings.APPLICATION_DETAILS_SETTINGS' })
      } catch {}
    }
  }

  return (
    <div className="screen" style={{ gap: 16 }}>
      <h1 className="logo">Swyp<span>ik</span></h1>

      <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <p style={{ fontSize: '3rem', marginBottom: 16 }}>📁</p>
        <p className="mode-subtitle">Files & Media Access</p>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5 }}>
          Swypik needs permission to access your photos and videos.
        </p>

        {hasStoragePermission ? (
          <p style={{ color: '#34d399', fontSize: '0.9rem', marginTop: 8 }}>✓ Permission granted</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={requestPermissions} style={{ width: '100%' }}>
              Grant Permission
            </button>
            <button className="btn btn-secondary" onClick={openSettings} style={{ width: '100%', fontSize: '0.85rem' }}>
              Settings → Apps → Swypik → Permissions
            </button>
          </div>
        )}

        <button
          className="btn btn-outline"
          onClick={onComplete}
          style={{ width: '100%', marginTop: 'auto' }}>
          {hasStoragePermission ? 'Get started' : 'Skip for now'}
        </button>
      </div>
    </div>
  )
}
