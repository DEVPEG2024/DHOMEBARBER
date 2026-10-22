/**
 * Créneaux Last Minute encore libres, montrés sur l'accueil (`components/home/LastMinuteSection`).
 * Le salon les publie depuis l'agenda (Agenda.jsx, « Last Minute ») : ligne `appointments` au
 * statut `last_minute`, sans client. Une réservation client sur ce créneau la reprend côté serveur
 * (claimLastMinute) : elle passe `confirmed` et disparaît d'ici ; un créneau que personne n'a pris
 * passe `no_show` à l'heure. Un client ne lit que les colonnes de créneau (id, employee_id,
 * employee_name, date, start_time, end_time, status) et `blocks_client`, calculé par le serveur :
 * faux tant que personne n'est rattaché au créneau.
 *
 * **Le jour même seulement** (demande du propriétaire, 20 oct. 2026) : un créneau de demain
 * n'apparaît sur l'accueil que demain. Tous les clients sont prévenus automatiquement 3 h avant
 * son début, jamais avant 8 h (serveur : jobs/lastMinuteAutoPush.js).
 */
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '@/api/apiClient';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { parisDay } from '@/lib/slots';
import { parisInstant } from '@/lib/calendarLinks';
import { isNative } from '@/lib/capacitor';

/**
 * Clé sous le préfixe `appointments` : une réservation (Booking.jsx), une annulation ou un
 * déplacement (Appointments.jsx) et toute modification de l'agenda (`invalidateAppointmentQueries`)
 * relisent aussi les Last Minute (sinon le client revoyait le créneau qu'il venait de prendre).
 */
export const LAST_MINUTE_QUERY_KEY = ['appointments', 'last-minute'];
/** Cartes au plus dans le carrousel de l'accueil. */
export const MAX_LAST_MINUTE_SLOTS = 6;
/**
 * Une carte disparaît 10 min avant le début du créneau : le lien ouvre d'abord le choix des
 * prestations, le client arriverait trop tard (« plus disponible »).
 */
export const LAST_MINUTE_MIN_LEAD_MS = 10 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const hhmm = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};
const toMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const parisDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Jour de Paris (AAAA-MM-JJ) de l'instant `now`. */
export const parisDateKey = (now = Date.now()) => parisDateFmt.format(new Date(now));

/**
 * Créneaux à montrer, du plus proche au plus lointain : statut `last_minute`, **du jour** (Paris),
 * libre pour un client (`blocks_client` pas vrai), qui commence dans plus de 10 min, barber visible
 * des clients (fiche publique, pas de fiche de test). Un même barber, jour et heure n'apparaît
 * qu'une fois. Tous les créneaux sont rendus (le carrousel en garde `MAX_LAST_MINUTE_SLOTS`).
 * Chaque élément : `{ id, employeeId, barber, date, start, end, startsAt }`.
 */
