import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { hapticFeedback } from '@/lib/capacitor';
import { motionPermissionPending, requestMotionPermission } from '@/lib/motion';
import { useAuth } from '@/lib/AuthContext';

/**
 * Fenêtre d'activation du gyroscope (effet 3D des cartes des barbers), même principe que
 * `NotificationPrompt` : à la première ouverture d'un profil barber, elle explique l'effet et
 * « Activer » déclenche la demande d'iOS (le tap sur le bouton est le geste exigé par Safari).
 *
 * - Seulement dans Safari / l'app web installée sur iPhone (seul cas où iOS affiche une demande) et
 *   tant que rien n'est décidé. Dans l'app iPhone, la WebView accorde sans rien afficher : la
 *   demande part en silence au premier toucher, à chaque lancement (`startMotionPermission` de
 *   lib/motion.js). Android et ordinateurs ont l'effet d'emblée, sans fenêtre.
 * - Seulement là où l'effet existe : `/barber/:id` (carte du barber), et pour un client `/profile`
 *   et `/gang-card` (sa carte Gang, en tête du profil).
 * - « Plus tard » et croix : réaffichée au plus 3 fois, 7 jours d'écart.
 * - Pas d'affichage sous le système de réduction des animations (l'effet y est coupé).
 */
const STORE_KEY = 'dhb-motion-prompt';
const DAY = 24 * 60 * 60 * 1000;
const MAX_SHOWS = 3;
const GAP = 7 * DAY;
const SHOW_DELAY = 1200;
// Une fenêtre de la carte Gang est ouverte (révélation de niveau, story, écussons) : on réessaie
const RETRY_DELAY = 2000;

/** Révélation de niveau / story (`data-gang-overlay`) ou écussons (`data-gang-badge-overlay`) affichés */
function gangOverlayOpen() {
  try {
    return !!document.querySelector('[data-gang-overlay], [data-gang-badge-overlay]');
  } catch {
    return false;
  }
}

function readState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { count: 0, last: 0 }; } catch { return { count: 0, last: 0 }; }
}
function writeState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

export default function MotionPrompt() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { user } = useAuth();
  const onBarberCard = location.pathname.startsWith('/barber/');
  const onGangCard = user?.role === 'user' && (location.pathname === '/profile' || location.pathname.startsWith('/gang-card'));
  const onCard = onBarberCard || onGangCard;

  useEffect(() => {
    if (!onCard || open || reduceMotion || !motionPermissionPending()) return undefined;
    let timer;
    const attempt = () => {
      if (!motionPermissionPending()) return;
      const state = readState();
      if (state.count >= MAX_SHOWS || Date.now() - state.last < GAP) return;
      // Pas par-dessus une fenêtre de la carte Gang : on repasse plus tard, sans compter d'affichage
      if (gangOverlayOpen()) { timer = setTimeout(attempt, RETRY_DELAY); return; }
      writeState({ count: state.count + 1, last: Date.now() });
      setOpen(true);
    };
    timer = setTimeout(attempt, SHOW_DELAY);
    return () => clearTimeout(timer);
  }, [onCard, open, reduceMotion]);

  const close = () => setOpen(false);

  const enable = async () => {
    setBusy(true);
    hapticFeedback();
    const result = await requestMotionPermission();
    setBusy(false);
    if (result === 'granted') toast.success('Effet 3D activé : incline ton téléphone 📱');
    close();
  };

  return (
    <AnimatePresence>
      {/* `onCard` (et plus seulement la carte du barber) : la fenêtre décidée sur /profile ou
          /gang-card n'était jamais rendue alors que l'affichage était déjà compté */}
      {open && onCard && (
        <>
          <motion.div
            key="motion-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            key="motion-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="motion-prompt-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-lg rounded-t-3xl border-t border-white/10 bg-background px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/5 border border-white/10 text-muted-foreground flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative mx-auto mb-5 w-20 h-20" style={{ perspective: 400 }}>
              <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl" aria-hidden="true" />
              <motion.div
                className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30"
                animate={{ rotateY: [0, 22, -22, 0], rotateX: [0, -10, 10, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Smartphone className="w-9 h-9 text-primary-foreground" />
              </motion.div>
            </div>

            <h2 id="motion-prompt-title" className="text-center font-display text-2xl font-bold text-foreground">
              Fais bouger la carte
            </h2>
            <p className="text-center text-sm text-muted-foreground mt-2">
              Active l’effet 3D : {onGangCard ? 'ta carte Gang' : 'la carte du barber'} s’incline et brille quand tu bouges ton téléphone.
              Rien n’est enregistré ni envoyé.
            </p>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={enable}
              disabled={busy}
              className="mt-6 w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Smartphone className="w-4 h-4" /> {busy ? 'Activation…' : 'Activer l’effet 3D'}
            </motion.button>
            <button
              type="button"
              onClick={close}
              className="mt-3 w-full py-3 rounded-2xl text-sm font-medium text-muted-foreground"
            >
              Plus tard
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
