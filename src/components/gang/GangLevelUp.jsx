import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Share2, IdCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import { useGangCard, markGangSeen, markGangTierSeen, useInvalidateGang, GANG_BADGE_INFO } from '@/lib/gangCardApi';
import { renderGangStory, shareGangStory } from '@/lib/gangStory';
import GangCard from '@/components/gang/GangCard';
import { gangPalette } from '@/components/gang/gangTheme';
import { GangBadgeUnlock } from '@/components/gang/GangBadges';

/* ────────────────────────────────────────────────────────────────────────────
 * Partage en story, commun à la révélation et à la page « Ta carte Gang ».
 * `shareGangStory` renvoie { shared } | { cancelled } | { fallback: true, url } : sans partage
 * natif, on affiche l'image dans une fenêtre (croix) pour que le client l'enregistre.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fenêtre de repli : l'image de la story, à maintenir pour l'enregistrer. */
export function GangStoryFallback({ url, onClose }) {
  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image de ta carte pour la story"
      data-gang-overlay=""
      className="fixed inset-0 z-[95] bg-black/90 flex flex-col items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>
      <img
        src={url}
        alt="Ta carte Gang au format story"
        className="max-h-[72vh] max-w-full w-auto rounded-2xl shadow-2xl object-contain"
      />
      <p className="mt-4 text-sm font-semibold text-white text-center">Maintiens l’image pour l’enregistrer</p>
      <p className="mt-1 text-xs text-white/60 text-center">Puis publie-la en story depuis Instagram, Snapchat ou WhatsApp.</p>
      {!isNative && (
        <a
          href={url}
          download="carte-gang-dhomebarber.png"
          className="mt-4 h-10 px-4 inline-flex items-center rounded-xl bg-white/10 border border-white/15 text-white text-sm font-semibold"
        >
          Télécharger l’image
        </a>
      )}
    </div>,
    document.body
  );
}

/** `{ share(card), busy, dialog }` : `dialog` est à rendre une fois dans l'écran appelant. */
// Clé d'une carte pour l'image préparée : une autre carte (niveau, stats, photo) = une autre image
const storyKey = (card) => (card ? JSON.stringify([card.tier, card.edition, card.name, card.photo_url, card.score, card.stats, card.serial]) : '');

/**
 * Partage en story. L'image est préparée dès que la carte est connue (`card`) : sur iPhone, un
 * partage lancé trop longtemps après le tap est refusé par le système, il faut donc que
 * l'image soit prête quand le client touche « Partager ».
 */
