/**
 * Calcul des créneaux libres d'un barber, partagé par la réservation (`Booking.jsx`) et la
 * proposition de déplacement d'un rendez-vous (`lib/reschedule.js`). Fonctions pures.
 * `assertSlotAvailable` (routes/entities.js du backend) en est le portage côté serveur : les deux
 * règles doivent rester identiques.
 */
import { format } from 'date-fns';
import { parisInstant } from '@/lib/calendarLinks';

/**
 * Jour de Paris décalé de `offset` jours : `date` à midi heure locale de l'appareil (même jour du
 * calendrier que Paris, sans saut de jour au passage à l'heure d'été) et sa clé `yyyy-MM-dd`.
 * `format(date, …)` et `analyzeDay` lisent donc bien le jour de Paris, quel que soit le fuseau.
 */
export function parisDay(offset = 0) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d + offset, 12);
  return { date, key: format(date, 'yyyy-MM-dd') };
}

export function generateTimeSlots(start, end, interval = 30) {
  const slots = [];
  let [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  while (sh < eh || (sh === eh && sm < em)) {
    slots.push(`${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`);
    sm += interval;
    if (sm >= 60) { sh++; sm -= 60; }
  }
  return slots;
}

/** Congé approuvé du barber ce jour-là (`dateStr` = `yyyy-MM-dd`). */
export function isOnLeave(employee, dateStr, timeOffs) {
  return (timeOffs || []).some(t =>
    String(t.employee_id) === String(employee.id)
    && dateStr >= String(t.start_date).slice(0, 10)
    && dateStr <= String(t.end_date).slice(0, 10)
    && (t.status === 'approved' || !t.status)
  );
}

/** Horaires du barber pour ce jour de la semaine (`working_hours[jour]`), `null` s'il ne travaille pas. */
export function workingHoursOf(employee, date) {
  const hours = employee.working_hours?.[format(date, 'EEEE').toLowerCase()];
  return !hours || hours.closed ? null : hours;
}

/**
 * Créneaux disponibles d'un barber pour une date, et la raison quand il n'y en a aucun
 * (fonction pure, réutilisée pour un barber précis comme pour l'union « peu importe »).
 * Anciennement `computeSlots` : `assertSlotAvailable` (routes/entities.js du backend) en est le
 * portage côté serveur, les deux règles doivent rester identiques.
 * Règles : congé approuvé → aucun créneau ; horaires du jour `working_hours[jour]` (`start` / `end` /
 * `closed`) ; un créneau est libre si [créneau, créneau + durée totale[ ne chevauche aucun RDV ni
 * pause du barber ce jour-là (les RDV annulés sont ignorés).
 * @param {object} employee  barber (`id`, `working_hours`)
 * @param {Date} date
 * @param {Array} appointmentsOfEmployee  RDV et pauses de ce barber ce jour-là (`start_time`, `end_time`, `status`)
 * @param {Array} timeOffs  congés (tous barbers, filtrés ici sur `employee_id`)
 * @param {number} totalDuration  durée totale des prestations en minutes
 * @param {number} [shortestDuration]  durée de la plus courte prestation choisie (diagnostic « durée »)
 * @returns {{ slots: string[], reason: null | 'leave' | 'off' | 'over' | 'duration' | 'full' }}
 *   heures `HH:mm` triées ; sans créneau : `leave` congé, `off` ne travaille pas ce jour de la
 *   semaine, `over` plus aucune heure à venir (aujourd'hui), `duration` un créneau plus court
 *   existerait (c'est la durée des prestations qui bloque), `full` journée complète
 */
export function analyzeDay(employee, date, appointmentsOfEmployee, timeOffs, totalDuration, shortestDuration = 30) {
  if (!employee || !date) return { slots: [], reason: null };
  const dateStr = format(date, 'yyyy-MM-dd');
  if (isOnLeave(employee, dateStr, timeOffs)) return { slots: [], reason: 'leave' };
  const hours = workingHoursOf(employee, date);
  if (!hours) return { slots: [], reason: 'off' };
  const busy = (appointmentsOfEmployee || [])
    .filter(apt => apt.status !== 'cancelled' && apt.start_time && apt.end_time)
    .map(apt => {
      const [ah, am] = apt.start_time.split(':').map(Number);
      const [bh, bm] = apt.end_time.split(':').map(Number);
      return [ah * 60 + am, bh * 60 + bm];
    });
  // Les créneaux déjà passés sont retirés : le serveur les refuse (« Ce créneau est déjà
  // passé »), les afficher mènerait droit à une erreur. La comparaison se fait sur l'instant
  // réel, donc elle reste juste quel que soit le fuseau de l'appareil.
  const nowMs = Date.now();
  const upcoming = generateTimeSlots(hours.start || '09:00', hours.end || '19:00', 30)
    .filter(slot => parisInstant(dateStr, slot) >= nowMs);
  if (upcoming.length === 0) return { slots: [], reason: 'over' };
  // La prestation doit tenir avant la fermeture : un créneau qui déborde faisait finir le
  // barber après son horaire. Le serveur applique la même règle et refuse le cas échéant.
  const [ch, cm] = (hours.end || '19:00').split(':').map(Number);
  const closeMinutes = ch * 60 + cm;
  const freeFor = (duration) => upcoming.filter(slot => {
    const [sh, sm] = slot.split(':').map(Number);
    const slotStart = sh * 60 + sm;
    const slotEnd = slotStart + duration;
    if (slotEnd > closeMinutes) return false;
    return !busy.some(([aptStart, aptEnd]) => slotStart < aptEnd && slotEnd > aptStart);
  });
  const slots = freeFor(totalDuration);
  if (slots.length > 0) return { slots, reason: null };
  // Aucun créneau : la durée n'est en cause que si un créneau plus court (une demi-heure, ou la
  // plus courte des prestations choisies) tiendrait encore ce jour-là.
  const probe = Math.min(30, shortestDuration || 30);
  return { slots: [], reason: totalDuration > probe && freeFor(probe).length > 0 ? 'duration' : 'full' };
}
