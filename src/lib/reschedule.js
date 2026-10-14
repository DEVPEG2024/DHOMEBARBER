/**
 * Déplacement d'un rendez-vous par le client (Mes rendez-vous) : quand il veut annuler, on lui
 * propose d'abord les prochains créneaux libres avec le même barber et les mêmes prestations.
 * Les créneaux suivent exactement les règles de la réservation (`analyzeDay` de `lib/slots.js`) ;
 * le serveur revérifie tout à la création (`assertSlotAvailable`).
 * Le nouveau rendez-vous est créé d'abord, l'ancien n'est annulé qu'ensuite (jamais l'inverse).
 */
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '@/api/apiClient';
import { analyzeDay, parisDay } from '@/lib/slots';

/** Jours parcourus pour trouver des créneaux, créneaux proposés au total et par jour. */
export const RESCHEDULE_DAYS = 21;
export const RESCHEDULE_LIMIT = 6;
const PER_DAY = 2;

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Durée d'un rendez-vous en minutes (durée enregistrée, sinon fin − début, sinon somme des prestations). */
export function appointmentDuration(apt) {
  const stored = Number(apt?.total_duration);
  if (stored > 0) return stored;
  if (apt?.start_time && apt?.end_time) {
    const d = toMinutes(apt.end_time) - toMinutes(apt.start_time);
    if (d > 0) return d;
  }
  const sum = (Array.isArray(apt?.services) ? apt.services : []).reduce((t, s) => t + (Number(s?.duration) || 0), 0);
  return sum > 0 ? sum : 30;
}

/** Jours chargés un par un quand le filtre par liste de dates est refusé. */
const FALLBACK_DAYS = 10;

/**
 * RDV confirmés et pauses du barber sur ces jours (projection « créneaux » côté client).
 * `keys` = jours effectivement chargés : seuls ceux-là peuvent être proposés (un jour non chargé
 * paraîtrait entièrement libre).
 * @returns {Promise<{ rows: object[], keys: string[] }>}
 */
async function fetchBusy(employeeId, keys) {
  const load = (status, dates) => api.entities.Appointment.filter({ employee_id: employeeId, date: dates, status }, 'start_time', 1000);
  try {
    const [confirmed, breaks] = await Promise.all([load('confirmed', keys), load('break', keys)]);
    return { rows: [...(confirmed || []), ...(breaks || [])], keys };
  } catch {
    // Filtre par liste de dates refusé : un jour à la fois, sur les 10 premiers jours seulement
    const rows = [];
    const loaded = keys.slice(0, FALLBACK_DAYS);
    for (const key of loaded) {
      const [c, b] = await Promise.all([load('confirmed', key), load('break', key)]);
      rows.push(...(c || []), ...(b || []));
    }
    return { rows, keys: loaded };
  }
}

/**
 * Prochains créneaux libres pour déplacer `appointment` avec `employee` (barber actif, avec ses
 * `working_hours`). Par jour, les deux créneaux les plus proches de l'heure d'origine, du plus tôt
 * au plus tard ; au plus `limit` créneaux sur `days` jours, à partir d'aujourd'hui.
 * @returns {Promise<Array<{ date: string, time: string, label: string }>>}
 */
export async function findRescheduleSlots({ appointment, employee, timeOffs = [], days = RESCHEDULE_DAYS, limit = RESCHEDULE_LIMIT }) {
  if (!appointment || !employee) return [];
  const duration = appointmentDuration(appointment);
  const target = toMinutes(appointment.start_time);
  const wanted = Array.from({ length: days }, (_, i) => parisDay(i));
  const { rows: busy, keys: loadedKeys } = await fetchBusy(employee.id, wanted.map(d => d.key));
  // Repli jour par jour : on ne parcourt que les jours dont les RDV ont été chargés
  const loaded = new Set(loadedKeys);
  const calendar = wanted.filter(d => loaded.has(d.key));
  const byDate = new Map();
  for (const row of busy) {
    const key = String(row.date || '').slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(row);
  }

  const found = [];
  for (const { date, key } of calendar) {
    const { slots } = analyzeDay(employee, date, byDate.get(key) || [], timeOffs, duration);
    // Le créneau actuel n'est pas proposé (il apparaîtrait comme pris de toute façon)
    const picks = slots
      .filter(t => !(key === appointment.date && t === appointment.start_time))
      .sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target))
      .slice(0, PER_DAY)
      .sort();
    for (const time of picks) {
      found.push({ date: key, time, label: format(date, 'EEE d MMM', { locale: fr }) });
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/**
 * Déplace `appointment` au créneau `{ date, time }` : crée le nouveau rendez-vous (mêmes barber
 * et prestations), puis annule l'ancien. Sans `withReason`, l'annulation envoie exactement
 * `{ status: 'cancelled' }` (un champ inconnu ferait refuser l'annulation).
 * @returns {Promise<{ created: object, oldCancelled: boolean }>} — lève l'erreur du serveur si la
 *   création est refusée (créneau pris entre-temps : 409)
 */
export async function moveAppointment({ appointment, employee, user, slot, withReason = false }) {
  const duration = appointmentDuration(appointment);
  const services = (Array.isArray(appointment.services) ? appointment.services : []).map(s => ({
    service_id: s?.service_id ?? s?.id,
    name: s?.name,
    duration: s?.duration,
    price: s?.price,
  }));
  const created = await api.entities.Appointment.create({
    client_email: user.email,
    client_name: user.full_name || user.name || '',
    employee_id: employee.id,
    employee_name: employee.name,
    services,
    date: slot.date,
    start_time: slot.time,
    end_time: toHHMM(toMinutes(slot.time) + duration),
    total_duration: duration,
    total_price: Number(appointment.total_price) || services.reduce((t, s) => t + (Number(s.price) || 0), 0),
    status: 'confirmed',
    notes: appointment.notes || '',
  });
  let oldCancelled = true;
  try {
    await api.entities.Appointment.update(
      appointment.id,
      withReason
        ? { status: 'cancelled', cancellation_reason: `Client : déplacé au ${slot.label} ${slot.time}` }
        : { status: 'cancelled' },
    );
  } catch {
    oldCancelled = false;
  }
  return { created, oldCancelled };
}
