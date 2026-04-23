const isAndroid = window.Capacitor?.getPlatform() === 'android'

function openDropboxFolder(dropboxPath) {
  const url = `https://www.dropbox.com/home${dropboxPath}`
  if (window.electronAPI) {
    window.electronAPI.openExternal(url)
  } else if (isAndroid) {
    // '_system' triggers Android App Links — opens Dropbox app if installed
    window.open(url, '_system')
  } else {
    window.open(url, '_blank')
  }
}

function OpenFolderBtn({ fileSource, localFolder, dropboxPath }) {
  if (fileSource === 'dropbox' && dropboxPath) {
    return (
      <button className="btn btn-outline" style={{ width: '100%' }}
        onClick={() => openDropboxFolder(dropboxPath)}>
        Open in Dropbox
      </button>
    )
  }

  if (fileSource === 'local' && localFolder && window.electronAPI) {
    const label = window.electronAPI.platform === 'darwin' ? 'Open in Finder' : 'Open in Explorer'
    return (
      <button className="btn btn-outline" style={{ width: '100%' }}
        onClick={() => window.electronAPI.openFolder(localFolder)}>
        📂 {label}
      </button>
    )
  }

  return null
}

export default function Done({ stats, mode, fileSource, localFolder, dropboxPath, onContinue, onRestart }) {
  const folderBtn = <OpenFolderBtn fileSource={fileSource} localFolder={localFolder} dropboxPath={dropboxPath} />

  if (mode === 'rate') {
    return (
      <div className="done-screen">
        <div className="done-headline">{stats.rated}<br />rated</div>
        <div className="done-sub">
          {stats.rated} file{stats.rated !== 1 ? 's' : ''} prefixed with score
        </div>
        <div className="done-divider" />
        <div className="done-actions">
          {folderBtn}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onContinue}>
            Rate more files
          </button>
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={onRestart}>
            Change folder
          </button>
        </div>
      </div>
    )
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0)
  const statCards = [
    { key: 'favourites', label: 'Fave',  color: 'var(--fave)' },
    { key: 'yes',        label: 'Yes',   color: 'var(--good)' },
    { key: 'no',         label: 'No',    color: 'var(--bad)'  },
  ]

  return (
    <div className="done-screen">
      <div className="done-headline">{total}<br />sorted</div>
      <div className="done-sub">Moved into yes / no / favourites</div>
      <div className="done-divider" />

      <div className="done-stats">
        {statCards.map(c => (
          <div key={c.key} className="done-stat">
            <span className="done-stat-num" style={{ color: c.color }}>{stats[c.key] ?? 0}</span>
            <span className="done-stat-label">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="done-actions">
        {folderBtn}
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onContinue}>
          Sort more files
        </button>
        <button className="btn btn-outline" style={{ width: '100%' }} onClick={onRestart}>
          Change folder
        </button>
      </div>
    </div>
  )
}
