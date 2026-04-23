function OpenFolderBtn({ fileSource, localFolder, dropboxPath }) {
  if (fileSource === 'dropbox' && dropboxPath) {
    const url = `https://www.dropbox.com/home${dropboxPath}`
    return (
      <button className="btn btn-outline" style={{ width: '100%' }}
        onClick={() => window.electronAPI
          ? window.electronAPI.openExternal(url)
          : window.open(url, '_blank')
        }>
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

export default function Done({ stats, mode, fileSource, localFolder, dropboxPath, onRestart }) {
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
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onRestart}>
            Rate more files
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
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onRestart}>
          Sort more files
        </button>
      </div>
    </div>
  )
}
