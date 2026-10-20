/**
 * Écran de succès de la demande de devis (dernière étape de `RequestSheet`) : disque vert dont la
 * coche se dessine, anneau pointillé, éclats de confettis qui partent en étoile puis s'estompent,
 * « Demande envoyée ! », ce qui se passe ensuite, invitation à activer les notifications (seulement
 * quand le téléphone peut encore la proposer). Rendu dans la zone qui défile de `RequestSheet`
 * (marges latérales de 16 px fournies par elle).
 *
 * « Voir ma demande » et « Retour à l'accueil » (`RequestSuccessActions`) sont posés par
 * `RequestSheet` dans un pied fixé de la fenêtre : visibles sans défiler, même à 320 × 568. Sur un
 * écran court (hauteur ≤ 700 px) l'animation et les marges se resserrent.
 *
 * Aucun toast ici : la fenêtre est ouverte, les toasts (en haut de l'écran) recouvraient la croix et
 * le reste de l'app est inerte. Le résultat de l'activation des notifications s'affiche à la place
 * de l'invitation.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, BellOff, Check, Loader2 } from 'lucide-react';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import { getPushPermission, subscribeToPush } from '@/lib/pushNotifications';
import { friendlyError } from '@/components/shared/LoadError';
import { eventTypeOf, formatEventDate } from '@/components/privatisation/privatisationUtils';

/** Identifiant du titre : la fenêtre (`role="dialog"`) s'y réfère avec `aria-labelledby`. */
export const REQUEST_SUCCESS_TITLE_ID = 'privatisation-request-success-title';

const ease = [0.16, 1, 0.3, 1];

/** Apparition en cascade (fondu seul avec la réduction des animations). */
const appear = (reduceMotion, delay) => ({
  initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: reduceMotion ? 0 : delay, duration: reduceMotion ? 0.15 : 0.5, ease },
});

/** Site ajouté à l'écran d'accueil (mêmes conditions que la fenêtre des notifications). */
const isStandaloneWeb = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
};

// Confettis : tirage fixe (générateur à graine), calculé une seule fois au chargement du module
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const CONFETTI_COLORS = ['bg-primary', 'bg-amber-400', 'bg-slate-300 dark:bg-slate-200'];
const CONFETTI_COUNT = 26;
const CONFETTI = (() => {
  const rand = seeded(20261019);
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const dist = 88 + rand() * 66;
    const dot = i % 4 === 3;
    const w = dot ? 7 + rand() * 3 : 6 + rand() * 2.5;
    const h = dot ? w : 14 + rand() * 8;
    return {
      id: i,
      x: Math.round(Math.cos(angle) * dist),
      y: Math.round(Math.sin(angle) * dist * 0.8),
      fall: Math.round(16 + rand() * 24),
      rotate: Math.round((rand() > 0.5 ? 1 : -1) * (120 + rand() * 240)),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dot,
      w: Math.round(w),
      h: Math.round(h),
      delay: 0.28 + (i % 3) * 0.05 + rand() * 0.08,
      duration: 1.3 + rand() * 0.5,
    };
  });
})();

/** Éclats partis du centre du disque ; rien avec la réduction des animations. */
function Confetti() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0" aria-hidden="true">
      {CONFETTI.map(c => (
        <motion.span
          key={c.id}
          className={`absolute ${c.dot ? 'rounded-full' : 'rounded-[2px]'} ${c.color}`}
          style={{ width: c.w, height: c.h, left: -c.w / 2, top: -c.h / 2 }}
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
          animate={{ x: c.x, y: c.y + c.fall, scale: 1, opacity: [0, 1, 1, 0], rotate: c.rotate }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease,
            y: { duration: c.duration, delay: c.delay, ease: [0.2, 0.9, 0.4, 1] },
            rotate: { duration: c.duration, delay: c.delay, ease: 'linear' },
            opacity: { duration: c.duration, delay: c.delay, times: [0, 0.08, 0.65, 1] },
          }}
        />
      ))}
    </div>
  );
}

/** « de votre anniversaire », « de votre EVJG », « de votre événement » (sur mesure, inconnu). */
function occasionPhrase(typeId) {
  const type = eventTypeOf(typeId);
  if (!type || type.id === 'autre') return 'votre événement';
  if (type.id === 'evjg') return 'votre EVJG';
  return `votre ${type.label.toLowerCase()}`;
}

