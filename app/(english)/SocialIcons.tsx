// Instagram and YouTube marks for the landing's social row (SHELL-031,
// docs/decisions/0167). lucide-react 1.x no longer ships brand icons, so these
// are drawn here: monochrome outlines in `currentColor`, lucide's 24px grid and
// 2px stroke, so they sit beside lucide icons and follow the text colour in
// both themes. No hex, no brand colours. Decorative: the link text names them.

const ICON_PROPS = {
  "aria-hidden": true,
  focusable: false,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="2" y="5" width="20" height="14" rx="4" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
    </svg>
  );
}
