import { useEffect, useRef } from 'react';
import { platform, registerBackHandler } from '@/lib/capacitor';

/**
 * Bouton retour d'Android : tant que `active` est vrai (fenêtre ouverte), il appelle `onClose`
 * (la même fermeture que la croix) au lieu de revenir à la page précédente ou de quitter l'app.
 * Sans effet sur le web et iOS.
 *
 *   useAndroidBack(showCart, () => setShowCart(false));
 */
export function useAndroidBack(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active || platform !== 'android') return undefined;
    return registerBackHandler(() => ref.current?.());
  }, [active]);
}

export default useAndroidBack;