export function selectOpenLastMinutes(rows, barbers, now = Date.now()) {
  const today = parisDateKey(now);
  const byId = new Map((Array.isArray(barbers) ? barbers : [])
    .filter((b) => b && !b.is_hidden)
    .map((b) => [String(b.id), b]));
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.status !== 'last_minute' || row.blocks_client === true) continue;
    const date = String(row.date || '').slice(0, 10);
    const start = hhmm(row.start_time);
    if (!DATE_RE.test(date) || !TIME_RE.test(start)) continue;
    // Le jour même seulement (une réponse en cache de la veille ne remontre pas ses créneaux)
    if (date !== today) continue;
    const startsAt = parisInstant(date, start);
    if (!(startsAt > now + LAST_MINUTE_MIN_LEAD_MS)) continue;
    const barber = byId.get(String(row.employee_id));
    if (!barber) continue;
    const key = `${row.employee_id}|${date}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const end = hhmm(row.end_time);
    out.push({ id: row.id, employeeId: row.employee_id, barber, date, start, end: end > start ? end : '', startsAt });
  }
  out.sort((a, b) => a.startsAt - b.startsAt);
  return out;
}

/**
 * Réservation confirmée (Booking.jsx) : retire tout de suite des Last Minute en cache ceux que le
 * serveur vient de reprendre ou d'annuler (même id, ou même barber et même jour avec des plages
 * qui se chevauchent, comme claimLastMinute). Sans cela, l'accueil remontrait le créneau pris le
 * temps de relire la liste. À appeler avant d'invalider `['appointments']` : écrire dans le cache
 * après l'invalidation la rendrait inopérante.
 */
export function forgetBookedLastMinute(queryClient, booked) {
  if (!queryClient || !booked) return;
  const id = booked.id != null ? String(booked.id) : null;
  const date = String(booked.date || '').slice(0, 10);
  const start = toMinutes(booked.start_time);
  const endRaw = toMinutes(booked.end_time);
  const end = start == null ? null : (endRaw != null && endRaw > start ? endRaw : start + 1);
  queryClient.setQueriesData({ queryKey: LAST_MINUTE_QUERY_KEY }, (rows) => {
    if (!Array.isArray(rows)) return rows;
    const kept = rows.filter((row) => {
      if (!row) return false;
      if (id && String(row.id) === id) return false;
      if (start == null || String(row.employee_id) !== String(booked.employee_id) || String(row.date || '').slice(0, 10) !== date) return true;
      const rowStart = toMinutes(row.start_time);
      if (rowStart == null) return true;
      const rowEndRaw = toMinutes(row.end_time);
      const rowEnd = rowEndRaw != null && rowEndRaw > rowStart ? rowEndRaw : rowStart + 1;
      return !(rowStart < end && start < rowEnd);
    });
    return kept.length === rows.length ? rows : kept;
  });
}

/** Lien de réservation du créneau : barber, jour et heure déjà choisis (Booking.jsx les applique). */
export function lastMinuteBookingUrl(slot) {
  const q = new URLSearchParams({ barber: String(slot.employeeId), date: slot.date, time: slot.start });
  return `/booking?${q.toString()}`;
}

/** Prénom affiché du barber (« avec Kevin »). */
export const barberFirstName = (barber) => String(barber?.name || '').trim().split(/\s+/)[0] || 'votre barber';

/**
 * Adresse publique du site, pour un lien envoyé à quelqu'un d'autre : dans les apps,
 * `window.location.origin` vaut capacitor://localhost (iOS) ou https://localhost (Android).
 */
const PUBLIC_SITE = 'https://dhomebarber.fr';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Message « Envoyer à un ami » d'un créneau : texte au tutoiement (un client écrit à un ami) et
 * lien public. Lien `https://dhomebarber.fr/lm/<id>` (21 oct. 2026) : la page d'aperçu du serveur
 * (routes/share.js, relayée par vercel.json) donne aux messageries une belle carte (image du
 * créneau, titre, description) puis renvoie vers la réservation pré-remplie avec
 * `src=partage-last-minute` (provenance dans Admin → Trafic). Identifiant illisible : lien direct
 * vers la réservation, comme avant. Un ami sans compte passe par la connexion, qui le ramène ici.
 */
export function lastMinuteShareContent(slot, now = Date.now()) {
  const { day } = lastMinuteLabels(slot, now);
  const when = day === "Aujourd'hui" || day === 'Demain' ? day.toLowerCase() : `le ${day.toLowerCase()}`;
  const id = String(slot.id ?? '');
  return {
    title: "Last Minute · D'Home Barber",
    text: `⚡ Place Last Minute chez D'Home Barber : ${when} à ${slot.start} avec ${barberFirstName(slot.barber)}. Réserve vite :`,
    url: UUID_RE.test(id)
      ? `${PUBLIC_SITE}/lm/${id.toLowerCase()}`
      : `${PUBLIC_SITE}${lastMinuteBookingUrl(slot)}&src=partage-last-minute`,
  };
}

/**
 * Ouvre le partage du téléphone pour un créneau. Rend `'shared'`, `'cancelled'` (partage refermé
 * par le client), `'copied'` (lien copié faute de partage : navigateur d'ordinateur) ou `'failed'`.
 * Apps : feuille de partage du système (`@capacitor/share` ; la WebView Android n'a pas
 * `navigator.share`). Web : `navigator.share` appelé sans attente avant lui (il exige le geste
 * du client), puis le presse-papier.
 */
