export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="var(--primary)" />
        <g fill="var(--primary-foreground)">
          <rect x="5" y="6.5" width="14" height="2.5" rx="1.25" />
          <rect
            x="5"
            y="10.75"
            width="14"
            height="2.5"
            rx="1.25"
            opacity="0.75"
          />
          <rect x="5" y="15" width="14" height="2.5" rx="1.25" opacity="0.5" />
        </g>
      </svg>
      <span className="text-sm font-medium tracking-tight text-foreground">
        Ticket System
      </span>
    </span>
  );
}
