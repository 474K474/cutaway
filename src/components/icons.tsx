const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const ArrowLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
);

export const ArrowRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
);

export const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
);

export const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} strokeWidth={2} aria-hidden="true">
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  </svg>
);
