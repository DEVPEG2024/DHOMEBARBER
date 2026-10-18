import { parisInstant } from '@/lib/calendarLinks';

/** Début / fin d'un rendez-vous à l'heure de Paris (sans heure de fin : son début, sinon fin de journée). */
export const startsAt = (apt) => parisInstant(apt.date, apt.start_time || '00:00');
export const endsAt = (apt) => parisInstant(apt.date, apt.end_time || apt.start_time || '23:59');

/** Une visite = rendez-vous honoré (confirmé ou terminé) dont l'heure de fin est passée. */
export const VISIT_STATUSES = ['confirmed', 'completed'];

/** Commandes encore en cours (ni retirées, ni annulées). */
export const OPEN_ORDER_STATUSES = ['pending', 'confirmed', 'ready'];

const parisDayKey = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

const dayLabel = (instant) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' }).format(instant);

/** Prochain rendez-vous confirmé pas encore terminé, ou null. */
export function nextAppointment(appointments, now = Date.now()) {
  return (Array.isArray(appointments) ? appointments : [])
    .filter((a) => a?.date && a.status === 'confirmed' && endsAt(a) > now)
    .sort((a, b) => startsAt(a) - startsAt(b))[0] || null;
}

/**
 * Libellé du compte à rebours d'un rendez-vous : « En cours », « Dans 45 min »,
 * « Aujourd'hui à 14:30 », « Demain à 14:30 », sinon « Dans 3 jours » + la date.
 * `live` : le rendez-vous est aujourd'hui (pastille animée).
 */
export function countdownFor(apt, now = Date.now()) {
  const start = startsAt(apt);
  const time = String(apt.start_time || '').slice(0, 5);
  const diffMin = Math.round((start - now) / 60000);
  const today = parisDayKey(new Date(now));
  const day = parisDayKey(start);
  const tomorrow = parisDayKey(new Date(now + 86400000));
  if (diffMin <= 0) return { main: 'En cours', sub: `depuis ${time}`, live: true };
  if (diffMin < 60) return { main: `Dans ${diffMin} min`, sub: `à ${time}`, live: true };
  if (day === today) return { main: "Aujourd'hui", sub: `à ${time}`, live: true };
  if (day === tomorrow) return { main: 'Demain', sub: `à ${time}`, live: false };
  // Nombre de jours calendaires (heure de Paris), pas de 24 h
  const days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return { main: `Dans ${days} jours`, sub: `${dayLabel(start)} · ${time}`, live: false };
}

/** Noms des prestations d'un rendez-vous. */
export const serviceNames = (apt) =>
  (Array.isArray(apt?.services) ? apt.services : []).map((s) => s?.name || s?.service_name).filter(Boolean);

/** Prénom pour le salut (« Karim » dans « Karim Benali »). */
export const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || '';
