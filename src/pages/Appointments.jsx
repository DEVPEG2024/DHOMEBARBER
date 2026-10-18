import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Calendar, CalendarPlus, CalendarClock, CalendarSearch, Clock, User, X, Scissors, Plus, Phone, Loader2, ArrowLeft, ShoppingBag, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import LoadError, { isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { appointmentEvent, openCalendar, parisInstant } from '@/lib/calendarLinks';
import {
  SALON_PHONE, SALON_PHONE_HREF, CANCEL_REASON_MAX, APPOINTMENT_CANCEL_REASONS,
  useCancelFeatures, friendlyCancelError, cancelledByLabel, cleanReason,
} from '@/lib/cancellation';
import { isClientPlaceholder } from '@/components/agenda/agendaUtils';
import { findRescheduleSlots, moveAppointment, currentServices, appointmentDuration } from '@/lib/reschedule';
import { openOrdersByAppointment, orderItemsLabel } from '@/lib/appointmentProducts';
import { formatPrice } from '@/components/shop/productUtils';

/** Aucune commande : valeur stable (évite de recalculer la carte des commandes à chaque rendu). */
const NO_ORDERS = [];
/** Aucun rendez-vous : valeur stable (dépendance du useMemo de la liste). */
const NO_APPOINTMENTS = [];
// Heure limite d'annulation en ligne, à l'heure du salon quel que soit le fuseau de l'appareil
const PARIS_DEADLINE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

/** Message du serveur lisible (jamais « HTTP 409 » ni un message réseau en anglais), sans point final. */
function serverMessage(err, fallback) {
  const raw = err?.data?.error || err?.message || '';
  if (!raw || /^HTTP \d+$/.test(raw) || /failed to fetch|load failed|network/i.test(raw)) return fallback;
  return String(raw).trim().replace(/[.!\s]+$/, '');
}

/** Total d'une commande (prix serveur, sinon somme des lignes). */
const orderTotalOf = (order) => {
  const t = Number(order?.total_price);
  if (Number.isFinite(t) && t > 0) return t;
  return (Array.isArray(order?.items) ? order.items : [])
    .reduce((s, it) => s + (Number(it?.price) || 0) * (Number(it?.quantity) || 0), 0);
};

/** Libellé des produits de plusieurs commandes : « Cire mate ×1, Huile à barbe ×2 ». */
const ordersLabel = (orders) => orders.map(orderItemsLabel).filter(Boolean).join(', ') || 'Produit';

/** Plusieurs produits différents (accord du texte : « Les produits ajoutés … seront annulés »). */
const manyProducts = (orders) => orders
  .reduce((n, o) => n + (Array.isArray(o?.items) ? o.items.length : 0), 0) > 1;

/** Cibles « Ajouter au calendrier » : le .ics ne s'ouvre pas dans l'app native, seulement sur le web. */
const CALENDAR_TARGETS = [
  { kind: 'google', label: 'Google Agenda' },
  ...(isNative ? [] : [{ kind: 'ics', label: 'Apple / Outlook' }]),
];

/** Statuts qui rangent un rendez-vous dans l'historique, quelle que soit sa date. */
const CLOSED_STATUSES = ['cancelled', 'completed', 'no_show'];

/**
 * Début / fin d'un rendez-vous en instant réel (heure de Paris, quel que soit le fuseau de
 * l'appareil). Un rendez-vous reste « à venir » tant que son heure de fin n'est pas passée :
 * comparer la seule date à minuit rangeait dans l'historique un rendez-vous pris pour le jour même.
 */
const startsAt = (apt) => parisInstant(apt.date, apt.start_time || '00:00');
const endsAt = (apt) => parisInstant(apt.date, apt.end_time || apt.start_time || '23:59');

/** « 06 66 08 36 05 » → « tel:0666083605 ». */
const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

/** Ids des prestations d'un RDV (`services` JSONB : `service_id` ou `id`), comme RebookCard. */
const serviceIdsOf = (apt) => (Array.isArray(apt?.services) ? apt.services : [])
  .map(s => s?.service_id ?? s?.id)
  .filter(id => id !== undefined && id !== null && id !== '')
  .map(String);

/** Lien « Déplacer » : même barber, mêmes prestations, l'ancien RDV annulé après la nouvelle réservation. */
function rescheduleHref(apt) {
  const parts = [];
  if (apt.employee_id !== undefined && apt.employee_id !== null && apt.employee_id !== '') {
    parts.push(`barber=${encodeURIComponent(String(apt.employee_id))}`);
  }
  const ids = serviceIdsOf(apt);
  if (ids.length > 0) parts.push(`services=${ids.map(encodeURIComponent).join(',')}`);
  parts.push(`reschedule=${encodeURIComponent(String(apt.id))}`);
  return `/booking?${parts.join('&')}`;
}

/** Total affiché d'un RDV (prix serveur, sinon somme des prestations). */
const totalOf = (apt) => {
  const total = Number(apt?.total_price);
  if (total > 0) return total;
  return (Array.isArray(apt?.services) ? apt.services : []).reduce((sum, s) => sum + (Number(s?.price) || 0), 0);
};

const statusConfig = {
  pending:   { label: 'En attente', bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmé',   bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  completed: { label: 'Terminé',    bg: 'bg-primary/10 text-primary border-primary/20' },
  cancelled: { label: 'Annulé',     bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
  no_show:   { label: 'Absent',     bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Appointments() {
  const [tab, setTab] = useState('upcoming');
  // Rendez-vous dont la fenêtre d'annulation est ouverte, et motif choisi (si le serveur l'accepte)
  const [cancelApt, setCancelApt] = useState(null);
  const [reasonChoice, setReasonChoice] = useState(null);
  const [reasonOther, setReasonOther] = useState('');
  // La fenêtre propose d'abord de déplacer le rendez-vous ('move'), l'annulation vient ensuite ('cancel')
  const [dialogMode, setDialogMode] = useState('move');
  const [chosenSlot, setChosenSlot] = useState(null);
  // Bouton d'origine : « Annuler » (on propose quand même de déplacer d'abord) ou « Déplacer »
  const [intent, setIntent] = useState('cancel');
  const navigate = useNavigate();
  const features = useCancelFeatures();
  // Rendez-vous dont le petit menu « Ajouter au calendrier » est ouvert
  const [calendarOpenId, setCalendarOpenId] = useState(null);
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const appointmentsQuery = useQuery({
    queryKey: ['myAppointments', user?.email],
    // Fiches « Ajouter / Importer » des Clients (RDV fantômes annulés) : jamais montrées au client
    queryFn: async () => ((await api.entities.Appointment.filter({ client_email: user.email }, '-date', 100)) || []).filter(a => !isClientPlaceholder(a)),
    enabled: !!user?.email,
    refetchInterval: 30000, // Auto-refresh toutes les 30s
    // Retour dans l'app (déplacement ou annulation faits ailleurs, par le salon) : relu tout de
    // suite, pas jusqu'à 30 s d'un état périmé qui laisse croire que l'ancien RDV est resté
    refetchOnWindowFocus: true,
  });
  const appointments = appointmentsQuery.data || NO_APPOINTMENTS;
  // Requête mise en pause hors connexion (réseau tombé en cours d'usage) : ni chargement, ni
  // erreur pour React Query, mais aucune donnée non plus
  const appointmentsPaused = appointmentsQuery.isPending && appointmentsQuery.fetchStatus === 'paused';
  const isLoading = appointmentsQuery.isLoading;
  // Échec sans données, ou requête en pause hors connexion : « Aucun rendez-vous » serait faux
  // (le client en réserverait un second). LoadError affiche alors « Pas de connexion internet ».
  const appointmentsFailed = (appointmentsQuery.isError && !appointmentsQuery.data) || appointmentsPaused;

  // Produits ajoutés aux rendez-vous : mêmes clé et requête que Mes commandes (cache partagé).
  // Simple bonus : si la requête échoue, rien n'est affiché. Rechargée à chaque arrivée sur la
  // page, car un déplacement fait depuis la réservation rattache la commande au nouveau RDV.
  const { data: myOrders = NO_ORDERS } = useQuery({
    queryKey: ['myOrders', user?.email],
    queryFn: () => api.entities.Order.filter({ client_email: user?.email }, '-created_date', 100),
    enabled: !!user?.email,
    refetchOnMount: 'always',
    refetchInterval: 30000,
    retry: false,
  });
  const ordersByAppointment = useMemo(() => openOrdersByAppointment(myOrders), [myOrders]);

  // Délai d'annulation du salon (même requête et même cache que l'accueil). Dans ce délai le
  // serveur refuse l'annulation : on affiche le téléphone du salon au lieu du bouton.
  const { data: settingsData = [] } = useQuery({
    queryKey: ['salonSettings'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.SalonSettings.list(),
  });
  const settings = settingsData[0] || null;
  const cancelHours = parseInt(settings?.cancellation_hours, 10) || 0;
  // Téléphone du salon : celui des paramètres, sinon le numéro connu
  const salonPhone = settings?.phone || SALON_PHONE;
  const salonPhoneHref = settings?.phone ? telHref(settings.phone) : SALON_PHONE_HREF;

  // Barbers actifs, congés et catalogue : mêmes requêtes et mêmes caches que la réservation
  const employeesQuery = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
    enabled: !!cancelApt,
  });
  const { data: employees = [], isPending: employeesPending } = employeesQuery;
  const timeOffsQuery = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    enabled: !!cancelApt,
  });
  const timeOffs = timeOffsQuery.data || [];
  // Catalogue actif : durée d'aujourd'hui des prestations, et prestation retirée détectée.
  // En échec, on ne bloque pas : repli sur les prestations enregistrées sur le RDV.
  const servicesQuery = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
    enabled: !!cancelApt,
  });
  const catalog = servicesQuery.data || null;
  const catalogSettled = !servicesQuery.isPending;
  const moveBarber = useMemo(
    () => (cancelApt ? employees.find(e => String(e.id) === String(cancelApt.employee_id)) || null : null),
    [employees, cancelApt],
  );
  // Une prestation de ce RDV n'est plus proposée : aucun créneau, seulement « Choisir une autre date »
  const serviceRetired = !!cancelApt && !!catalog && currentServices(cancelApt, catalog).missing;
  // RDV sans prestation (Last Minute attribué à un compte, prestations retirées par le salon) :
  // aucun créneau rapide (le serveur refuserait « Aucune prestation sélectionnée »), seulement
  // « Choisir une autre date », qui démarre la réservation à l'étape des prestations
  const noServices = !!cancelApt && !(Array.isArray(cancelApt.services) && cancelApt.services.length > 0);
  // RDV à déplacer relu dans la liste à jour : durée allongée par le salon pendant que la fenêtre
  // est ouverte reprise après un refus (409 « Le salon a prévu 1 h… »)
  const liveCancelApt = useMemo(
    () => (cancelApt ? appointments.find(a => String(a.id) === String(cancelApt.id)) || cancelApt : null),
    [appointments, cancelApt],
  );
  // Congés du barber (empreinte stable : pas de nouveau calcul à chaque relecture identique)
  const moveTimeOffsKey = useMemo(() => JSON.stringify(
    (timeOffsQuery.data || [])
      .filter(t => moveBarber && String(t.employee_id) === String(moveBarber.id))
      .map(t => [t.id, t.start_date, t.end_date, t.status]),
  ), [timeOffsQuery.data, moveBarber]);
  // Prochains créneaux libres avec le même barber et les mêmes prestations. La clé suit les
  // données du calcul (horaires du barber, ses congés, durée du RDV) : après un refus « ne reçoit
  // pas à cette heure-là », barbers et congés relus relancent le calcul au lieu de reproposer
  // les mêmes heures
  const slotsQuery = useQuery({
    queryKey: ['rescheduleSlots', cancelApt?.id, moveBarber?.id, JSON.stringify(moveBarber?.working_hours ?? null), moveTimeOffsKey, appointmentDuration(liveCancelApt)],
    queryFn: () => findRescheduleSlots({ appointment: liveCancelApt, employee: moveBarber, timeOffs, catalog }),
    enabled: !!cancelApt && dialogMode === 'move' && !!moveBarber && timeOffsQuery.isSuccess && catalogSettled && !serviceRetired && !noServices,
    staleTime: 30 * 1000,
    retry: false,
  });
  const suggestions = slotsQuery.data || [];
  const suggestionsByDay = useMemo(() => {
    const days = [];
    for (const slot of suggestions) {
      const last = days[days.length - 1];
      if (last && last.date === slot.date) last.slots.push(slot);
      else days.push({ date: slot.date, label: slot.label, slots: [slot] });
    }
    return days;
  }, [suggestions]);
  // Barbers ou congés impossibles à charger : jamais « ne prend plus de rendez-vous » ni des
  // créneaux sur un jour de congé, mais l'écran d'erreur avec « Réessayer »
  // Hors connexion, React Query met les requêtes en pause (ni erreur ni données) : c'est un échec,
  // pas un chargement (sinon « Recherche des créneaux libres… » tournerait sans fin). Le catalogue
  // en échec reste non bloquant (repli sur les prestations du RDV) : seule sa pause bloque.
  const suggestionsLoadFailed = !!cancelApt && (
    queryFailed(employeesQuery) || queryFailed(timeOffsQuery)
    || (servicesQuery.fetchStatus === 'paused' && servicesQuery.isPending)
    || (slotsQuery.fetchStatus === 'paused' && slotsQuery.isPending)
  );
  const barberGone = !!cancelApt && employeesQuery.isSuccess && !moveBarber;
  const loadingSuggestions = !!cancelApt && !barberGone && !suggestionsLoadFailed && !serviceRetired && !noServices
    && (employeesPending || timeOffsQuery.isPending || !catalogSettled || slotsQuery.isPending);

  // Horloge à la minute : un rendez-vous passe dans l'historique dès que son heure de fin est passée
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  /** Motif saisi dans la fenêtre (vide si aucun ou si le serveur ne l'accepte pas encore). */
  const chosenReason = () => {
    if (!features.appointmentCancelReason || !reasonChoice) return '';
    if (reasonChoice === 'Autre') return reasonOther.trim().slice(0, CANCEL_REASON_MAX);
    return reasonChoice;
  };

  /** Le RDV est-il entré dans le délai d'annulation du salon (calculé maintenant) ? */
  const tooLateNow = (apt) => !!apt && cancelHours > 0
    && startsAt(apt) - Date.now() < cancelHours * 3600 * 1000;

  /** Délai passé pendant que la fenêtre était ouverte : on ferme et on renvoie vers le salon. */
  const refuseTooLate = () => {
    setCancelApt(null);
    toast.error(`Ce rendez-vous est dans moins de ${cancelHours} h : pour le déplacer ou l'annuler, appelez le salon au ${salonPhone}.`, {
      duration: 10000,
      action: { label: 'Appeler', onClick: () => { window.location.href = salonPhoneHref; } },
    });
  };

  /** Ouvre la fenêtre : d'abord la proposition de déplacement, l'annulation ensuite. */
  const openCancel = (apt, from = 'cancel') => {
    hapticFeedback();
    setReasonChoice(null);
    setReasonOther('');
    setChosenSlot(null);
    setIntent(from);
    setDialogMode('move');
    setCancelApt(apt);
  };

  const cancelMutation = useMutation({
    // Règle : sans `features.appointmentCancelReason`, exactement `{ status: 'cancelled' }` comme
    // avant (un champ inconnu ferait refuser une annulation qui fonctionne).
    mutationFn: ({ id, reason }) => api.entities.Appointment.update(
      id,
      features.appointmentCancelReason && reason
        ? { status: 'cancelled', cancellation_reason: `Client : ${reason}`.slice(0, CANCEL_REASON_MAX) }
        : { status: 'cancelled' },
    ),
    onSuccess: (_data, { id, reason }) => {
      hapticFeedback();
      // Mise à jour immédiate de la liste, puis rechargement de tout ce qui montre ce créneau
      queryClient.setQueryData(['myAppointments', user?.email], (old) => (Array.isArray(old)
        ? old.map(a => (String(a.id) === String(id)
          ? {
            ...a,
            status: 'cancelled',
            cancelled_by: 'client',
            ...(features.appointmentCancelReason && reason ? { cancellation_reason: `Client : ${reason}` } : {}),
          }
          : a))
        : old));
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] }); // « Comme la dernière fois »
      queryClient.invalidateQueries({ queryKey: ['appointments-day'] }); // créneaux de la réservation
      // Le serveur annule avec le RDV les produits ajoutés encore à préparer (stock rendu)
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Rendez-vous annulé : le créneau est libéré', {
        action: { label: 'Réserver', onClick: () => navigate('/booking') },
      });
    },
    onError: (err) => {
      // Délai d'annulation, RDV déjà passé, refus du serveur : message utile, jamais « HTTP 403 »
      const e = friendlyCancelError(err, 'appointment');
      toast.error(e.message, e.callSalon
        ? { action: { label: 'Appeler', onClick: () => { window.location.href = salonPhoneHref; } } }
        : undefined);
      if (e.refetch) {
        queryClient.invalidateQueries({ queryKey: ['salonSettings'] });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      }
    },
    onSettled: () => setCancelApt(null),
  });

  /** Déplacement en un geste vers un créneau proposé : nouveau RDV créé, puis l'ancien annulé. */
  const moveMutation = useMutation({
    mutationFn: (slot) => moveAppointment({
      appointment: liveCancelApt,
      employee: moveBarber,
      user,
      slot,
      withReason: features.appointmentCancelReason,
      catalog,
    }),
    onSuccess: ({ oldCancelled }, slot) => {
      hapticFeedback();
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
      queryClient.invalidateQueries({ queryKey: ['rescheduleSlots'] });
      queryClient.invalidateQueries({ queryKey: ['myOrders'] }); // les produits ajoutés suivent le nouveau RDV
      if (oldCancelled === true) {
        toast.success(`Rendez-vous déplacé au ${slot.label} à ${slot.time}`);
      } else if (oldCancelled === null) {
        // Réseau coupé après la création : le serveur a très probablement annulé l'ancien lui-même.
        // Jamais « l'ancien n'a pas pu être annulé » ni d'appel au salon pour rien.
        toast.success(`Rendez-vous déplacé au ${slot.label} à ${slot.time}`);
        toast.info('Connexion instable : vérifiez dans Mes rendez-vous que l\'ancien a bien disparu.', { duration: 8000 });
      } else {
        // Ancien RDV non annulé : s'il est déjà dans le délai d'annulation, seul le salon peut le faire
        toast.warning(
          tooLateNow(cancelApt)
            ? `Nouveau rendez-vous confirmé le ${slot.label} à ${slot.time}, mais l'ancien n'a pas pu être annulé : appelez le salon au ${salonPhone}.`
            : `Nouveau rendez-vous confirmé le ${slot.label} à ${slot.time}, mais l'ancien n'a pas pu être annulé : annulez-le ci-dessous ou appelez le salon au ${salonPhone}.`,
          { duration: 12000 },
        );
      }
      setCancelApt(null);
    },
    onError: (err) => {
      setChosenSlot(null);
      // Réseau coupé : le déplacement est peut-être passé (réponse perdue), ne pas inviter à
      // reprendre un autre créneau
      if (isNetworkError(err)) {
        toast.error('Connexion perdue : le déplacement a peut-être été enregistré. Vérifiez vos rendez-vous avant de réessayer.');
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        queryClient.invalidateQueries({ queryKey: ['rescheduleSlots'] });
        return;
      }
      const shown = serverMessage(err, 'Ce créneau n\'a pas pu être réservé');
      // Prestation retirée ou changée : changer d'heure n'y fera rien, le catalogue est relu
      if (err?.status === 400 && /prestation/i.test(shown)) {
        toast.error(`${shown}. Choisissez une autre date.`);
        queryClient.invalidateQueries({ queryKey: ['services'] });
        return;
      }
      // Ancien RDV entré dans le délai d'annulation (refusé par le serveur) : le salon s'en occupe
      if (err?.status === 409 && /pour le déplacer|ne peut plus être déplacé/i.test(shown)) {
        setCancelApt(null);
        toast.error(`${shown}.`, {
          duration: 10000,
          action: { label: 'Appeler', onClick: () => { window.location.href = salonPhoneHref; } },
        });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        queryClient.invalidateQueries({ queryKey: ['salonSettings'] });
        return;
      }
      // Refus que seul le salon peut lever : pas d'invitation à choisir un autre créneau
      if (/appelez le salon/i.test(shown)) {
        setCancelApt(null);
        toast.error(`${shown}.`, {
          duration: 10000,
          action: { label: 'Appeler', onClick: () => { window.location.href = salonPhoneHref; } },
        });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      if (err?.status === 409 || err?.status === 400) {
        toast.error(`${shown}. Choisissez un autre créneau.`);
        // Horaires ou congés du barber changés, RDV allongé par le salon : relus, la clé des
        // créneaux suit ces données et relance le calcul quand elles arrivent
        queryClient.invalidateQueries({ queryKey: ['employees'] });
        queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        queryClient.invalidateQueries({ queryKey: ['rescheduleSlots'] });
      } else {
        toast.error(`${shown}.`);
      }
    },
  });
  const busy = cancelMutation.isPending || moveMutation.isPending;

  const confirmCancel = () => {
    if (!cancelApt || cancelMutation.isPending) return;
    cancelMutation.mutate({ id: cancelApt.id, reason: chosenReason() });
  };

  /** Déplacement vers un créneau proposé, le délai d'annulation revérifié au moment du tap. */
  const confirmMove = () => {
    if (!chosenSlot || busy) return;
    if (tooLateNow(cancelApt)) { refuseTooLate(); return; }
    moveMutation.mutate(chosenSlot);
  };

  /** « Déplacer » : nouvelle réservation pré-remplie, l'ancien RDV n'est annulé qu'une fois le nouveau confirmé. */
  const goReschedule = (apt) => {
    hapticFeedback();
    if (tooLateNow(apt)) { refuseTooLate(); return; }
    setCancelApt(null);
    navigate(rescheduleHref(apt));
  };

  /** Ouvre Google Agenda ou télécharge le .ics d'un rendez-vous (UID stable : réimporter met à jour au lieu de dupliquer). */
  const addToCalendar = (kind, apt) => {
    hapticFeedback();
    openCalendar(kind, appointmentEvent(apt));
    setCalendarOpenId(null);
  };

  // À venir : le plus proche d'abord ; historique : le plus récent d'abord
  const { upcoming, past } = useMemo(() => {
    const up = [];
    const done = [];
    for (const apt of appointments) {
      const isUpcoming = !!apt.date && !CLOSED_STATUSES.includes(apt.status) && endsAt(apt) > now;
      (isUpcoming ? up : done).push(apt);
    }
    up.sort((a, b) => startsAt(a) - startsAt(b));
    done.sort((a, b) => startsAt(b) - startsAt(a));
    return { upcoming: up, past: done };
  }, [appointments, now]);
  const list = tab === 'upcoming' ? upcoming : past;

  // Fenêtre d'annulation : produits ajoutés à ce RDV, annulés avec lui s'ils ne sont pas encore prêts
  const cancelLinked = cancelApt ? (ordersByAppointment.get(String(cancelApt.id)) || NO_ORDERS) : NO_ORDERS;
  const cancelLinkedToCancel = cancelLinked.filter(o => o.status === 'pending' || o.status === 'confirmed');
  const cancelLinkedReady = cancelLinked.filter(o => o.status === 'ready');

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-40 -left-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-8 pb-28">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-primary font-semibold mb-1">Mes réservations</p>
              <h1 className="font-display text-3xl font-bold text-foreground">Rendez-vous</h1>
              <div className="h-0.5 w-12 mt-2 rounded-full bg-gradient-to-r from-primary to-primary/30" />
            </div>
            <Link to="/booking">
              <motion.div whileTap={{ scale: 0.93 }}
                className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary" />
              </motion.div>
            </Link>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 p-1 rounded-2xl bg-white/5 border border-white/8">
          {[
            { id: 'upcoming', label: 'À venir' },
            { id: 'past', label: 'Historique' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-muted-foreground'
              }`}
            >
              {t.label}
              {t.id === 'upcoming' && upcoming.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] ${
                  tab === 'upcoming' ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary'
                }`}>
                  {upcoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : appointmentsFailed ? (
          <LoadError
            what="vos rendez-vous"
            error={appointmentsQuery.error}
            onRetry={appointmentsQuery.refetch}
            retrying={appointmentsQuery.isFetching}
          />
        ) : list.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-5">
              <Calendar className="w-8 h-8 text-muted-foreground/25" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              Aucun rendez-vous {tab === 'upcoming' ? 'à venir' : 'passé'}
            </p>
            <p className="text-xs text-muted-foreground mb-6">Réservez votre prochain créneau</p>
            {tab === 'upcoming' && (
              <Link to="/booking">
                <motion.button whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 h-11 px-6 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/20">
                  <Scissors className="w-4 h-4" />
                  Réserver maintenant
                </motion.button>
              </Link>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {list.map((apt, i) => {
                const status = statusConfig[apt.status] || statusConfig.pending;
                // Annulation : RDV confirmé pas encore commencé, hors du délai d'annulation du salon
                // (le serveur applique la même règle). Dans le délai : téléphone du salon à la place.
                const startMs = startsAt(apt);
                const notStarted = apt.status === 'confirmed' && startMs > now;
                const tooLateToCancel = notStarted && cancelHours > 0 && startMs - now < cancelHours * 3600 * 1000;
                const canCancel = notStarted && !tooLateToCancel;
                // RDV à venir qu'on ne peut pas annuler en ligne (délai dépassé, en attente…) : téléphone du salon
                const callInstead = !canCancel && !CLOSED_STATUSES.includes(apt.status) && startMs > now;
                // Historique : qui a annulé et pourquoi (rien pour le last minute expiré : cancelledByLabel renvoie null)
                const cancelledLabel = apt.status === 'cancelled' ? cancelledByLabel(apt, 'client', 'rdv') : null;
                const cancelledReason = cancelledLabel ? cleanReason(apt.cancellation_reason) : '';
                // À venir (fin du RDV pas encore passée) et ni annulé ni terminé : proposer l'ajout au calendrier
                const canAddToCalendar = !CLOSED_STATUSES.includes(apt.status) && endsAt(apt) > now;
                const calendarOpen = calendarOpenId === apt.id;
                // Produits ajoutés à ce RDV à venir, encore à remettre
                const linkedOrders = canAddToCalendar ? (ordersByAppointment.get(String(apt.id)) || NO_ORDERS) : NO_ORDERS;
                return (
                  <motion.div
                    key={apt.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl overflow-hidden border border-white/8 bg-white/4 backdrop-blur-xl"
                  >
                    {/* Top accent bar */}
                    <div className={`h-0.5 w-full ${apt.status === 'confirmed' ? 'bg-gradient-to-r from-emerald-500/60 to-transparent' : apt.status === 'completed' ? 'bg-gradient-to-r from-primary/60 to-transparent' : 'bg-gradient-to-r from-white/10 to-transparent'}`} />

                    <div className="p-4">
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-sm text-foreground first-letter:uppercase">
                            {apt.date && format(parseISO(apt.date), 'EEEE d MMMM', { locale: fr })}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Clock className="w-3 h-3 text-primary" />
                            <p className="text-xs text-muted-foreground font-medium">{apt.start_time} — {apt.end_time}</p>
                          </div>
                        </div>
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.bg}`}>
                          {status.label}
                        </span>
                      </div>

                      {/* Barber */}
                      <div className="flex items-center gap-2.5 mb-3 p-2.5 rounded-xl bg-white/4 border border-white/6">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Barber</p>
                          <p className="text-xs font-semibold text-foreground">{apt.employee_name || 'Non assigné'}</p>
                        </div>
                      </div>

                      {/* Services */}
                      <div className="space-y-1.5">
                        {apt.services?.map((s, j) => (
                          <div key={j} className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                              <span className="text-xs text-muted-foreground">{s.name}</span>
                            </div>
                            <span className="text-xs font-bold text-primary">{s.price}€</span>
                          </div>
                        ))}
                      </div>

                      {/* Total */}
                      {apt.total_price > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/6 flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Total</span>
                          <span className="text-sm font-bold text-foreground">{apt.total_price}€</span>
                        </div>
                      )}

                      {/* Produits ajoutés à la réservation : remis par le barber, payés sur place */}
                      {linkedOrders.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {linkedOrders.map(order => (
                            <Link
                              key={order.id}
                              to="/orders"
                              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors min-w-0"
                            >
                              <ShoppingBag className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                              <span className="flex-1 min-w-0 text-[11px] leading-relaxed text-muted-foreground break-words">
                                <span className="font-semibold text-foreground">{orderItemsLabel(order) || 'Produit'}</span>
                                {' · '}
                                <span className="font-semibold text-foreground whitespace-nowrap">{formatPrice(orderTotalOf(order))}</span>
                                {order.status === 'ready' ? ' — prêt au salon' : ' — à régler au salon'}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            </Link>
                          ))}
                        </div>
                      )}

                      {/* Annulé : par qui, et le motif s'il est connu */}
                      {cancelledLabel && (
                        <div className="mt-3 pt-3 border-t border-white/6">
                          <p className="text-[11px] font-semibold text-red-400">{cancelledLabel}</p>
                          {cancelledReason && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground break-words">Motif : {cancelledReason}</p>
                          )}
                        </div>
                      )}

                      {/* Actions : ajout au calendrier (RDV à venir), déplacement et annulation */}
                      {(canAddToCalendar || canCancel || callInstead) && (
                        <div className="mt-3 pt-3 border-t border-white/6">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            {canAddToCalendar ? (
                              <button
                                type="button"
                                aria-expanded={calendarOpen}
                                onClick={() => { hapticFeedback(); setCalendarOpenId(calendarOpen ? null : apt.id); }}
                                className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
                                  calendarOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                Ajouter au calendrier
                              </button>
                            ) : <span />}
                            {canCancel && (
                              <div className="flex items-center gap-3 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openCancel(apt, 'move')}
                                  className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                                >
                                  <CalendarClock className="w-3.5 h-3.5" />
                                  Déplacer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCancel(apt, 'cancel')}
                                  className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Annuler
                                </button>
                              </div>
                            )}
                          </div>
                          {callInstead && (
                            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                              {tooLateToCancel
                                ? `Ce rendez-vous est dans moins de ${cancelHours} h : il ne peut plus être déplacé ni annulé en ligne, et réserver un autre créneau ne le supprimera pas. Pour le déplacer ou l'annuler, `
                                : 'Pour modifier ou annuler ce rendez-vous, '}
                              <a href={salonPhoneHref} className="inline-flex items-center gap-1 font-semibold text-primary whitespace-nowrap">
                                <Phone className="w-3 h-3" />
                                appelez le salon
                              </a>
                              <span className="whitespace-nowrap"> au {salonPhone}</span>.
                            </p>
                          )}
                          {/* Heure limite du délai d'annulation, pour ne pas la découvrir trop tard */}
                          {canCancel && cancelHours > 0 && (
                            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                              Déplaçable ou annulable en ligne jusqu'au{' '}
                              <span className="font-semibold text-foreground/80">
                                {PARIS_DEADLINE.format(new Date(startMs - cancelHours * 3600 * 1000)).replace(', ', ' à ')}
                              </span>
                              {' '}; ensuite, seul le salon pourra le faire.
                            </p>
                          )}
                          <AnimatePresence initial={false}>
                            {calendarOpen && canAddToCalendar && (
                              <motion.div
                                key="calendar-menu"
                                initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className={`mt-3 grid ${CALENDAR_TARGETS.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}
                              >
                                {CALENDAR_TARGETS.map(({ kind, label }) => (
                                  <motion.button
                                    key={kind}
                                    type="button"
                                    whileTap={{ scale: 0.96 }}
                                    onClick={() => addToCalendar(kind, apt)}
                                    className="flex items-center justify-center gap-1.5 h-9 rounded-xl bg-white/5 border border-white/10 text-[11px] font-semibold text-foreground hover:bg-white/10 transition-colors"
                                  >
                                    <CalendarPlus className="w-3.5 h-3.5 text-primary" />
                                    {label}
                                  </motion.button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Annulation : fenêtre fermée par la croix (pas de tap sur le fond), ouverte pendant l'envoi */}
      <Dialog
        open={!!cancelApt}
        onOpenChange={(open) => { if (!open && !busy) setCancelApt(null); }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 rounded-3xl p-5">
          {cancelApt && (
            <>
              <DialogHeader className="text-left pr-6">
                <DialogTitle className="font-display text-xl">
                  {dialogMode === 'cancel'
                    ? 'Annuler ce rendez-vous ?'
                    : intent === 'cancel' ? 'Et si on le déplaçait ?' : 'Déplacer ce rendez-vous'}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm">
                  {dialogMode === 'cancel'
                    ? 'Le créneau sera libéré.'
                    : `Plutôt que d'annuler, choisissez un autre créneau${cancelApt.employee_name ? ` avec ${cancelApt.employee_name}` : ''} : l'ancien sera libéré automatiquement.`}
                </DialogDescription>
              </DialogHeader>

              {/* Rappel du rendez-vous */}
              <div className="rounded-2xl bg-white/4 border border-white/8 p-3 space-y-1.5 min-w-0">
                <p className="text-sm font-bold text-foreground first-letter:uppercase">
                  {cancelApt.date && format(parseISO(cancelApt.date), 'EEEE d MMMM', { locale: fr })}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3 text-primary shrink-0" />
                  {cancelApt.start_time}{cancelApt.end_time ? ` — ${cancelApt.end_time}` : ''}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                  <User className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{cancelApt.employee_name || 'Barber non assigné'}</span>
                </p>
                {Array.isArray(cancelApt.services) && cancelApt.services.length > 0 && (
                  <p className="text-xs text-muted-foreground break-words">
                    {cancelApt.services.map(s => s?.name).filter(Boolean).join(' + ')}
                  </p>
                )}
                {totalOf(cancelApt) > 0 && (
                  <p className="text-xs font-bold text-foreground">{totalOf(cancelApt)}€</p>
                )}
              </div>

              {dialogMode === 'move' ? (
                <>
                  {/* Créneaux libres proposés : même barber, mêmes prestations */}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground mb-2">Prochains créneaux disponibles</p>
                    {suggestionsLoadFailed ? (
                      <LoadError
                        compact
                        what="les créneaux libres"
                        error={employeesQuery.error || timeOffsQuery.error}
                        onRetry={() => {
                          for (const q of [employeesQuery, timeOffsQuery, servicesQuery, slotsQuery]) {
                            if (q.isError || q.fetchStatus === 'paused') q.refetch();
                          }
                        }}
                        // Une requête en pause n'est pas « fetching » : le bouton reste actif
                        retrying={employeesQuery.fetchStatus === 'fetching' || timeOffsQuery.fetchStatus === 'fetching' || servicesQuery.fetchStatus === 'fetching'}
                      />
                    ) : noServices ? (
                      <p className="text-xs text-muted-foreground">
                        Ce rendez-vous n'a pas encore de prestation : choisissez vos prestations et une nouvelle date.
                      </p>
                    ) : serviceRetired ? (
                      <p className="text-xs text-muted-foreground">
                        Une prestation de ce rendez-vous n'est plus proposée : choisissez une autre date.
                      </p>
                    ) : barberGone ? (
                      <p className="text-xs text-muted-foreground">
                        {cancelApt.employee_name || 'Ce barber'} ne prend plus de rendez-vous en ligne : choisissez une date et un autre barber.
                      </p>
                    ) : loadingSuggestions ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" /> Recherche des créneaux libres…
                      </div>
                    ) : slotsQuery.isError ? (
                      <p className="text-xs text-muted-foreground">Impossible de charger les créneaux pour le moment : choisissez une date ci-dessous.</p>
                    ) : suggestionsByDay.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucun créneau libre dans les 3 prochaines semaines : choisissez une date plus lointaine ci-dessous.</p>
                    ) : (
                      <div className="space-y-2">
                        {cancelHours > 0 && suggestionsByDay.some(day => day.slots.some(slot => parisInstant(slot.date, slot.time) - Date.now() < cancelHours * 3600 * 1000)) && (
                          <p className="text-[11px] text-amber-300 leading-relaxed">
                            Les créneaux marqués d'un point commencent dans moins de {cancelHours} h : une fois déplacé, le rendez-vous ne pourra plus être modifié ni annulé en ligne.
                          </p>
                        )}
                        {suggestionsByDay.map(day => (
                          <div key={day.date} className="flex items-center gap-2 min-w-0">
                            <span className="w-20 shrink-0 text-[11px] font-semibold text-muted-foreground first-letter:uppercase">{day.label}</span>
                            <div className="flex flex-wrap gap-2">
                              {day.slots.map(slot => {
                                const active = chosenSlot && chosenSlot.date === slot.date && chosenSlot.time === slot.time;
                                const soon = cancelHours > 0 && parisInstant(slot.date, slot.time) - Date.now() < cancelHours * 3600 * 1000;
                                return (
                                  <button
                                    key={slot.time}
                                    type="button"
                                    disabled={busy}
                                    aria-pressed={!!active}
                                    onClick={() => { hapticFeedback(); setChosenSlot(active ? null : slot); }}
                                    className={`px-3 h-9 rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                                      active
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-white/5 border-white/10 text-foreground hover:border-primary/40'
                                    }`}
                                  >
                                    {slot.time}
                                    {soon && <span aria-label={`moins de ${cancelHours} h : ne pourra plus être modifié en ligne`} title={`Moins de ${cancelHours} h : ne pourra plus être modifié en ligne`} className="ml-1 text-amber-300">•</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {chosenSlot && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmMove}
                      className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {moveMutation.isPending
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Déplacement…</>
                        : <><CalendarClock className="w-4 h-4" /> {`Déplacer au ${chosenSlot.label} à ${chosenSlot.time}`}</>}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => goReschedule(cancelApt)}
                    className="w-full h-11 rounded-2xl border border-primary/30 bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CalendarSearch className="w-4 h-4" /> Choisir une autre date
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { hapticFeedback(); setDialogMode('cancel'); }}
                    className="mx-auto block text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Non merci, je veux annuler
                  </button>
                </>
              ) : (
                <>
                  {/* Motif facultatif : seulement quand le serveur l'accepte */}
                  {features.appointmentCancelReason && (
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">Motif <span className="font-normal text-muted-foreground">(facultatif)</span></p>
                      <div className="flex flex-wrap gap-2">
                        {APPOINTMENT_CANCEL_REASONS.map(r => {
                          const active = reasonChoice === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              disabled={busy}
                              aria-pressed={active}
                              onClick={() => setReasonChoice(active ? null : r)}
                              className={`px-3 h-8 rounded-full border text-[11px] font-semibold transition-colors ${
                                active
                                  ? 'bg-primary/15 border-primary/40 text-primary'
                                  : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                      {reasonChoice === 'Autre' && (
                        <div className="mt-2">
                          <textarea
                            value={reasonOther}
                            onChange={(e) => setReasonOther(e.target.value.slice(0, CANCEL_REASON_MAX))}
                            maxLength={CANCEL_REASON_MAX}
                            rows={2}
                            disabled={busy}
                            placeholder="Précisez si vous le souhaitez"
                            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40 resize-none"
                          />
                          <p className="text-right text-[10px] text-muted-foreground">{reasonOther.length}/{CANCEL_REASON_MAX}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Produits ajoutés au RDV : ce qu'il advient d'eux */}
                  {(cancelLinkedToCancel.length > 0 || cancelLinkedReady.length > 0) && (
                    <div className="space-y-1.5">
                      {cancelLinkedToCancel.length > 0 && (
                        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground break-words">
                          <ShoppingBag className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            {manyProducts(cancelLinkedToCancel) ? 'Les produits ajoutés' : 'Le produit ajouté'}
                            {' '}({ordersLabel(cancelLinkedToCancel)}) {manyProducts(cancelLinkedToCancel) ? 'seront annulés' : 'sera annulé'} aussi.
                          </span>
                        </p>
                      )}
                      {cancelLinkedReady.length > 0 && (
                        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground break-words">
                          <ShoppingBag className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            {manyProducts(cancelLinkedReady) ? 'Vos produits' : 'Votre produit'}
                            {' '}({ordersLabel(cancelLinkedReady)}) {manyProducts(cancelLinkedReady) ? 'sont prêts : ils restent disponibles' : 'est prêt : il reste disponible'} au salon.
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelApt(null)}
                      className="flex-1 h-11 rounded-2xl border border-white/10 bg-white/5 text-sm font-semibold text-foreground disabled:opacity-50"
                    >
                      Non, garder
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmCancel}
                      className="flex-1 h-11 rounded-2xl bg-red-500/90 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
                    >
                      {cancelMutation.isPending ? 'Annulation…' : 'Oui, annuler'}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { hapticFeedback(); setDialogMode('move'); }}
                    className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Voir les créneaux pour le déplacer
                  </button>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}