export async function shareLastMinute(slot, now = Date.now()) {
  const { title, text, url } = lastMinuteShareContent(slot, now);
  if (isNative) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Envoyer à un ami' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      // Module absent ou refus du système : les voies du web prennent le relais
    }
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Partage refusé (geste trop ancien, appli cible en échec) : copie du lien
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Libellés d'un créneau : `day` (« Aujourd'hui », « Demain », sinon « Mer. 22 oct. »), `chip`
 * (aujourd'hui : « dans 45 min » / « dans 1 h 25 » ; plus tard : la date courte), `live`
 * (vrai pour un compte à rebours : le point « en direct » ne s'affiche que devant lui).
 */
export function lastMinuteLabels(slot, now = Date.now()) {
  const today = parisDay(0).key;
  const tomorrow = parisDay(1).key;
  const [y, m, d] = slot.date.split('-').map(Number);
  const shortDate = format(new Date(y, m - 1, d, 12), 'EEE d MMM', { locale: fr });
  const day = slot.date === today ? "Aujourd'hui" : slot.date === tomorrow ? 'Demain' : shortDate.charAt(0).toUpperCase() + shortDate.slice(1);
  const minutes = Math.max(0, Math.ceil((slot.startsAt - now) / 60000));
  let chip;
  if (slot.date !== today) chip = shortDate;
  else if (minutes < 60) chip = `dans ${Math.max(1, minutes)} min`;
  else {
    const h = Math.floor(minutes / 60);
    const rest = minutes % 60;
    chip = rest ? `dans ${h} h ${String(rest).padStart(2, '0')}` : `dans ${h} h`;
  }
  return { day, chip, live: slot.date === today };
}

/** Horloge locale des cartes Last Minute : avance toutes les 30 s et au retour sur l'app. */
export function useLastMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 30 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return now;
}

/**
 * Publication Last Minute du fil (`kind = 'last_minute'`, posée par le serveur, 22 oct. 2026) :
 * son créneau au format des cartes de l'accueil, ou null s'il est commencé, d'un autre jour, ou si
 * son barber n'est plus visible (mêmes règles que `selectOpenLastMinutes`). Le serveur retire la
 * publication quand le créneau n'est plus libre ; ceci couvre l'intervalle entre deux passages.
 */
export function lastMinuteSlotOfPost(post, barbers, now = Date.now()) {
  const meta = post && post.kind === 'last_minute' && post.meta && typeof post.meta === 'object' ? post.meta : null;
  if (!meta) return null;
  const row = {
    id: post.appointment_id, status: 'last_minute', employee_id: meta.employee_id,
    date: meta.date, start_time: meta.start_time, end_time: meta.end_time,
  };
  return selectOpenLastMinutes([row], barbers, now)[0] || null;
}

/**
 * Créneaux Last Minute libres **du jour** : `{ slots, total, now }` (`slots` limité à
 * `MAX_LAST_MINUTE_SLOTS`). Relu chaque minute et au retour sur l'app ; l'horloge locale avance
 * toutes les 30 s (compte à rebours, créneau commencé retiré).
 * Ne rejette jamais : en échec, aucune carte (la section se cache).
 */
export function useOpenLastMinutes({ enabled = true } = {}) {
  const now = useLastMinuteClock();

  // Jour de Paris recalculé avec l'horloge : à minuit la requête passe au nouveau jour
  const today = parisDay(0).key;
  const slotsQuery = useQuery({
    queryKey: [...LAST_MINUTE_QUERY_KEY, today],
    queryFn: () => api.entities.Appointment.filter({ status: 'last_minute', date: [today] }, 'start_time', 50),
    enabled,
    // À minuit la clé change : la réponse de la veille sert le temps de relire, ses créneaux sont
    // écartés par la date (selectOpenLastMinutes)
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  // Même requête et même clé que l'accueil et la réservation (cache partagé)
  const barbersQuery = useQuery({
    queryKey: ['employees'],
    queryFn: fetchPublicBarbers,
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const open = useMemo(
    () => selectOpenLastMinutes(slotsQuery.data, barbersQuery.data, now),
    [slotsQuery.data, barbersQuery.data, now],
  );
  // `total` : tous les créneaux libres (l'en-tête du carrousel le dit quand il en montre moins)
  return { slots: open.slice(0, MAX_LAST_MINUTE_SLOTS), total: open.length, now };
}
