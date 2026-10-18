import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, CalendarCheck, Zap, Sparkles, X, Settings as SettingsIcon, CalendarDays, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { isNative, platform, hapticFeedback } from '@/lib/capacitor';
import { getPushPermission, subscribeToPush } from '@/lib/pushNotifications';

/**
 * Fenêtre d'activation des notifications, à la première ouverture de l'app une fois connecté :
 * explique ce que le client reçoit, puis « Activer » déclenche la demande du téléphone. Le client
 * n'a plus à passer par Paramètres.
 *
 * Règles (Apple 4.5.4 : les notifications ne peuvent pas être imposées) :
 * - toujours un « Plus tard » et une croix ; jamais d'affichage pendant une réservation ;
 * - autorisation jamais demandée → réaffichée au plus 3 fois, 7 jours d'écart ;
 * - autorisation refusée sur le téléphone → variante « Ouvrir les réglages » (iOS) ou marche à
 *   suivre (Android, web), au plus 2 fois, 30 jours d'écart ;
 * - désactivée volontairement dans Paramètres de l'app (`optout`) ou déjà accordée → jamais.
 * Sur le web, seulement dans l'app installée (écran d'accueil) : dans un onglet, pas de fenêtre.
 */
const STORE_KEY = 'dhb-notif-prompt';
const DAY = 24 * 60 * 60 * 1000;
const RULES = {
  prompt: { max: 3, gap: 7 * DAY },
  denied: { max: 2, gap: 30 * DAY },
};
const SHOW_DELAY = 2500;
// Pas pendant un parcours : réservation, connexion, page de paramètres (interrupteur déjà là),
// ni sur le profil d'un barber, où s'ouvre la fenêtre du gyroscope (MotionPrompt)
// Pages des cartes (barbers, carte Gang) : la fenêtre de l'effet 3D (MotionPrompt) y a la priorité
const BLOCKED_PATHS = ['/booking', '/login', '/settings', '/barber/', '/gang-card', '/profile'];
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
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function writeState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

const isStandaloneWeb = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
};

const BENEFITS = [
  { icon: CalendarCheck, title: 'Rappel de ton rendez-vous', text: 'La veille, pour ne jamais l’oublier.' },
  { icon: Zap, title: 'Créneaux last minute', text: 'Une place se libère ? Tu es le premier au courant.' },
  { icon: Sparkles, title: 'Drops et événements', text: 'Textile, soirées du salon, bons plans du Gang.' },
];
// Équipe (barbers, admin) : ce qu'ils reçoivent vraiment, pas les avantages d'un client
const STAFF_BENEFITS = [
  { icon: CalendarCheck, title: 'Nouveaux rendez-vous et annulations', text: 'Dès qu’un client réserve, déplace ou annule.' },
  { icon: CalendarDays, title: 'Tes demandes de congé', text: 'La réponse du salon dès qu’elle tombe.' },
  { icon: ClipboardList, title: 'Ménage du jour et activité', text: 'Tes tâches du jour, l’activité des clients pour l’admin.' },
];

