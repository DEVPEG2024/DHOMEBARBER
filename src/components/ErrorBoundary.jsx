import React from 'react';
import { isReloadPending, isStaleChunkError, reloadOnceForStaleChunk } from '@/lib/chunkReload';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, reloading: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Fichier de page périmé après un déploiement : rechargement unique, écran neutre en attendant.
    // Rechargement déjà lancé par `vite:preloadError` (l'import a résolu `undefined`, React.lazy
    // lève alors une TypeError) : même écran neutre. Hors ligne ou rechargement déjà tenté
    // depuis moins de 15 s : l'écran d'erreur reste, avec son bouton
    if (isReloadPending() || (isStaleChunkError(error) && reloadOnceForStaleChunk())) {
      this.setState({ reloading: true });
    }
  }

  render() {
    if (this.state.reloading) {
      return <div className="fixed inset-0 bg-background" aria-busy="true" />;
    }

    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background px-5">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="font-display text-xl font-bold text-foreground mb-2">Une erreur est survenue</h1>
            <p className="text-sm text-muted-foreground mb-6">
              L'application a rencontré un problème inattendu.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
