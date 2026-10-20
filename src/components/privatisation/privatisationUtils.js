/**
 * Privatiser le salon : constantes, règles et textes partagés par la page (`pages/Events.jsx`), la
 * demande de devis (`RequestSheet`) et le suivi des demandes. Fonctions pures, sans React.
 *
 * Règles serveur reprises ici (routes/entities.js, CREATE_RULES.events et accessControl) :
 * - une privatisation `confirmed` bloque sa fenêtre : matinée 9h-14h, après-midi 14h-20h,
 *   journée 9h-20h (mêmes fenêtres que `PRIVATE_WINDOWS` de lib/slots.js) ; un créneau inconnu
 *   vaut la journée complète ;
 * - date `AAAA-MM-JJ` d'aujourd'hui ou plus tard (jour de Paris), créneau dans `TIME_SLOTS`,
 *   1 à 500 personnes (l'app s'arrête à 30), message ≤ 2000 caractères ;
 * - le client ne fait qu'accepter (`accepted`) ou refuser (`declined`) un devis `quoted`.
 */
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Briefcase, Cake, Crown, Sparkles } from 'lucide-react';
import { SALON_LOCATION, toLocalDate } from '@/lib/calendarLinks';

// ---------------------------------------------------------------------------------------------
// Salon
// ---------------------------------------------------------------------------------------------

export const SALON_PHONE_FALLBACK = '06 66 08 36 05';
export const MAPS_URL = 'https://maps.google.com/?q=3+Rue+du+Bois+Arquet+74140+Douvaine';
export const SALON_ADDRESS_LINE = '3 Rue du Bois Arquet, Douvaine · sur le côté gauche du bâtiment Odyssée';

/** `tel:` d'un numéro affiché (« 06 66 08 36 05 » → `tel:0666083605`, le « + » est gardé). */
export function phoneHref(display) {
  const digits = String(display || '').replace(/[^\d+]/g, '');
  return `tel:${digits || SALON_PHONE_FALLBACK.replace(/\s/g, '')}`;
}

// ---------------------------------------------------------------------------------------------
// Occasions et formats
// ---------------------------------------------------------------------------------------------

/**
 * Occasions proposées. `id` = valeur attendue par le serveur (`EVENT_TYPES` du backend : evjg,
 * anniversaire, team_building, autre). Le salon reçoit une clientèle masculine : pas d'EVJF.
 * `honorIdea` : idée propre à l'occasion, ajoutée aux idées du message (`ideasFor`).
 */
export const EVENT_TYPES = [
  {
    id: 'evjg', label: 'EVJG', icon: Crown,
    desc: 'Enterrement de vie de jeune garçon',
    pitch: 'Le futur marié et sa bande, avant le grand jour.',
    honorIdea: "Le futur marié à l'honneur",
  },
  {
    id: 'anniversaire', label: 'Anniversaire', icon: Cake,
    desc: "Fête d'anniversaire",
    pitch: 'Votre fête entre potes, au salon.',
    honorIdea: "Le fêté à l'honneur",
  },
  {
    id: 'team_building', label: 'Team building', icon: Briefcase,
    desc: "Événement d'entreprise",
    pitch: "Votre équipe au salon, le temps d'une matinée ou d'une journée.",
  },
  {
    id: 'autre', label: 'Sur mesure', icon: Sparkles,
    desc: 'Événement personnalisé',
    pitch: 'Tournage, shooting, soirée : dites-nous tout.',
  },
];

export const eventTypeOf = (id) => EVENT_TYPES.find(t => t.id === id) || null;
export const eventTypeLabel = (id) => eventTypeOf(id)?.label || 'Privatisation';
/** Icône d'une occasion (Sparkles pour un type inconnu d'une ancienne demande). */
export const eventTypeIcon = (id) => eventTypeOf(id)?.icon || Sparkles;

