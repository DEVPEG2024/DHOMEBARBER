import { format, startOfWeek } from 'date-fns';
import { parisInstant } from '@/lib/calendarLinks';
import { parisDay } from '@/lib/slots';
import { isBreak, isUnclaimedLastMinute } from '@/components/agenda/agendaUtils';

/** Jours `AAAA-MM-JJ` du lundi au dimanche de la semaine de Paris contenant aujourd'hui. */
export function parisWeekDays() {
  const { date } = parisDay();
  const offset = (date.getDay() + 6) % 7; // lundi = 0
  return Array.from({ length: 7 }, (_, i) => parisDay(i - offset).key);
}

/** Jours `AAAA-MM-JJ` du mois de Paris en cours. */
export function parisMonthDays() {
  const { date } = parisDay();
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => parisDay(i + 1 - date.getDate()).key);
}

/**
 * Lundi de la semaine au format de BarberCleaning (même calcul, même clé de cache
 * `['cleaningSchedule', weekStart]`).
 */
export const cleaningWeekStart = () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

/** Un vrai rendez-vous client : ni pause, ni annulé, ni absent, ni last minute resté libre. */
export const isClientAppointment = (apt) =>
  !!apt && !isBreak(apt) && !isUnclaimedLastMinute(apt) && apt.status !== 'last_minute'
  && apt.status !== 'cancelled' && apt.status !== 'no_show';

export const aptStart = (apt) => parisInstant(apt.date, String(apt.start_time || '00:00').slice(0, 5));
export const aptEnd = (apt) => parisInstant(apt.date, String(apt.end_time || apt.start_time || '23:59').slice(0, 5));

/** Compte à rebours court jusqu'au début d'un rendez-vous du jour. */
export function countdownLabel(apt, now = Date.now()) {
  const start = aptStart(apt);
  const end = aptEnd(apt);
  if (now >= start && now < end) return 'En ce moment';
  const min = Math.round((start - now) / 60000);
  if (min < 60) return `Dans ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `Dans ${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}

/** Libellé d'un jour proche : « Demain », « jeudi 23 oct. ». */
export function dayLabel(key) {
  if (key === parisDay(1).key) return 'Demain';
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d, 12));
}

export const serviceNames = (apt) =>
  (Array.isArray(apt?.services) ? apt.services : []).map((s) => s?.name || s?.service_name).filter(Boolean);

/** `tel:` d'un numéro saisi librement (« 06 12 34 56 78 » → tel:0612345678). */
export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

export const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || '';
