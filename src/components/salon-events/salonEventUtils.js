/**
 * Helpers de présentation des événements du salon (page Événements + carte de l'accueil).
 * Les appels API et les helpers métier vivent dans `@/lib/salonEventsApi` ; ici on découpe la
 * liste renvoyée par `GET /salon-events/mine`, on prépare les images, la jauge de places,
 * l'événement calendrier et quelques constantes d'animation.
 */
import { useEffect, useState } from 'react';
import { MAX_GUESTS, eventPhase, formatEventDate, formatPrice, spotsLeft } from '@/lib/salonEventsApi';
import { SALON_LOCATION } from '@/lib/calendarLinks';

/** Courbe « signature » de l'app (sortie très douce). */
export const EASE = [0.16, 1, 0.3, 1];

/** Phases pendant lesquelles on peut encore répondre. */
export const ACTIVE_PHASES = ['upcoming', 'today'];

/** Durée par défaut d'un événement sans `ends_at` (même valeur que `eventPhase`). */
export const DEFAULT_DURATION_MS = 3 * 3600 * 1000;

/** Horloge partagée : `Date.now()` rafraîchi toutes les `intervalMs` ms (une seule minuterie par composant). */
export function useNow(intervalMs = 60_000, enabled = true) {
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

/** Images de la fiche : couverture puis galerie, dédoublonnées, vides ignorées. */
export function eventImages(event) {
  const list = [event?.cover_image_url, ...(Array.isArray(event?.images) ? event.images : [])];
  return [...new Set(list.filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()))];
}

/**
 * Ma réponse : 'accepted' | 'declined' | 'invited' (invitation sans réponse) | 'open'
 * (événement ouvert à tous, aucune invitation nominative).
 */
export function myResponse(event) {
  const s = event?.my_invite?.status;
  if (s === 'accepted' || s === 'declined') return s;
  if (!event?.my_invite && event?.visibility === 'public') return 'open';
  return 'invited';
}

/** Styles des pastilles de réponse (carte et fiche). */
export const RESPONSE_STYLE = {
  accepted: { label: 'Tu viens ✓', text: 'text-green-400', bg: 'bg-green-500/12 border-green-500/25', dot: 'bg-green-400' },
  declined: { label: 'Tu ne viens pas', text: 'text-muted-foreground', bg: 'bg-white/5 border-white/10', dot: 'bg-muted-foreground' },
  invited: { label: 'Répondre', text: 'text-amber-400', bg: 'bg-amber-500/12 border-amber-500/25', dot: 'bg-amber-400' },
  open: { label: 'Ouvert à tous', text: 'text-primary', bg: 'bg-primary/10 border-primary/25', dot: 'bg-primary' },
};

/** Libellé de ma réponse avec le nombre de places quand j'ai accepté à plusieurs. */
export function responseLabel(event) {
  const response = myResponse(event);
  const base = RESPONSE_STYLE[response].label;
  const guests = Number(event?.my_invite?.guests) || 0;
  return response === 'accepted' && guests > 1 ? `${base} · ${guests} places` : base;
}

/**
 * Jauge de places : `{ capacity, accepted, left, full, pct }`. Sans capacité : `capacity` null,
 * `left` null, jamais complet.
 */
export function capacityInfo(event) {
  const capacity = Number(event?.capacity) || 0;
  const accepted = Math.max(0, Number(event?.accepted_count) || 0);
  if (capacity <= 0) return { capacity: null, accepted, left: null, full: false, pct: 0 };
  const raw = spotsLeft(event);
  const left = raw == null ? Math.max(0, capacity - accepted) : Math.max(0, Number(raw) || 0);
  return {
    capacity,
    accepted,
    left,
    full: left === 0,
    pct: Math.min(100, Math.round((accepted / capacity) * 100)),
  };
}

/**
 * Places que je peux prendre : 1..MAX_GUESTS, bornées par le restant. Si j'ai déjà accepté, mes
 * places comptent comme libres (je peux les réajuster sans me bloquer moi-même).
 */
export function maxGuestsFor(event) {
  const { capacity, left } = capacityInfo(event);
  if (capacity == null) return MAX_GUESTS;
  const mine = event?.my_invite?.status === 'accepted' ? Number(event.my_invite.guests) || 0 : 0;
  return Math.max(0, Math.min(MAX_GUESTS, left + mine));
}

/**
 * Découpe la réponse de `GET /salon-events/mine` : à venir (publiés, aujourd'hui ou plus tard, tri
 * croissant), passés (terminés, dépassés, annulés, tri décroissant), prochain à venir. Chaque
 * événement reçoit sa `phase` calculée (jamais renvoyée par le serveur).
 */
export function splitSalonEvents(data, nowMs = Date.now()) {
  const events = Array.isArray(data?.events) ? data.events.filter(e => e && e.id) : [];
  const upcoming = [];
  const past = [];
  for (const e of events) {
    const phase = eventPhase(e, nowMs);
    if (phase === 'draft') continue;
    if (ACTIVE_PHASES.includes(phase) && e.status === 'published') upcoming.push({ ...e, phase });
    else past.push({ ...e, phase });
  }
  const at = (e) => new Date(e.starts_at).getTime() || 0;
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));
  return { events, upcoming, past, next: upcoming[0] || null, isEmpty: upcoming.length === 0 && past.length === 0 };
}

/** Libellé court de la phase (badge). */
export function phaseLabel(phase) {
  switch (phase) {
    case 'today': return "Aujourd'hui";
    case 'upcoming': return 'À venir';
    case 'cancelled': return 'Annulé';
    case 'past': return 'Terminé';
    default: return '';
  }
}

/** « 22:00 » si la fin tombe le même jour (heure de Paris), sinon la date complète ; null sans `ends_at`. */
export function formatEventEnd(event) {
  if (!event?.ends_at) return null;
  const s = new Date(event.starts_at);
  const e = new Date(event.ends_at);
  if (Number.isNaN(e.getTime()) || Number.isNaN(s.getTime())) return null;
  const day = (d) => d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  if (day(s) === day(e)) return e.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return formatEventDate(event.ends_at);
}

/**
 * Instant ISO → Date dont les composantes *locales* reproduisent l'heure murale de Paris :
 * c'est la convention de `calendarLinks` (`DTSTART;TZID=Europe/Paris` recopie ces composantes).
 */
export function parisWallDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const get = (type) => Number(parts.find(p => p.type === type)?.value);
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), 0, 0);
}

/** Événement calendrier (`openCalendar`) d'un événement du salon accepté ; null si la date est illisible. */
export function buildSalonCalendarEvent(event) {
  const start = parisWallDate(event?.starts_at);
  if (!start) return null;
  const end = (event.ends_at && parisWallDate(event.ends_at)) || new Date(start.getTime() + DEFAULT_DURATION_MS);
  const lines = [];
  if (event.description) lines.push(String(event.description).trim());
  lines.push(`Prix : ${formatPrice(event.price)}`);
  if (event.dress_code) lines.push(`Tenue : ${event.dress_code}`);
  const guests = Number(event.my_invite?.guests) || 0;
  if (guests > 1) lines.push(`${guests} places réservées`);
  return {
    title: `D'Home Barber · ${event.title}`,
    description: lines.join('\n'),
    location: event.location || SALON_LOCATION,
    start,
    end,
    uid: `salon-event-${event.id}@dhomebarber.fr`,
  };
}

/** Cibles « Ajouter au calendrier » (mêmes libellés que Mes rendez-vous). */
export const CALENDAR_TARGETS = [
  { kind: 'google', label: 'Google Agenda' },
  { kind: 'ics', label: 'Apple / Outlook' },
];