export function useGangStoryShare(card = null) {
  const [busy, setBusy] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState(null);
  const busyRef = useRef(false);
  const preparedRef = useRef({ key: '', blob: null });

  const key = storyKey(card);
  useEffect(() => {
    if (!card || preparedRef.current.key === key) return undefined;
    let cancelled = false;
    preparedRef.current = { key, blob: null };
    // Après l'affichage, pour ne pas ralentir l'arrivée sur l'écran
    const timer = setTimeout(() => {
      renderGangStory(card)
        .then((blob) => { if (!cancelled && preparedRef.current.key === key) preparedRef.current = { key, blob }; })
        .catch(() => { /* l'image sera refaite au tap */ });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  // `key` résume la carte : inutile de dépendre de l'objet lui-même
  }, [key]);

  const share = useCallback(async (target) => {
    if (!target || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    hapticFeedback();
    try {
      const ready = preparedRef.current.key === storyKey(target) ? preparedRef.current.blob : null;
      const result = await shareGangStory(target, ready ? { blob: ready } : undefined);
      if (result?.fallback && result.url) setFallbackUrl(result.url);
      else if (result?.shared) toast.success('Carte partagée 🔥');
    } catch {
      toast.error('Impossible de préparer l’image. Réessaie dans un instant.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const close = useCallback(() => {
    setFallbackUrl((url) => {
      // Image fabriquée sur l'appareil : on libère la mémoire
      if (typeof url === 'string' && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch { /* rien */ }
      }
      return null;
    });
  }, []);

  return { share, busy, dialog: <GangStoryFallback url={fallbackUrl} onClose={close} /> };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Révélation d'un nouveau niveau, montée une fois dans ClientLayout, puis des écussons
 * nouvellement débloqués (`new_badges` du serveur, animation `GangBadgeUnlock`) : après la
 * révélation du niveau si les deux arrivent ensemble, seuls sinon. Mêmes garde-fous : jamais
 * sur /booking ni /login, après la fenêtre des notifications, une seule fois par session.
 * ──────────────────────────────────────────────────────────────────────────── */

// Délai avant la révélation, et délai minimal depuis l'ouverture de l'app : la fenêtre des
// notifications (NotificationPrompt) décide à 2,5 s, on passe après elle pour ne pas se superposer
const SHOW_DELAY = 1200;
const MIN_SINCE_MOUNT = 3200;
const RETRY_DELAY = 800;
// Pas pendant un parcours
const BLOCKED_PATHS = ['/booking', '/login'];

/** Une autre fenêtre est ouverte (fenêtres shadcn, fenêtres maison avec role="dialog") */
function otherDialogOpen() {
  try {
    return !!document.querySelector('[role="dialog"]:not([data-gang-overlay]), [role="alertdialog"]');
  } catch {
    return false;
  }
}

// Courbe de la maquette (cubic-bezier(.16,1,.3,1)) pour la montée de la carte
const RISE_EASE = [0.16, 1, 0.3, 1];

function revealSize() {
  if (typeof window === 'undefined') return 0.8;
  const byWidth = (window.innerWidth - 64) / 300;
  const byHeight = (window.innerHeight - 320) / 440;
  return Math.max(0.5, Math.min(0.9, byWidth, byHeight));
}

function LevelUpReveal({ card, firstCard, onClose, onSeeCard, onAction }) {
  // Copie floutée retirée une fois effacée (sinon le flou est recalculé à chaque image)
  const [blurDone, setBlurDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const closeRef = useRef(null);
  const [size] = useState(revealSize);
  const { share, busy, dialog } = useGangStoryShare(card);
  const palette = gangPalette(card) || {};
  const tierLabel = card.tier_label || palette.label || 'Gang';

  // Haptique au moment où la carte se pose et que le message apparaît
  useEffect(() => {
    const timer = setTimeout(() => hapticFeedback(), reduceMotion ? 0 : 2300);
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  // Page figée derrière la révélation, focus sur la croix, Échap au clavier
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Avec la réduction des animations : tout est affiché d'emblée, sans mouvement
  const anim = (from, to, transition) => (reduceMotion
    ? { initial: false, animate: to }
    : { initial: from, animate: to, transition });

  const w = 300 * size;
  const h = 440 * size;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gang-levelup-title"
      data-gang-overlay=""
      className="fixed inset-0 z-[80] overflow-hidden bg-[#0b0b0c] text-white"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 45%, #2a2410 0%, #0b0b0c 70%)' }}
        {...anim({ opacity: 0 }, { opacity: 1 }, { duration: 0.5 })}
      />

      {/* Rayons qui tournent : l'apparition (opacité) et la rotation sur deux calques distincts */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        {...anim({ opacity: 0 }, { opacity: 1 }, { duration: 3, delay: 0.8, ease: 'easeOut' })}
      >
        <motion.div
          className="shrink-0 w-[180vmax] h-[180vmax]"
          style={{ background: 'repeating-conic-gradient(from 0deg, transparent 0deg 10deg, rgba(240,200,90,.12) 10deg 13deg)' }}
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
        />
      </motion.div>

      {/* Halo doré qui grandit (flou fixe, seules l'échelle et l'opacité bougent) */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className="shrink-0 w-[560px] h-[560px] max-w-[130vw] max-h-[130vw] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(240,200,90,.6), rgba(240,200,90,.08) 60%, transparent)', filter: 'blur(28px)' }}
          {...anim({ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }, { duration: 2.2, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] })}
        />
      </div>

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute z-10 top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative h-full flex flex-col items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <p className="text-[11px] tracking-[0.24em] uppercase text-[#b8b09a] font-semibold text-center mb-5">
          {firstCard ? 'Bienvenue dans le Gang' : 'Nouvelle carte débloquée'}
        </p>

        {/* La carte monte du flou : une copie floutée s'efface pendant que la nette apparaît */}
        <motion.div
          className="relative shrink-0"
          style={{ width: w, height: h }}
          {...anim({ opacity: 0, y: 90, scale: 0.75 }, { opacity: 1, y: 0, scale: 1 }, { duration: 1.6, delay: 0.9, ease: RISE_EASE })}
        >
          {!reduceMotion && !blurDone && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ filter: 'blur(12px)' }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.3, delay: 1.1, ease: 'easeOut' }}
              onAnimationComplete={() => setBlurDone(true)}
            >
              <GangCard card={card} size={size} flippable={false} interactive={false} />
            </motion.div>
          )}
          <motion.div
            className="absolute inset-0"
            {...anim({ opacity: 0 }, { opacity: 1 }, { duration: 1.1, delay: 1.2, ease: 'easeOut' })}
          >
            <GangCard card={card} size={size} flippable={false} interactive={false} />
          </motion.div>
        </motion.div>

        <motion.h2
          id="gang-levelup-title"
          className="font-fut mt-6 text-center font-extrabold uppercase leading-none text-[34px] min-[400px]:text-[40px]"
          {...anim({ opacity: 0, y: 10 }, { opacity: 1, y: 0 }, { duration: 0.6, delay: 2.3, ease: 'easeOut' })}
        >
          {firstCard ? (
            <>Ta carte Gang <span style={{ color: palette.accent || '#f0c85a' }}>est là</span></>
          ) : (
            <>Tu passes <span style={{ color: palette.accent || '#f0c85a' }}>{tierLabel}</span></>
          )}
        </motion.h2>

        <motion.div
          className="mt-6 w-full max-w-xs flex flex-col gap-2"
          {...anim({ opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { duration: 0.5, delay: 2.7, ease: 'easeOut' })}
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => { onAction(); share(card); }}
            disabled={busy}
            className="h-12 rounded-2xl bg-[#f0c85a] text-[#1c1505] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            {busy ? 'Préparation…' : 'Partager en story'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onSeeCard}
            className="h-12 rounded-2xl bg-white/10 border border-white/15 text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <IdCard className="w-4 h-4" /> Voir ma carte
          </motion.button>
        </motion.div>
      </div>
      {dialog}
    </div>,
    document.body
  );
}

/** Écussons à jouer : objets complets de la carte, repli sur les libellés connus. */
function resolveBadges(card, keys) {
  const list = Array.isArray(card?.badges) ? card.badges : [];
  return keys
    .map((key) => {
      const found = list.find((b) => b?.key === key);
      if (found) return { ...found, unlocked: true };
      const info = GANG_BADGE_INFO[key];
      return info ? { key, ...info, description: '', unlocked: true, progress: null } : null;
    })
    .filter(Boolean);
}

export default function GangLevelUp() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const invalidateGang = useInvalidateGang();
  const isClient = user?.role === 'user';
  const { data } = useGangCard({ enabled: isClient });
  const mountedAt = useRef(Date.now());
  // Niveau et écussons déjà montrés pendant cette session (évite une seconde animation avant le rechargement)
  const handledTier = useRef(null);
  const handledBadges = useRef(new Set());
  // Autre compte connecté dans la même session : ses révélations ne sont pas encore jouées
  const handledFor = useRef(null);
  if (handledFor.current !== (user?.id ?? null)) {
    handledFor.current = user?.id ?? null;
    handledTier.current = null;
    handledBadges.current = new Set();
  }
  // { kind: 'level', card, firstCard, badgeKeys } | { kind: 'badges', keys, badges }
  const [shown, setShown] = useState(null);

  const card = data?.card || null;
  const blocked = BLOCKED_PATHS.some((p) => location.pathname.startsWith(p));
  const pendingLevel = isClient && !!data?.level_up && !!card && handledTier.current !== card.tier;
  const newBadgeKeys = isClient && card && Array.isArray(data?.new_badges)
    ? data.new_badges.map(String).filter((k) => !handledBadges.current.has(k))
    : [];
  const badgeSignature = newBadgeKeys.join(',');
  const pendingBadges = newBadgeKeys.length > 0;

  // Écussons notés comme vus (ils ne repasseront plus), puis la carte est rechargée
  const finishBadges = useCallback((keys) => {
    if (!keys?.length) return;
    markGangSeen({ badges: keys })
      .catch(() => { /* réessayé à la prochaine ouverture de l'app */ })
      .finally(invalidateGang);
  }, [invalidateGang]);

  // Lance l'animation des écussons (ou les marque vus d'office s'il n'y a rien à montrer)
  const startBadges = useCallback((keys) => {
    keys.forEach((k) => handledBadges.current.add(k));
    const badges = resolveBadges(card, keys);
    if (!badges.length) { finishBadges(keys); setShown(null); return; }
    setShown({ kind: 'badges', keys, badges });
  }, [card, finishBadges]);

  useEffect(() => {
    if ((!pendingLevel && !pendingBadges) || blocked || shown) return undefined;
    let timer;
    const attempt = () => {
      if (otherDialogOpen()) { timer = setTimeout(attempt, RETRY_DELAY); return; }
      if (pendingLevel) {
        handledTier.current = card.tier;
        // Les écussons arrivés en même temps passeront après la révélation du niveau
        newBadgeKeys.forEach((k) => handledBadges.current.add(k));
        setShown({ kind: 'level', card, firstCard: !data?.seen_tier, badgeKeys: newBadgeKeys });
      } else {
        startBadges(newBadgeKeys);
      }
    };
    const wait = Math.max(SHOW_DELAY, MIN_SINCE_MOUNT - (Date.now() - mountedAt.current));
    timer = setTimeout(attempt, wait);
    return () => clearTimeout(timer);
  // `badgeSignature` résume `newBadgeKeys` (nouveau tableau à chaque rendu)
  }, [pendingLevel, pendingBadges, badgeSignature, blocked, shown, card, data?.seen_tier, startBadges]);

  // Le niveau est noté comme vu (la révélation ne repassera plus), puis la carte est rechargée.
  // Une seule fois par révélation, qu'on partage, qu'on ouvre la carte ou qu'on ferme.
  const seenSent = useRef(null);
  const markSeen = useCallback(() => {
    if (!shown || shown.kind !== 'level' || seenSent.current === shown) return;
    seenSent.current = shown;
    markGangTierSeen(shown.card.tier)
      .catch(() => { /* réessayé à la prochaine ouverture de l'app */ })
      .finally(invalidateGang);
  }, [shown, invalidateGang]);

  const close = useCallback(() => {
    markSeen();
    const next = shown?.kind === 'level' ? shown.badgeKeys : null;
    if (next?.length) startBadges(next);
    else setShown(null);
  }, [markSeen, shown, startBadges]);

  const seeCard = useCallback(() => {
    close();
    if (location.pathname !== '/gang-card') navigate('/gang-card');
  }, [close, navigate, location.pathname]);

  const badgesDone = useCallback(() => {
    if (shown?.kind === 'badges') finishBadges(shown.keys);
    setShown(null);
  }, [shown, finishBadges]);

  if (!shown) return null;
  if (shown.kind === 'badges') return <GangBadgeUnlock badges={shown.badges} accent={gangPalette(card)?.accent} onDone={badgesDone} />;
  return <LevelUpReveal card={shown.card} firstCard={shown.firstCard} onClose={close} onSeeCard={seeCard} onAction={markSeen} />;
}
