/**
 * Fenêtres empilées du fil (commentaires → menu → signalement) : Échap ne ferme que celle du dessus,
 * comme le retour Android (`registerBackHandler`). Chaque fenêtre ouverte prend une place dans la
 * pile ; seule la dernière réagit à la touche.
 *
 *   useEscapeLayer(open, () => setOpen(false));
 *   openLayerCount() // fenêtres encore ouvertes (focus rendu seulement quand il n'en reste aucune)
 */
import { useEffect, useRef } from 'react';

const layers = [];

/** Nombre de fenêtres du fil encore ouvertes. */
export const openLayerCount = () => layers.length;

/**
 * Tant que `active`, la fenêtre est dans la pile et `onEscape` est appelé sur Échap si elle est au
 * dessus. Rend une fonction qui dit si elle est encore la dernière ouverte (utile au démontage).
 */
export function useEscapeLayer(active, onEscape) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    layers.push(token);
    const onKey = (e) => {
      // Les autres fenêtres écoutent aussi : seule celle du dessus agit (elle est encore dans la pile
      // pendant tout l'événement, sa sortie n'arrive qu'au rendu suivant)
      if (e.key !== 'Escape' || layers[layers.length - 1] !== token) return;
      ref.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = layers.indexOf(token);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}
