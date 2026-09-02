import React from 'react';
import { isNative, openExternalUrl } from '@/lib/capacitor';

const LEGAL_BASE = 'https://dhomebarber.fr';

/**
 * Lien vers une page légale (/cgu.html, /privacy.html).
 * Web : nouvel onglet. App native : target=_blank ne fait rien dans le WebView,
 * on ouvre la page de dhomebarber.fr dans le navigateur in-app (plugin Browser).
 */
export default function LegalLink({ path, className, children }) {
  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        if (isNative) {
          e.preventDefault();
          openExternalUrl(`${LEGAL_BASE}${path}`);
        }
      }}
    >
      {children}
    </a>
  );
}
