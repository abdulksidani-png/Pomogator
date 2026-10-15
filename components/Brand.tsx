/** PomoGator's mark: a Pomodoro timer ring with a gator peeking out of the water inside it. */
export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--rule)" strokeWidth="4" />
      <path d="M20 4a16 16 0 0 1 15.2 20.9" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      <path d="M9.6 24.4V21c0-3.6 2.3-6.1 5.1-6.1 2.6 0 4.4 1.8 4.7 4.3l7.6.5c.5-1.3 2.7-1.4 3.2.3.9.4 1.3 1.6.9 2.7l-.4 1.7z" fill="#3E9A5E" />
      <path d="M19.6 22.4h10.6" stroke="#245E3A" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M21.2 22.4l.7 1.2.7-1.2M24.2 22.4l.7 1.2.7-1.2M27.2 22.4l.7 1.2.7-1.2" fill="#FFFFFF" />
      <circle cx="14.8" cy="18.9" r="2.5" fill="#F2D64B" />
      <ellipse cx="15.1" cy="18.9" rx=".85" ry="2.1" fill="#16241C" />
      <circle cx="29.3" cy="19.9" r=".6" fill="#16241C" />
      <path d="M8.4 25.6c1.9-1.7 3.9-1.7 5.8 0s3.9 1.7 5.8 0 3.9-1.7 5.8 0 3.9 1.7 5.8 0" fill="none" stroke="var(--fg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The name, with "Gator" in the accent color. */
export function BrandName() {
  return <span className="brand-name">Pomo<span className="brand-gator">Gator</span></span>;
}
