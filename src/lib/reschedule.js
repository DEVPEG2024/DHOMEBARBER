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
 * La ligne occupe-t-elle le créneau pour une réservation client ? Le serveur le calcule
 * (`blocks_client`, mêmes règles que son contrôle : RDV terminés, absents, last minute rattachés
 * à un client compris). Repli pour un ancien serveur sans ce champ : confirmés et pauses.
 * Partagé par la réservation (Booking.jsx) et le déplacement.
 */
export function blocksClient(row) {
  if (!row) return false;
  if (row.blocks_client === true) return true;
  return row.blocks_client === undefined && (row.status === 'confirmed' || row.status === 'break');
}

/**
 * Lignes du barber sur ces jours qui occupent un créneau (projection « créneaux » côté client),
 * sans filtre de statut : le serveur dit lesquelles bloquent (`blocksClient`).
 * `keys` = jours effectivement chargés : seuls ceux-là peuvent être proposés (un jour non chargé
 * paraîtrait entièrement libre).
 * @returns {Promise<{ rows: object[], keys: string[] }>}
 */
async function fetchBusy(employeeId, keys) {
  const load = (dates) => api.entities.Appointment.filter({ employee_id: employeeId, date: dates }, 'start_time', 1000);
  try {
    const rows = await load(keys);
    return { rows: (rows || []).filter(blocksClient), keys };
  } catch {
    // Filtre par liste de dates refusé : un jour à la fois, sur les 10 premiers jours seulement
    const rows = [];
    const loaded = keys.slice(0, FALLBACK_DAYS);
    for (const key of loaded) {
      const day = await load(key);
      rows.push(...(day || []).filter(blocksClient));
    }
    return { rows, keys: loaded };
  }
}

/**
 * Prestations de l'ancien RDV relues dans le catalogue actif (durée et prix d'aujourd'hui).
 * `missing` : une prestation n'est plus proposée (retirée du catalogue) ; le serveur refuserait
 * alors le déplacement. Sans catalogue, `duration` vaut 0 (repli sur la durée enregistrée).
 * @returns {{ services: Array<{ service_id, name, duration, price }>, missing: boolean, duration: number }}
 */
export function currentServices(appointment, catalog) {
  const list = Array.isArray(appointment?.services) ? appointment.services : [];
  if (!Array.isArray(catalog)) return { services: [], missing: false, duration: 0 };
  const byId = new Map(catalog.map(s => [String(s.id), s]));
  const services = [];
  let missing = false;
  let duration = 0;
  for (const s of list) {
    const id = s?.service_id ?? s?.id;
    const found = id !== undefined && id !== null ? byId.get(String(id)) : null;
    if (!found) { missing = true; continue; }
    const d = Number(found.duration) || 0;
    duration += d;
    services.push({ service_id: found.id, name: found.name, duration: d, price: Number(found.price) || 0 });
  }
  if (list.length === 0) missing = false;
  return { services, missing, duration };
}

/**
 * Prochains créneaux libres pour déplacer `appointment` avec `employee` (barber actif, avec ses
 * `working_hours`). Par jour, les deux créneaux les plus proches de l'heure d'origine, du plus tôt
 * au plus tard ; au plus `limit` créneaux sur `days` jours, à partir d'aujourd'hui.
 * @returns {Promise<Array<{ date: string, time: string, label: string }>>}
 */