const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * « Voir ma demande » et « Retour à l'accueil », pour le pied fixé de `RequestSheet` (marges, zone
 * sûre du bas comprises). Boutons d'au moins 46 px, un peu resserrés sur un écran court.
 */
export function RequestSuccessActions({ onView, onHome }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      {...appear(reduceMotion, 0.75)}
      className="mx-auto flex w-full max-w-lg flex-col gap-2 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] [@media(max-height:700px)]:gap-1.5 [@media(max-height:700px)]:pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
    >
      <motion.button
        type="button"
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        onClick={() => onView?.()}
        className="flex h-[54px] items-center justify-center rounded-2xl bg-primary text-[15px] font-bold text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.35)] [@media(max-height:700px)]:h-[50px]"
      >
        Voir ma demande
      </motion.button>
      <motion.button
        type="button"
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        onClick={() => onHome?.()}
        className="flex h-[50px] items-center justify-center rounded-2xl border border-border text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary [@media(max-height:700px)]:h-[46px]"
      >
        {"Retour à l'accueil"}
      </motion.button>
    </motion.div>
  );
}

export default function RequestSuccess({ event, draft }) {
  const reduceMotion = useReducedMotion();
  const mountedRef = useRef(true);
  const activatingRef = useRef(false);
  // Notifications : `hidden` (rien à proposer), `offer`, `activating`, `failed`, `done`, `denied`
  const [push, setPush] = useState('hidden');
  const [pushError, setPushError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // Dans un onglet de navigateur, l'abonnement n'est pas proposé (comme NotificationPrompt)
    if (!isNative && !isStandaloneWeb()) return undefined;
    let cancelled = false;
    getPushPermission()
      .then((status) => { if (!cancelled && status === 'prompt') setPush('offer'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const activate = async () => {
    if (activatingRef.current) return;
    activatingRef.current = true;
    setPush('activating');
    setPushError('');
    hapticFeedback();
    try {
      await subscribeToPush();
      if (mountedRef.current) setPush('done');
    } catch (err) {
      const status = await getPushPermission().catch(() => null);
      if (!mountedRef.current) return;
      if (status === 'denied') {
        setPush('denied');
      } else {
        setPushError(friendlyError(err, "Impossible d'activer les notifications. Réessayez.", {
          foreign: "Impossible d'activer les notifications sur cet appareil. Réessayez.",
        }));
        setPush('failed');
      }
    } finally {
      activatingRef.current = false;
    }
  };

  // La ligne du serveur fait foi (même demande renvoyée si elle était déjà arrivée), sinon le brouillon
  const typeId = event?.event_type || draft?.event_type || '';
  const dateKey = String(event?.date || draft?.date || '').slice(0, 10);
  const dayText = dateKey ? lowerFirst(formatEventDate(dateKey, 'day')) : '';
  const offering = push === 'offer' || push === 'activating' || push === 'failed';

  return (
    <div className="relative -mx-4 flex flex-1 flex-col overflow-hidden px-4">
      {/* Halo vert derrière le disque (dégradé qui s'éteint avant les bords : aucune coupure) */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[340px] w-[340px] -translate-x-1/2 [@media(max-height:700px)]:h-[250px] [@media(max-height:700px)]:w-[250px]"
        style={{ background: 'radial-gradient(closest-side, hsl(var(--primary) / 0.2), transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mt-2 flex h-[230px] items-center justify-center [@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:h-[160px]">
        {/* Écran court : disque, anneau et confettis réduits d'un bloc autour du centre */}
        <div className="absolute inset-0 flex items-center justify-center [@media(max-height:700px)]:scale-[0.7]">
          {!reduceMotion && <Confetti />}
          <motion.div
            className="absolute h-[150px] w-[150px] rounded-full border border-dashed border-primary/40"
            initial={{ opacity: 0, rotate: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, rotate: 360 }}
            transition={reduceMotion
              ? { duration: 0.15 }
              : { opacity: { duration: 0.6, delay: 0.2 }, rotate: { duration: 30, repeat: Infinity, ease: 'linear' } }}
            aria-hidden="true"
          />
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 1 }}
            animate={reduceMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 15, delay: 0.1 }}
            className="relative flex h-28 w-28 items-center justify-center rounded-full bg-primary text-primary-foreground"
            style={{ boxShadow: '0 0 0 10px hsl(var(--primary) / 0.16), 0 20px 50px hsl(var(--primary) / 0.45)' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-[52px] w-[52px]">
              <motion.path
                d="M4 12l5 5L20 6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 0.45, delay: 0.35, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.1, delay: 0.35 },
                }}
              />
            </svg>
          </motion.div>
        </div>
      </div>

      <div className="relative text-center">
        <motion.h1
          id={REQUEST_SUCCESS_TITLE_ID}
          tabIndex={-1}
          {...appear(reduceMotion, 0.45)}
          className="font-display text-[30px] font-bold leading-tight text-foreground focus:outline-none [@media(max-height:700px)]:text-[26px]"
        >
          Demande envoyée !
        </motion.h1>
        <motion.p {...appear(reduceMotion, 0.55)} className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground [@media(max-height:700px)]:mt-1.5">
          {dayText ? (
            <>
              Le salon prépare le devis de {occasionPhrase(typeId)} du{' '}
              <span className="font-semibold text-foreground">{dayText}</span>.
            </>
          ) : (
            <>Le salon prépare le devis de {occasionPhrase(typeId)}.</>
          )}
        </motion.p>
      </div>

      <motion.ol
        {...appear(reduceMotion, 0.65)}
        aria-label="La suite"
        className="relative mt-5 flex flex-col gap-3.5 rounded-[20px] border border-border bg-card p-4 [@media(max-height:700px)]:mt-4 [@media(max-height:700px)]:gap-3 [@media(max-height:700px)]:p-3.5"
      >
        <li className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <p className="text-[13px] font-semibold text-foreground">
            <span className="sr-only">Fait : </span>Demande reçue par le salon
          </p>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-amber-400" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <p className="text-[13px] text-foreground">
            <span className="sr-only">Ensuite : </span>
            <span className="font-semibold">{"Votre devis arrive dans l'app"}</span>
            <br />
            <span className="text-muted-foreground">avec une notification et un email</span>
          </p>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-7 w-7 shrink-0 rounded-full border-2 border-border" aria-hidden="true" />
          <p className="text-[13px] text-muted-foreground">
            <span className="sr-only">Pour finir : </span>
            {"Vous l'acceptez en un tap, vous réglez au salon, puis le salon confirme votre date"}
          </p>
        </li>
      </motion.ol>

      {/* Toujours monté : l'invitation puis le résultat de l'activation sont annoncés */}
      <div aria-live="polite" className="relative">
        <AnimatePresence initial={false} mode="wait">
          {offering && (
            <motion.div
              key="offer"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              // Après le titre et « La suite », même quand l'autorisation est lue tout de suite
              transition={{ duration: reduceMotion ? 0.15 : 0.35, delay: reduceMotion ? 0 : 0.75, ease }}
              className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 py-3 pl-3.5 pr-3"
            >
              <Bell className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-snug text-foreground/90">
                  Activez les notifications pour ne pas rater le devis.
                </p>
                {push === 'failed' && pushError && (
                  <p className="mt-1 text-xs font-medium leading-snug text-destructive">{pushError}</p>
                )}
              </div>
              <button
                type="button"
                onClick={activate}
                disabled={push === 'activating'}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 text-[13px] font-bold text-amber-950 transition-opacity disabled:opacity-70"
              >
                {push === 'activating' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {push === 'failed' ? 'Réessayer' : 'Activer'}
              </button>
            </motion.div>
          )}
          {push === 'done' && (
            <motion.p
              key="done"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.3, ease }}
              className="mt-3 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-primary/10 px-3.5 py-3 text-xs font-medium leading-snug text-foreground"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              Notifications activées : vous serez prévenu dès que le devis est prêt.
            </motion.p>
          )}
          {push === 'denied' && (
            <motion.p
              key="denied"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0.15 : 0.3, ease }}
              className="mt-3 flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 text-xs leading-snug text-muted-foreground"
            >
              <BellOff className="h-5 w-5 shrink-0" aria-hidden="true" />
              {"Notifications refusées : vous serez prévenu par email dès que le devis est prêt. Vous pourrez les activer dans les réglages du téléphone."}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
