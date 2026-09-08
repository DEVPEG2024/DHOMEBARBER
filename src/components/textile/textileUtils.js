/**
 * Helpers de présentation de la section Textile & Drops (page client + carte de l'accueil).
 * Les appels API et les helpers métier vivent dans `@/lib/textileApi` ; ici on ne fait que
 * découper la vue d'ensemble, formater des délais et partager quelques constantes d'animation.
 */
import { useEffect, useState } from 'react';
import { ACTIVE_RESERVATION_STATUSES, dropPhase, msUntilOpen, splitDuration } from '@/lib/textileApi';

/** Courbe « signature » de l'app (sortie très douce). */
export const EASE = [0.16, 1, 0.3, 1];

/** Horloge partagée : `Date.now()` rafraîchi toutes les `intervalMs` ms (une seule minuterie par composant). */
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

/** Message d'erreur lisible : celui du serveur s'il existe, sinon le repli. */
export function errorMessage(err, fallback) {
  const m = err?.message;
  if (!m || /^HTTP \d+$/.test(m)) return fallback;
  if (/failed to fetch|network|load failed/i.test(m)) return 'Connexion impossible, réessaie dans un instant.';
  return m;
}

/** Délai restant en français : « 2 j 5 h », « 5 h 12 min », « 12 min », « moins d'une minute ». */
export function formatRemaining(ms) {
  if (ms == null || ms <= 0) return 'délai dépassé';
  const { days, hours, minutes } = splitDuration(ms);
  if (days > 0) return `${days} j${hours > 0 ? ` ${hours} h` : ''}`;
  if (hours > 0) return `${hours} h${minutes > 0 ? ` ${minutes} min` : ''}`;
  if (minutes > 0) return `${minutes} min`;
  return "moins d'une minute";
}

/** Délai de paiement d'un drop : « 72 h » → « 3 jours ». */
export function formatReservationWindow(hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return '';
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? '24 h' : `${d} jours`;
  }
  return `${h} h`;
}

/** Première image d'un concept (couverture), ou null. */
export function conceptCover(concept) {
  const imgs = Array.isArray(concept?.images) ? concept.images : [];
  return imgs.find(Boolean) || null;
}

/** Quantité déjà réservée (statuts actifs) par le compte sur un concept. */
export function myActiveQuantity(me, conceptId) {
  const list = Array.isArray(me?.reservations) ? me.reservations : [];
  return list
    .filter(r => String(r.concept_id) === String(conceptId) && ACTIVE_RESERVATION_STATUSES.includes(r.status))
    .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
}

/** Styles des statuts de réservation (précommande : à payer → payée → prête → retirée). */
export const RESERVATION_STYLE = {
  reserved: { label: 'À payer', text: 'text-amber-400', bg: 'bg-amber-500/12 border-amber-500/25', dot: 'bg-amber-400' },
  paid: { label: 'Payée', text: 'text-blue-400', bg: 'bg-blue-500/12 border-blue-500/25', dot: 'bg-blue-400' },
  ready: { label: 'Prête', text: 'text-violet-400', bg: 'bg-violet-500/12 border-violet-500/25', dot: 'bg-violet-400' },
  picked_up: { label: 'Retirée', text: 'text-green-400', bg: 'bg-green-500/12 border-green-500/25', dot: 'bg-green-400' },
  cancelled: { label: 'Annulée', text: 'text-muted-foreground', bg: 'bg-white/5 border-white/10', dot: 'bg-muted-foreground' },
  expired: { label: 'Expirée', text: 'text-muted-foreground', bg: 'bg-white/5 border-white/10', dot: 'bg-muted-foreground' },
};

/**
 * Découpe la vue d'ensemble pour la page : drops visibles (jamais de brouillon, même pour le
 * staff), drop en vedette (premier `live`, sinon premier `teasing`), pièces du drop en vedette,
 * concepts du Labo (sans drop) avec leur « hype », autres drops annoncés et drops terminés.
 */
export function splitOverview(data) {
  const drops = Array.isArray(data?.drops) ? data.drops : [];
  const concepts = Array.isArray(data?.concepts) ? data.concepts : [];
  const me = data?.me || {};

  const visibleDrops = drops.filter(d => d && d.status !== 'draft');
  const dropById = new Map(visibleDrops.map(d => [String(d.id), d]));
  const visibleConcepts = concepts.filter(c => c && c.is_active !== false && (!c.drop_id || dropById.has(String(c.drop_id))));

  const conceptsByDrop = new Map();
  for (const c of visibleConcepts) {
    if (!c.drop_id) continue;
    const key = String(c.drop_id);
    if (!conceptsByDrop.has(key)) conceptsByDrop.set(key, []);
    conceptsByDrop.get(key).push(c);
  }

  const featured = visibleDrops.find(d => d.status === 'live') || visibleDrops.find(d => d.status === 'teasing') || null;
  const featuredConcepts = featured ? conceptsByDrop.get(String(featured.id)) || [] : [];
  const otherTeasing = visibleDrops.filter(d => d.status === 'teasing' && (!featured || d.id !== featured.id));
  const endedDrops = visibleDrops.filter(d => d.status === 'ended');

  const labConcepts = visibleConcepts.filter(c => !c.drop_id);
  const labTotal = labConcepts.reduce((s, c) => s + (Number(c.votes_count) || 0), 0);
  const ranked = [...labConcepts].sort((a, b) => (Number(b.votes_count) || 0) - (Number(a.votes_count) || 0));
  const hypeById = new Map();
  ranked.forEach((c, i) => {
    const votes = Number(c.votes_count) || 0;
    hypeById.set(String(c.id), {
      pct: labTotal > 0 ? Math.round((votes / labTotal) * 100) : 0,
      rank: votes > 0 && i < 3 ? i + 1 : null,
    });
  });

  const reservations = [...(Array.isArray(me.reservations) ? me.reservations : [])]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return {
    me,
    visibleDrops,
    dropById,
    concepts: visibleConcepts,
    conceptsByDrop,
    featured,
    featuredConcepts,
    otherTeasing,
    endedDrops,
    labConcepts,
    labTotal,
    hypeById,
    reservations,
    isEmpty: visibleDrops.length === 0 && visibleConcepts.length === 0 && reservations.length === 0,
  };
}

/**
 * Un drop annoncé dont le compte à rebours est à zéro (le job serveur bascule le statut à la
 * minute), ou un drop ouvert dont la date de fin est passée : on interroge le serveur toutes
 * les 5 s jusqu'à ce que son statut suive.
 */
export function needsPolling(drops, nowMs) {
  return (drops || []).some(d => {
    const phase = dropPhase(d, nowMs);
    if (phase === 'upcoming') return msUntilOpen(d, nowMs) === 0;
    if (phase === 'live' && d.ends_at) {
      const t = new Date(d.ends_at).getTime();
      return Number.isFinite(t) && t <= nowMs;
    }
    return false;
  });
}

/** Le compte à rebours est à zéro mais le serveur n'a pas encore ouvert le drop. */
export function isOpening(drop, nowMs) {
  return dropPhase(drop, nowMs) === 'upcoming' && msUntilOpen(drop, nowMs) === 0;
}
