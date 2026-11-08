export const Logo = ({ compact = false, light = false }: { compact?: boolean; light?: boolean }) => (
  <a href="#/" className={`logo${light ? ' is-light' : ''}`} aria-label="Traço — início">
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" className="logo-bg" />
      <path d="M8 23 L24 9" stroke="#00E7FF" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 23 H24" stroke="#00A4FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="8" cy="23" r="2.6" fill="#00A4FF" />
    </svg>
    {!compact && <span className="logo-word">Traço</span>}
  </a>
);
