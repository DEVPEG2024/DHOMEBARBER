import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import Panel from './Panel';
import { renderScoreStory, shareScoreStory } from './scoreStory';

/**
 * « Partager en story » de la fin du match. L'image est préparée dès que l'écran de fin connaît le
 * score (`story.key`) : sur iPhone, un partage lancé trop longtemps après le tap est refusé par le
 * système (même logique que `useGangStoryShare`). Sans partage natif, l'image s'affiche dans une
 * fenêtre (`fallbackUrl`) pour être enregistrée à la main.
 *
 *   const { share, busy, fallbackUrl, closeFallback } = useScoreStoryShare(story);
 */
export function useScoreStoryShare(story) {
  const [busy, setBusy] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const busyRef = useRef(false);
  const preparedRef = useRef({ key: '', blob: null });
  const storyRef = useRef(story);
  storyRef.current = story;
  const key = story?.key || '';

  useEffect(() => {
    if (!key || preparedRef.current.key === key) return undefined;
    let cancelled = false;
    preparedRef.current = { key, blob: null };
    // Après l'arrivée de l'écran de fin, pour ne pas ralentir son animation
    const timer = setTimeout(() => {
      renderScoreStory(storyRef.current)
        .then((blob) => { if (!cancelled && preparedRef.current.key === key) preparedRef.current = { key, blob }; })
        .catch(() => { /* l'image sera refaite au tap */ });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key]);

  const share = useCallback(async () => {
    const target = storyRef.current;
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    hapticFeedback();
    try {
      const ready = preparedRef.current.key === target.key ? preparedRef.current.blob : null;
      const result = await shareScoreStory(target, ready ? { blob: ready } : undefined);
      if (result?.fallback && result.url) setFallbackUrl(result.url);
      else if (result?.shared) toast.success('Score partagé 🔥');
    } catch {
      toast.error('Impossible de préparer l’image. Réessaie dans un instant.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const closeFallback = useCallback(() => {
    setFallbackUrl((url) => {
      if (typeof url === 'string' && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch { /* déjà libérée */ }
      }
      return null;
    });
  }, []);

  // Image libérée si l'écran se ferme avec la fenêtre ouverte
  const urlRef = useRef(null);
  urlRef.current = fallbackUrl;
  useEffect(() => () => {
    const url = urlRef.current;
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch { /* déjà libérée */ }
    }
  }, []);

  return { share, busy, fallbackUrl, closeFallback };
}

/** Fenêtre de repli : l'image du score, à garder (appui long, capture d'écran ou téléchargement). */
export function StoryFallback({ url, onClose }) {
  if (!url) return null;
  return (
    <Panel labelledBy="cdg-story-title" onClose={onClose} closeLabel="Fermer" dialog top>
      <p className="cdg-eyebrow">Partager en story</p>
      <h2 className="cdg-message cdg-sm" id="cdg-story-title">Ton score en image</h2>
      <img src={url} alt="Score du match au format story" className="cdg-story-img" />
      <p className="cdg-small">
        {isNative ? 'Fais une capture d’écran pour la garder' : 'Maintiens l’image pour l’enregistrer'}, puis publie-la en story
        depuis Instagram, Snapchat ou WhatsApp.
      </p>
      {!isNative && (
        <a href={url} download="coupe-du-gang-dhomebarber.png" className="cdg-btn cdg-ghost">
          Télécharger l’image
        </a>
      )}
    </Panel>
  );
}