/** Formats de privatisation : fenêtres identiques au serveur (`EVENT_SLOT_WINDOWS`). */
export const TIME_SLOTS = [
  { id: 'morning', label: 'Matinée', hours: '9h – 14h', start: '09:00', end: '14:00', durationLabel: '5 heures', shortDuration: '5 h' },
  { id: 'afternoon', label: 'Après-midi', hours: '14h – 20h', start: '14:00', end: '20:00', durationLabel: '6 heures', shortDuration: '6 h' },
  { id: 'full_day', label: 'Journée', hours: '9h – 20h', start: '09:00', end: '20:00', durationLabel: '11 heures', shortDuration: '11 h' },
];
export const DEFAULT_SLOT = 'full_day';
export const slotOf = (id) => TIME_SLOTS.find(s => s.id === id) || null;
/** Libellé complet d'un créneau : « Journée · 9h – 20h ». */
export const slotLabel = (id) => {
  const s = slotOf(id);
  return s ? `${s.label} · ${s.hours}` : '';
};

const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// ---------------------------------------------------------------------------------------------
// Heure de Paris
// ---------------------------------------------------------------------------------------------

const PARIS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Horloge de Paris : `{ key: 'AAAA-MM-JJ', minutes: minutes depuis minuit }`. */
export function parisClock(now = new Date()) {
  const parts = Object.fromEntries(PARIS_PARTS.formatToParts(now).map(p => [p.type, p.value]));
  return {
    key: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

const keyParts = (key) => String(key || '').slice(0, 10).split('-').map(Number);

/** Jour `AAAA-MM-JJ` → Date à midi heure de l'appareil (même jour du calendrier, sans saut d'heure). */
export function dateOfKey(key) {
  const [y, m, d] = keyParts(key);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 12);
}

/** Date (heure de l'appareil) → `AAAA-MM-JJ`. */
export const keyOfDate = (date) => format(date, 'yyyy-MM-dd');

/** Nombre de jours entre deux clés `AAAA-MM-JJ` (b − a), indépendant des fuseaux. */
export function daysBetween(aKey, bKey) {
  const [ay, am, ad] = keyParts(aKey);
  const [by, bm, bd] = keyParts(bKey);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Date d'une demande. `long` : « Samedi 21 novembre 2026 » ; `day` : « Samedi 21 novembre » ;
 * `medium` : « Sam. 21 nov. » ; `short` : « sam. 21 nov. » (dans une phrase).
 */
export function formatEventDate(key, style = 'long') {
  if (!key) return '';
  const date = dateOfKey(key);
  if (style === 'day') return capitalize(format(date, 'EEEE d MMMM', { locale: fr }));
  if (style === 'medium') return capitalize(format(date, 'EEE d MMM', { locale: fr }));
  if (style === 'short') return format(date, 'EEE d MMM', { locale: fr });
  return capitalize(format(date, 'EEEE d MMMM yyyy', { locale: fr }));
}

/** Compte à rebours d'une privatisation : `{ big, small }` (« J-33 », « dans 33 jours »). */
export function countdown(key, clock = parisClock()) {
  const n = daysBetween(clock.key, key);
  if (n <= 0) return { big: "Aujourd'hui", small: "c'est le jour J" };
  if (n === 1) return { big: 'Demain', small: 'J-1' };
  return { big: `J-${n}`, small: `dans ${n} jours` };
}

// ---------------------------------------------------------------------------------------------
// Disponibilités (privatisations confirmées)
// ---------------------------------------------------------------------------------------------

/**
 * Index des créneaux pris par jour : Map `AAAA-MM-JJ` → Set d'ids de `TIME_SLOTS`. Seules les
 * privatisations `confirmed` comptent (règle du serveur). Matinée prise → matinée + journée ;
 * après-midi → après-midi + journée ; journée (ou créneau inconnu) → tout ; matinée et après-midi
 * pris → journée prise aussi.
 */
export function buildBlockedIndex(confirmedEvents) {
  const index = new Map();
  for (const ev of Array.isArray(confirmedEvents) ? confirmedEvents : []) {
    if (!ev || (ev.status && ev.status !== 'confirmed')) continue;
    const key = String(ev.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const set = index.get(key) || new Set();
    const slot = slotOf(ev.time_slot) ? ev.time_slot : 'full_day';
    if (slot === 'morning') { set.add('morning'); set.add('full_day'); }
    else if (slot === 'afternoon') { set.add('afternoon'); set.add('full_day'); }
    else { set.add('morning'); set.add('afternoon'); set.add('full_day'); }
    if (set.has('morning') && set.has('afternoon')) set.add('full_day');
    index.set(key, set);
  }
  return index;
}

/** Créneaux pris d'un jour (Set, vide si aucun). */
export const blockedSlotsOn = (key, index) => index?.get(key) || new Set();

/**
 * État d'un créneau un jour donné : `past` (jour passé, ou aujourd'hui après son heure de
 * début à Paris), `taken` (privatisé), sinon `free`.
 */
export function slotState(slotId, key, index, clock = parisClock()) {
  if (!key || key < clock.key) return 'past';
  if (blockedSlotsOn(key, index).has(slotId)) return 'taken';
  const slot = slotOf(slotId);
  if (key === clock.key && slot && clock.minutes >= minutesOf(slot.start)) return 'past';
  return 'free';
}

/**
 * État d'un jour du calendrier : `past` (passé, ou plus aucun créneau qui commence plus tard
 * aujourd'hui), `full` (aucun créneau libre), `partial` (une partie déjà privatisée), `free`.
 */
export function dayState(key, index, clock = parisClock()) {
  if (!key || key < clock.key) return 'past';
  const states = TIME_SLOTS.map(s => slotState(s.id, key, index, clock));
  if (states.every(s => s === 'past')) return 'past';
  if (!states.includes('free')) return 'full';
  if (states.includes('taken')) return 'partial';
  return 'free';
}

/** Créneau à présélectionner : `preferred` s'il est libre, sinon le premier libre, sinon ''. */
export function firstFreeSlot(key, index, clock = parisClock(), preferred = DEFAULT_SLOT) {
  if (preferred && slotState(preferred, key, index, clock) === 'free') return preferred;
  return TIME_SLOTS.find(s => slotState(s.id, key, index, clock) === 'free')?.id || '';
}

/** Mois proposés dans le calendrier : le mois en cours et les 12 suivants. */
export const MAX_MONTHS_AHEAD = 12;

/** Premier jour du mois d'une clé : `{ year, month }` (month 0-11). */
export function monthOfKey(key) {
  const [y, m] = keyParts(key);
  return { year: y, month: (m || 1) - 1 };
}

/** Décale un mois `{ year, month }` de `delta` mois. */
export function addMonths({ year, month }, delta) {
  const d = new Date(year, month + delta, 1, 12);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Écart en mois entre deux mois `{ year, month }` (b − a). */
export const monthsBetween = (a, b) => (b.year - a.year) * 12 + (b.month - a.month);

/** Titre d'un mois : « Novembre 2026 ». */
export const monthTitle = ({ year, month }) => capitalize(format(new Date(year, month, 1, 12), 'MMMM yyyy', { locale: fr }));

/**
 * Grille d'un mois, semaines commençant le lundi : tableau de semaines, chacune de 7 cases
 * `{ key, day }` ou `null` (case vide hors du mois).
 */
export function monthGrid({ year, month }) {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  const lead = (first.getDay() + 6) % 7; // lundi = 0
  const cells = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ key: keyOfDate(new Date(year, month, day, 12)), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const WEEKDAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ---------------------------------------------------------------------------------------------
// Groupe et message
// ---------------------------------------------------------------------------------------------

export const GUEST_MIN = 1;
export const GUEST_MAX = 30;
export const DEFAULT_GUESTS = 6;
/** Raccourcis du nombre de personnes (20 s'affiche « 20+ » : le − / + va jusqu'à 30). */
export const GUEST_CHIPS = [4, 6, 8, 10, 15, 20];
export const guestChipLabel = (n) => (n === 20 ? '20+' : String(n));
export const clampGuests = (n) => Math.min(GUEST_MAX, Math.max(GUEST_MIN, Math.round(Number(n) || GUEST_MIN)));

export const MESSAGE_MAX = 2000;

const BASE_IDEAS = ['Une coupe pour chacun', 'Barbe pour tous', 'Boissons sur place ?', 'Photos souvenirs', 'Notre playlist'];

/** Idées en un tap pour une occasion (l'idée « à l'honneur » de l'occasion en 3e position). */
export function ideasFor(typeId) {
  const honor = eventTypeOf(typeId)?.honorIdea;
  if (!honor) return [...BASE_IDEAS];
  return [...BASE_IDEAS.slice(0, 2), honor, ...BASE_IDEAS.slice(2)];
}

/** Ligne écrite dans le message pour une idée (point final ajouté si elle n'a pas de ponctuation). */
export const ideaLine = (idea) => (/[.?!]$/.test(idea) ? idea : `${idea}.`);

const messageLines = (message) => String(message || '').split('\n').map(l => l.trim());

/** L'idée est déjà dans le message (ligne identique) : la puce s'affiche cochée. */
export const hasIdea = (message, idea) => messageLines(message).includes(ideaLine(idea));

/**
 * Ajoute l'idée en fin de message (nouvelle ligne) ou retire sa ligne si elle y est déjà.
 * Ne dépasse jamais `MESSAGE_MAX` : si l'ajout ne tient pas, le message est rendu inchangé.
 */
export function toggleIdea(message, idea) {
  const text = String(message || '');
  const line = ideaLine(idea);
  if (hasIdea(text, idea)) {
    const lines = text.split('\n');
    const i = lines.findIndex(l => l.trim() === line);
    lines.splice(i, 1);
    return lines.join('\n').replace(/^\n+|\n+$/g, '');
  }
  const next = text.trim() ? `${text.replace(/\s+$/, '')}\n${line}` : line;
  return next.length > MESSAGE_MAX ? text : next;
}

/** Le compte n'a pas de téléphone : la demande le demande (le serveur prend celui du corps). */
export const needsPhone = (user) => !String(user?.phone || '').trim();
/** Téléphone saisi plausible : au moins 9 chiffres, 30 caractères au plus. */
export const phoneValid = (value) => {
  const v = String(value || '').trim();
  return v.length <= 30 && v.replace(/\D/g, '').length >= 9;
};

/** Brouillon vide d'une demande. */
export const emptyDraft = () => ({
  event_type: '', date: '', time_slot: DEFAULT_SLOT, guest_count: DEFAULT_GUESTS, message: '', phone: '',
});

/**
 * Corps envoyé à `Event.create`. Identité recopiée comme avant (le serveur la relit de toute façon
 * dans le jeton et la table `users`) ; `client_phone` = téléphone du compte, sinon celui saisi.
 * `barbers` : fiches publiques (les fiches de test `is_hidden` sont retirées).
 */
export function buildRequestPayload({ draft, user, barbers = [] }) {
  const message = String(draft.message || '').trim().slice(0, MESSAGE_MAX);
  return {
    event_type: draft.event_type,
    date: draft.date,
    time_slot: draft.time_slot,
    guest_count: clampGuests(draft.guest_count),
    message,
    client_name: user?.full_name || '',
    client_email: user?.email || '',
    client_phone: String(user?.phone || '').trim() || String(draft.phone || '').trim(),
    employees: barbers.filter(e => e && !e.is_hidden).map(e => ({ id: e.id, name: e.name })),
    status: 'pending',
  };
}

/**
 * Brouillon prêt à l'envoi ? `{ ok, reason }` avec la première raison lisible (étape à corriger).
 * `step` : 'occasion' | 'date' | 'group'.
 */
export function validateDraft(draft, { user, index, clock = parisClock() } = {}) {
  if (!eventTypeOf(draft.event_type)) return { ok: false, step: 'occasion', reason: "Choisissez l'occasion" };
  if (!draft.date) return { ok: false, step: 'date', reason: 'Choisissez une date' };
  if (!slotOf(draft.time_slot)) return { ok: false, step: 'date', reason: 'Choisissez un créneau' };
  const state = slotState(draft.time_slot, draft.date, index, clock);
  if (state === 'taken') return { ok: false, step: 'date', reason: 'Ce créneau est déjà privatisé : choisissez-en un autre' };
  if (state === 'past') return { ok: false, step: 'date', reason: 'Ce créneau est déjà passé : choisissez-en un autre' };
  if (needsPhone(user) && !phoneValid(draft.phone)) return { ok: false, step: 'group', reason: 'Indiquez un numéro pour que le salon puisse vous rappeler' };
  if (String(draft.message || '').length > MESSAGE_MAX) return { ok: false, step: 'group', reason: `Message trop long (${MESSAGE_MAX} caractères au plus)` };
  return { ok: true, step: null, reason: '' };
}

// ---------------------------------------------------------------------------------------------
// Suivi des demandes
// ---------------------------------------------------------------------------------------------

export const STAGES = [
  { id: 'sent', label: 'Envoyée' },
  { id: 'quote', label: 'Devis' },
  { id: 'accepted', label: 'Accepté' },
  { id: 'confirmed', label: 'Confirmé' },
];

const priceOf = (ev) => (Number(ev?.price) > 0 ? Number(ev.price) : 0);

/**
 * Vue d'une demande pour l'affichage.
 * - `kind` : pending | quoted | accepted | confirmed | past | expired | declined | cancelled
 *   (`past` = confirmée dont la date est passée ; `expired` = jamais confirmée et date passée)
 * - `stage` : index de l'étape en cours dans `STAGES` (les précédentes sont faites) ; 4 = toutes
 *   faites ; `null` = pas de frise (refusée, annulée, passée)
 * - `statusLabel`, `tone` (amber | green | muted | red), `hint` (phrase d'explication ou '')
 * - `needsAnswer` : devis à accepter ou refuser ; `canAccept` / `canDecline`
 */
export function requestView(ev, clock = parisClock()) {
  const key = String(ev?.date || '').slice(0, 10);
  const isPast = !!key && key < clock.key;
  const price = priceOf(ev);
  const base = { key, isPast, price, needsAnswer: false, canAccept: false, canDecline: false, hint: '' };
  switch (ev?.status) {
    case 'cancelled':
      return { ...base, kind: 'cancelled', stage: null, statusLabel: 'Annulée', tone: 'muted' };
    case 'declined':
      // `answered_at` n'est posé que par la réponse du client : sans lui, c'est le salon qui a refusé
      // (même avec un prix déjà saisi par l'admin sur une demande en attente)
      return { ...base, kind: 'declined', stage: null, statusLabel: ev?.answered_at ? 'Devis refusé' : 'Non retenue', tone: 'muted' };
    case 'confirmed':
      if (isPast) return { ...base, kind: 'past', stage: null, statusLabel: 'Passée', tone: 'muted' };
      return { ...base, kind: 'confirmed', stage: 4, statusLabel: 'Confirmée', tone: 'green' };
    case 'accepted':
      if (isPast) return { ...base, kind: 'expired', stage: null, statusLabel: 'Date passée', tone: 'muted' };
      return {
        ...base, kind: 'accepted', stage: 3, statusLabel: 'Devis accepté', tone: 'green',
        hint: 'Passez au salon pour régler : le salon confirmera ensuite votre date.',
      };
    case 'quoted':
      if (isPast) {
        return {
          ...base, kind: 'expired', stage: null, statusLabel: 'Date passée', tone: 'muted', canDecline: price > 0,
          hint: 'La date est passée : contactez le salon.',
        };
      }
      if (!price) {
        return {
          ...base, kind: 'quoted', stage: 1, statusLabel: 'Devis en cours', tone: 'amber',
          hint: 'Le salon met votre devis à jour.',
        };
      }
      return {
        ...base, kind: 'quoted', stage: 2, statusLabel: 'Devis reçu', tone: 'amber',
        needsAnswer: true, canAccept: true, canDecline: true,
      };
    default: // pending (ou statut inconnu)
      if (isPast) return { ...base, kind: 'expired', stage: null, statusLabel: 'Date passée', tone: 'muted' };
      return {
        ...base, kind: 'pending', stage: 1, statusLabel: 'Devis en cours', tone: 'amber',
        hint: "Le salon prépare votre devis. Vous serez prévenu par notification et par email dès qu'il est prêt.",
      };
  }
}

/**
 * Répartition des demandes du client :
 * - `spotlight` : en tête de page, devis à accepter puis privatisations confirmées à venir
 *   (les plus proches d'abord) ;
 * - `active` : demandes en cours (devis en préparation, devis accepté), les plus proches d'abord ;
 * - `history` : refusées, annulées, passées, les plus récentes d'abord.
 * Chaque élément : `{ event, view }`.
 */
export function groupRequests(events, clock = parisClock()) {
  const items = (Array.isArray(events) ? events : []).filter(Boolean).map(event => ({ event, view: requestView(event, clock) }));
  const byDateAsc = (a, b) => (a.view.key || '9999').localeCompare(b.view.key || '9999');
  const byDateDesc = (a, b) => (b.view.key || '').localeCompare(a.view.key || '');
  const quotes = items.filter(i => i.view.needsAnswer).sort(byDateAsc);
  const confirmed = items.filter(i => i.view.kind === 'confirmed').sort(byDateAsc);
  const active = items.filter(i => i.view.kind === 'pending' || i.view.kind === 'accepted' || (i.view.kind === 'quoted' && !i.view.needsAnswer)).sort(byDateAsc);
  const history = items.filter(i => ['past', 'expired', 'declined', 'cancelled'].includes(i.view.kind)).sort(byDateDesc);
  return { spotlight: [...quotes, ...confirmed], active, history, total: items.length };
}

/** Prix par personne arrondi à l'euro (« soit environ 49 € par personne »), `null` sous 2 personnes. */
export function pricePerPerson(price, guests) {
  const p = Number(price);
  const g = Number(guests);
  if (!(p > 0) || !(g >= 2)) return null;
  return Math.round(p / g);
}

/** Événement de calendrier d'une privatisation confirmée (UID stable : pas de doublon). */
export function privatisationCalendarEvent(ev) {
  const slot = slotOf(ev?.time_slot) || slotOf('full_day');
  const key = String(ev?.date || '').slice(0, 10);
  const guests = Number(ev?.guest_count) > 0 ? ` · ${ev.guest_count} personnes` : '';
  return {
    title: `D'Home Barber · Privatisation (${eventTypeLabel(ev?.event_type)})`,
    description: `${slot.label} ${slot.hours}${guests}`,
    location: SALON_LOCATION,
    start: toLocalDate(key, slot.start),
    end: toLocalDate(key, slot.end),
    uid: ev?.id != null ? `privatisation-${ev.id}@dhomebarber.fr` : undefined,
  };
}

/** Ancre d'une demande dans la page (« Voir ma demande » après l'envoi). */
export const requestAnchorId = (id) => `privatisation-${id}`;

// ---------------------------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------------------------

/** Message lisible d'une erreur d'API : celui du serveur s'il existe, sinon le repli. */
export function serverMessage(err, fallback) {
  const message = err?.data?.error || err?.message;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Pas de connexion internet, réessayez.';
  if (/failed to fetch|load failed|networkerror/i.test(String(message || ''))) return 'Pas de connexion internet, réessayez.';
  return message && !/^HTTP \d+$/.test(message) ? message : fallback;
}

/**
 * La demande a été refusée pour sa date ou son créneau (date passée, créneau invalide ou pris
 * entre-temps) : la demande revient à l'étape Date avec les disponibilités rechargées.
 */
export function isDateProblem(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 409) return true;
  if (status !== 400) return false;
  return /date|créneau|creneau/i.test(String(err?.data?.error || err?.message || ''));
}