export default function NotificationPrompt() {
  const { user } = useAuth();
  const isStaff = user?.role === 'admin' || user?.role === 'barber';
  const benefits = isStaff ? STAFF_BENEFITS : BENEFITS;
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState(null); // null | 'prompt' | 'denied'
  const [busy, setBusy] = useState(false);

  const blocked = BLOCKED_PATHS.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (!user || blocked || mode) return undefined;
    if (!isNative && !isStandaloneWeb()) return undefined;
    let cancelled = false;
    let timer;
    const attempt = async () => {
      const status = await getPushPermission();
      const rule = RULES[status];
      if (cancelled || !rule) return;
      const state = readState();
      const entry = state[status] || { count: 0, last: 0 };
      if (entry.count >= rule.max || Date.now() - entry.last < rule.gap) return;
      // Pas par-dessus une fenêtre de la carte Gang : on repasse plus tard, sans compter d'affichage
      if (gangOverlayOpen()) { timer = setTimeout(attempt, RETRY_DELAY); return; }
      writeState({ ...state, [status]: { count: entry.count + 1, last: Date.now() } });
      setMode(status);
    };
    timer = setTimeout(attempt, SHOW_DELAY);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [user, blocked, mode]);

  const close = () => setMode(null);

  const enable = async () => {
    setBusy(true);
    hapticFeedback();
    try {
      await subscribeToPush();
      toast.success('Notifications activées ✅');
      close();
    } catch {
      // Refus dans la fenêtre du téléphone : on explique comment revenir en arrière
      const status = await getPushPermission();
      if (status === 'denied') setMode('denied');
      else close();
    } finally {
      setBusy(false);
    }
  };

  const openSettings = () => {
    // iOS : le schéma app-settings: ouvre la page de l'app dans Réglages
    window.location.href = 'app-settings:';
    close();
  };

  const canOpenSettings = isNative && platform === 'ios';
  // Marche à suivre selon la plateforme : le chemin « Applications → D’Home Barber » n'existe
  // que pour l'app native (Android ici, iOS a le bouton) ; l'app web installée se règle dans le
  // navigateur ou, sur iPhone, dans Réglages → Notifications
  const deniedHelp = isNative
    ? ' Pour les réactiver : Paramètres du téléphone → Applications → D’Home Barber → Notifications.'
    : ' Pour les réactiver : autorise les notifications pour dhomebarber.fr dans les réglages du navigateur (icône à gauche de l’adresse), ou sur iPhone : Réglages → Notifications → D’Home Barber.';

  return (
    <AnimatePresence>
      {mode && (
        <>
          <motion.div
            key="notif-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            key="notif-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notif-prompt-title"
            initial={{ y: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: reduceMotion ? 0 : '100%', opacity: reduceMotion ? 0 : 1 }}
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

            <div className="relative mx-auto mb-5 w-20 h-20">
              <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl" aria-hidden="true" />
              <motion.div
                className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30"
                animate={reduceMotion ? undefined : { rotate: [0, -12, 10, -6, 4, 0] }}
                transition={{ duration: 1.2, delay: 0.4, repeat: Infinity, repeatDelay: 2.5 }}
              >
                <Bell className="w-9 h-9 text-primary-foreground" />
              </motion.div>
            </div>

            {mode === 'prompt' ? (
              <>
                <h2 id="notif-prompt-title" className="text-center font-display text-2xl font-bold text-foreground">
                  Ne rate rien du Gang
                </h2>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {isStaff
                    ? 'Active les notifications pour suivre ton agenda en direct. Tu peux les couper à tout moment dans tes paramètres.'
                    : 'Active les notifications, on ne t’écrit que pour ce qui compte.'}
                </p>
                <ul className="mt-6 space-y-3">
                  {benefits.map(({ icon: Icon, title, text }) => (
                    <li key={title} className="flex items-start gap-3 rounded-2xl bg-white/4 border border-white/8 p-3">
                      <span className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{title}</span>
                        <span className="block text-xs text-muted-foreground">{text}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={enable}
                  disabled={busy}
                  className="mt-6 w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Bell className="w-4 h-4" /> {busy ? 'Activation…' : 'Activer les notifications'}
                </motion.button>
              </>
            ) : (
              <>
                <h2 id="notif-prompt-title" className="text-center font-display text-2xl font-bold text-foreground">
                  Notifications désactivées
                </h2>
                <p className="text-center text-sm text-muted-foreground mt-2">
                  {isStaff
                    ? 'Tu ne seras prévenu ni des nouveaux rendez-vous ni des annulations.'
                    : 'Tu ne recevras ni le rappel de ton rendez-vous ni les créneaux last minute.'}
                  {canOpenSettings
                    ? ' Tu peux les réactiver en un geste dans les réglages.'
                    : deniedHelp}
                </p>
                {canOpenSettings && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={openSettings}
                    className="mt-6 w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <SettingsIcon className="w-4 h-4" /> Ouvrir les réglages
                  </motion.button>
                )}
              </>
            )}

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
