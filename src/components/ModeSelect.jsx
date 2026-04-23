export default function ModeSelect({ onSelect }) {
  return (
    <div className="mode-screen">
      <h1 className="logo">Swip<span>ik</span></h1>
      <div className="mode-grid">
        <button className="mode-card" onClick={() => onSelect('sort')}>
          <span className="mode-card-icon">⇄</span>
          <span className="mode-card-label">Sort</span>
        </button>
        <button className="mode-card" onClick={() => onSelect('rate')}>
          <span className="mode-card-icon">★</span>
          <span className="mode-card-label">Rate</span>
        </button>
      </div>
    </div>
  )
}