export async function findRescheduleSlots({ appointment, employee, timeOffs = [], catalog = null, days = RESCHEDULE_DAYS, limit = RESCHEDULE_LIMIT }) {
  if (!appointment || !employee) return [];
  // Durée d'aujourd'hui des prestations (catalogue) ; une prestation retirée : aucun créneau
  const current = currentServices(appointment, catalog);
  if (current.missing) return [];
  // RDV sans prestation : le serveur refuserait chaque créneau (« Aucune prestation sélectionnée »)
  if (!Array.isArray(appointment.services) || appointment.services.length === 0) return [];
  // Prestations inchangées : jamais moins que la durée réelle du RDV (allongée par le salon), que le
  // serveur garde au déplacement (sinon un trou trop court serait proposé, puis refusé)
  const duration = current.duration > 0
    ? Math.max(current.duration, appointmentDuration(appointment))
    : appointmentDuration(appointment);
  const target = toMinutes(appointment.start_time);
  const wanted = Array.from({ length: days }, (_, i) => parisDay(i));
  const { rows: busy, keys: loadedKeys } = await fetchBusy(employee.id, wanted.map(d => d.key));
  // Privatisations confirmées (salon fermé aux réservations sur leur fenêtre) ; lecture impossible :
  // aucune, le serveur refusera de toute façon un créneau privatisé
  let privates = [];
  try {
    privates = (await api.entities.Event.filter({ date: loadedKeys, status: 'confirmed' }, 'date', 200)) || [];
  } catch { privates = []; }
  const privatesByDate = new Map();
  for (const ev of privates) {
    const key = String(ev.date || '').slice(0, 10);
    if (!privatesByDate.has(key)) privatesByDate.set(key, []);
    privatesByDate.get(key).push(ev);
  }
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
    const { slots } = analyzeDay(employee, date, byDate.get(key) || [], timeOffs, duration, 30, privatesByDate.get(key) || []);
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
 * et prestations), puis annule l'ancien. Le serveur annule désormais l'ancien lui-même à la
 * création (`reschedule_of`) ; l'appel qui suit ne fait alors plus rien (déjà annulé). Sans `withReason`, l'annulation envoie exactement
 * `{ status: 'cancelled' }` (un champ inconnu ferait refuser l'annulation).
 * @returns {Promise<{ created: object, oldCancelled: boolean|null }>} — `oldCancelled` : true si
 *   l'ancien est annulé, false s'il est encore actif, null si on ne sait pas (réseau coupé : le
 *   serveur l'a très probablement déjà annulé lui-même). Lève l'erreur du serveur si la création
 *   est refusée (créneau pris entre-temps : 409)
 */
export async function moveAppointment({ appointment, employee, user, slot, withReason = false, catalog = null }) {
  // Prestations et durée d'aujourd'hui quand le catalogue est connu (le serveur recalcule de
  // toute façon), sinon celles enregistrées sur l'ancien RDV
  const current = currentServices(appointment, catalog);
  const useCurrent = !current.missing && current.duration > 0;
  // Durée allongée par le salon (note « prévoir 1 h »…) conservée : le serveur fait de même
  const duration = useCurrent ? Math.max(current.duration, appointmentDuration(appointment)) : appointmentDuration(appointment);
  const services = useCurrent ? current.services : (Array.isArray(appointment.services) ? appointment.services : []).map(s => ({
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
    total_price: useCurrent
      ? services.reduce((t, s) => t + (Number(s.price) || 0), 0)
      : Number(appointment.total_price) || services.reduce((t, s) => t + (Number(s.price) || 0), 0),
    status: 'confirmed',
    notes: appointment.notes || '',
    // Le serveur fait suivre au nouveau RDV les produits ajoutés à l'ancien
    reschedule_of: appointment.id,
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
    // L'échec du filet de secours ne prouve rien : le serveur annule l'ancien à la création.
    // On relit son état avant de parler d'échec.
    const state = await checkOldCancelled(appointment.id);
    oldCancelled = state === 'active' ? false : (state === 'cancelled' ? true : null);
  }
  return { created, oldCancelled };
}

/**
 * État d'un ancien rendez-vous après un déplacement : 'cancelled' (annulé, absent ou disparu),
 * 'active' (encore confirmé) ou 'unknown' (lecture impossible, réseau coupé). La politique de
 * lecture du serveur limite déjà un client à ses propres lignes : filtrer sur `id` est sûr.
 * @returns {Promise<'cancelled'|'active'|'unknown'>}
 */
export async function checkOldCancelled(id) {
  try {
    const rows = await api.entities.Appointment.filter({ id }, '-date', 1);
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r || ['cancelled', 'no_show'].includes(r.status)) return 'cancelled';
    return ['confirmed', 'pending'].includes(r.status) ? 'active' : 'cancelled';
  } catch {
    return 'unknown';
  }
}
