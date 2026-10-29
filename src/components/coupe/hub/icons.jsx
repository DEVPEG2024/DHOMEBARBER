import React from 'react';

/** Icônes dessinées pour la maquette « Accueil de la Coupe » (traits de 1,8, coins arrondis). */
function Svg({ size = 22, strokeWidth = 1.8, className = '', children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function TrophyIcon(props) {
  return (
    <Svg {...props}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    </Svg>
  );
}

export function QrIcon(props) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3h-3" />
    </Svg>
  );
}

export function BotIcon(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 3v4M9 12h.01M15 12h.01M9 16h6" />
    </Svg>
  );
}

export function SharedPhoneIcon(props) {
  return (
    <Svg {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      <path d="M7 12h10" />
    </Svg>
  );
}
