/**
 * Abonnements au mois : libellés et petits calculs d'affichage partagés par le parcours du client,
 * sa carte et Mes rendez-vous. Aucune règle de créneau ni d'argent ici (lib/subscriptions.js, serveur).
 */
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatPrice } from '@/components/services/serviceUtils';
import { dateFromKey } from '@/lib/availability';
import { appointmentEvent, parisInstant } from '@/lib/calendarLinks';
import { SUBSCRIPTION_VISITS } from '@/lib/subscriptions';

/** RDV rattaché à un abonnement (colonnes écrites par le serveur seul). */
export const isSubscriptionAppointment = (apt) => !!apt?.subscription_id || apt?.subscription_visit != null;

/** « Coupe 2 sur 4 » : jamais le nom de la formule ni son prix sur un RDV. */
export const visitLabel = (visit, total = SUBSCRIPTION_VISITS) => (visit ? `Coupe ${visit} sur ${total}` : 'Abonnement');

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** « jeudi 12 novembre » (milieu de phrase) d'une clé `yyyy-MM-dd`. */
export const dayName = (key) => format(dateFromKey(key), 'EEEE d MMMM', { locale: fr });

/** « Jeudi 12 novembre » (début de ligne) d'une clé `yyyy-MM-dd`. */
export const dayLabel = (key) => upperFirst(dayName(key));

/** Même règle que le serveur (`isPlanName`) : pour reconnaître une formule tant que ses données manquent. */
const PLAN_NAME_RE = /^\s*4\s*coupes\b/i;
export const looksLikePlan = (service) => PLAN_NAME_RE.test(String(service?.name || ''));

/** Une formule qui comprend plus que des coupes (« 4 coupes + barbe premium ») se compte en visites. */
const moreThanCuts = (name) => String(name || '').includes('+');

/**
 * Prix d'une visite, partout le même libellé (catalogue, fiche, `/abonnement`) : « 25 € la coupe »,
 * « 35 € la visite » quand le nom contient « + ».
 */
export const unitLabel = (plan) => `${formatPrice(plan?.unit_price)} ${moreThanCuts(plan?.name) ? 'la visite' : 'la coupe'}`;

/** Verso de la carte : « 25 € par coupe », « 50 € par visite ». */
export const perUnitLabel = (price, name) => `${formatPrice(price)} ${moreThanCuts(name) ? 'par visite' : 'par coupe'}`;

/**
 * Événement de calendrier d'un RDV d'abonnement : même UID que dans Mes rendez-vous (l'ajouter deux
 * fois ne crée pas de doublon), « Coupe 1 sur 4 » pour titre, aucun prix.
 */
export function visitEvent(apt, { visit = apt?.subscription_visit ?? apt?.visit, duration = apt?.total_duration, total = SUBSCRIPTION_VISITS } = {}) {
  return appointmentEvent({
    id: apt.id,
    employee_name: apt.employee_name,
    services: [{ name: visitLabel(visit, total) }],
    date: apt.date,
    start_time: apt.start_time,
    end_time: apt.end_time,
    total_duration: duration,
    total_price: null,
    calendar_url: apt.calendar_url,
  });
}

/** RDV de la vue d'un abonnement encore à venir (ni commencé ni terminé), du plus proche au plus loin. */
export function upcomingVisits(subscription, nowMs = Date.now()) {
  return (subscription?.appointments || [])
    .filter(a => a.status === 'confirmed' && parisInstant(a.date, a.end_time || a.start_time || '23:59') > nowMs)
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
}
