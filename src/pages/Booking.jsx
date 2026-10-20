import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { fetchPublicBarbers } from '@/lib/publicBarbers';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Calendar, CalendarPlus, Check, ChevronDown, Info, MessageSquare, Scissors, ShoppingBag, Zap } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format, addDays, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import ServicePicker from '@/components/services/ServicePicker';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import { hapticFeedback, isNative } from '@/lib/capacitor';
import { blocksClient, checkOldCancelled, appointmentDuration } from '@/lib/reschedule';
import { useAndroidBack } from '@/lib/useAndroidBack';
import { appointmentEvent, openCalendar, parisInstant } from '@/lib/calendarLinks';
import { SALON_PHONE, SALON_PHONE_HREF, useCancelFeatures } from '@/lib/cancellation';
import { analyzeDay, parisDay } from '@/lib/slots';
import {
  dateFromKey, dayOptions, pickNextOptions, rowsByDate, weekDays, weekKeyOf,
} from '@/lib/availability';
import { addonItems, addonTotal, suggestAddonProducts } from '@/lib/appointmentProducts';
import { formatPrice } from '@/components/shop/productUtils';
import { formatDuration } from '@/components/services/serviceUtils';
import ProductAddon, { addonMaxQuantity, addonProductsQuery } from '@/components/booking/ProductAddon';
import GalleryQuickStep from '@/components/booking/GalleryQuickStep';
import BookingSteps from '@/components/booking/BookingSteps';
import BookingBar from '@/components/booking/BookingBar';
import BarberStrip from '@/components/booking/BarberStrip';
import NextSlots from '@/components/booking/NextSlots';
import DayStrip from '@/components/booking/DayStrip';
import SlotGroups from '@/components/booking/SlotGroups';
import ConfirmSummary from '@/components/booking/ConfirmSummary';
import { track } from '@/lib/analytics';
import { barberFirstName, forgetBookedLastMinute } from '@/lib/lastMinute';

/**
 * Étapes du parcours (refonte du 19 oct. 2026 : barber, jour et heure sur un seul écran). Les noms
 * `datetime` / `confirm` sont ceux que lit le parcours de réservation d'Admin → Trafic
 * (`FUNNEL` de lib/analytics.js du backend) : ne pas les renommer.
 */
const STEPS = ['services', 'datetime', 'confirm'];
const STEP_TITLES = ['Choisissez votre prestation', 'Choisissez votre créneau', 'Vérifiez et confirmez'];
/** Prochaines disponibilités : nombre de semaines chargées dès l'ouverture de la page (C2). */
const PRELOAD_WEEKS = 2;
/** Date limite du délai d'annulation, heure de Paris (même format que Mes rendez-vous). */
const PARIS_DEADLINE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

// Étapes qui glissent dans le sens de la navigation (suivant → entre par la droite)
const stepVariants = {
  enter: (dir) => ({ opacity: 0, x: dir >= 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -40 : 40 }),
};
const stepTransition = { x: { type: 'spring', stiffness: 380, damping: 34 }, opacity: { duration: 0.18 } };
/** Durée de l'écran de succès avant la redirection vers Mes rendez-vous (ms). */
const SUCCESS_DURATION = 4200;

// Première lettre en majuscule seulement (« Mardi 20 octobre ») : la classe `capitalize` en met une
// à chaque mot (« Mardi 20 Octobre À 11:00 »), contraire à l'usage français
const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Pluie de lames : nombre et instant de l'éclatement (s). */
const BLADE_COUNT = 30;
const BURST_AT = 0.35;
/**
 * Cibles « Ajouter au calendrier » de l'écran de succès. Le fichier .ics ne s'ouvre pas dans
 * l'app native (rien ne se passe sur iPhone) : seulement sur le web, en attendant l'écriture du
 * fichier par @capacitor/filesystem + @capacitor/share.
 */
const CALENDAR_TARGETS = [
  { kind: 'google', label: 'Google Agenda' },
  ...(isNative ? [] : [{ kind: 'ics', label: 'Apple / Outlook' }]),
];
/** Note de réservation : même limite que CREATE_RULES.appointments côté serveur. */
const NOTES_MAX = 1000;
/** Refus 400 du serveur qui portent sur le créneau lui-même (assertSlotAvailable) : passé, horaires, fermeture, congé. */
const SLOT_REFUSED_RE = /déjà passé|ne reçoit pas à cette heure|ferme à|absent ce jour/i;

/** « 35 min », « 1 h », « 1 h30 ». */
function formatMinutes(total) {
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h${total % 60 ? String(total % 60).padStart(2, '0') : ''}`;
}

/**
 * Message d'une date sans créneau, selon la raison (`analyzeDay` / `mergeDayReasons`).
 * Le conseil sur la durée n'apparaît que lorsque c'est vraiment elle qui bloque.
 */
function emptyDayMessage(reason, { barberName, date, totalDuration, serviceCount, canChangeBarber }) {
  const weekday = format(date, 'EEEE', { locale: fr });
  const otherDate = canChangeBarber ? 'Choisissez une autre date, ou un autre barber.' : 'Choisissez une autre date.';
  switch (reason) {
    case 'leave':
      return { title: `${barberName} est en congé ce jour-là`, hint: otherDate };
    case 'off':
      return { title: `${barberName} ne travaille pas le ${weekday}`, hint: otherDate };
    case 'closed':
      return { title: `Le salon est fermé le ${weekday}`, hint: 'Choisissez une autre date.' };
    case 'nobody':
      return { title: 'Aucun barber ne travaille ce jour-là', hint: 'Choisissez une autre date.' };
    case 'over':
      return { title: 'Plus aucun créneau aujourd\'hui', hint: 'La journée est terminée : choisissez une autre date.' };
    case 'private':
      return { title: 'Le salon est privatisé ce jour-là', hint: 'Choisissez une autre date, ou une heure en dehors de la privatisation.' };
    case 'duration':
      return {
        title: 'Pas de créneau assez long ce jour-là',
        hint: `Vos prestations durent ${formatMinutes(totalDuration)} : essayez une autre date${serviceCount > 1 ? ', ou retirez une prestation' : ''}.`,
      };
    default:
      return {
        title: barberName ? `${barberName} est complet ce jour-là` : 'Tous les barbers sont complets ce jour-là',
        hint: barberName ? otherDate : 'Choisissez une autre date.',
      };
  }
}


/** Lame de rasoir métallique (double tranchant), rendu acier brossé avec reflet. */
function SteelBlade({ width = 32 }) {
  return (
    <svg width={width} height={width * 0.46} viewBox="0 0 100 46" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="1.5" y="1.5" width="97" height="43" rx="5" fill="url(#sb-steel)" stroke="#5f6772" strokeWidth="1" />
      <rect x="1.5" y="1.5" width="97" height="43" rx="5" fill="url(#sb-shine)" />
      {/* tranchants */}
      <path d="M6,3.2 H94" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1" strokeLinecap="round" />
      <path d="M6,42.8 H94" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1" strokeLinecap="round" />
      {/* découpe centrale */}
      <circle cx="17" cy="23" r="4" fill="#0a0d11" />
      <circle cx="83" cy="23" r="4" fill="#0a0d11" />
      <rect x="28" y="19" width="44" height="8" rx="3" fill="#0a0d11" />
      <rect x="42" y="11" width="16" height="24" rx="3" fill="#0a0d11" />
      <rect x="35" y="15" width="8" height="16" rx="2.5" fill="#0a0d11" />
      <rect x="57" y="15" width="8" height="16" rx="2.5" fill="#0a0d11" />
    </svg>
  );
}

/** Pluie de lames : éclatement radial depuis la coche, culbute 3D, retombée, fondu. */
function BladeBurst({ reduceMotion }) {
  const blades = useMemo(() => Array.from({ length: BLADE_COUNT }, (_, i) => {
    const wave = i % 3;
    const angle = (i / BLADE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = 130 + wave * 30 + Math.random() * 90;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist * 0.85,
      fall: 70 + Math.random() * 60,
      rotate: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      flip: 360 + Math.random() * 540,
      width: 22 + Math.random() * 18,
      delay: BURST_AT + wave * 0.12 + Math.random() * 0.1,
      duration: 1.9 + Math.random() * 0.5,
    };
  }), []);
  if (reduceMotion) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden="true" style={{ perspective: 700 }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="sb-steel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6f8fa" />
            <stop offset="40%" stopColor="#b7bfca" />
            <stop offset="65%" stopColor="#e4e8ed" />
            <stop offset="100%" stopColor="#8c95a1" />
          </linearGradient>
          <linearGradient id="sb-shine" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      {blades.map(b => (
        <motion.span
          key={b.id}
          initial={{ x: 0, y: 0, scale: 0.2, opacity: 1, rotate: 0, rotateX: 0 }}
          animate={{ x: b.x, y: b.y + b.fall, scale: 1, opacity: 0, rotate: b.rotate, rotateX: b.flip }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: [0.16, 1, 0.3, 1],
            y: { duration: b.duration, delay: b.delay, ease: [0.2, 0.9, 0.4, 1] },
            rotate: { duration: b.duration, delay: b.delay, ease: 'linear' },
            rotateX: { duration: b.duration, delay: b.delay, ease: 'linear' },
            opacity: { duration: 0.6, delay: b.delay + b.duration - 0.7, ease: 'easeOut' },
          }}
          className="absolute"
          style={{ transformStyle: 'preserve-3d', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))' }}
        >
          <SteelBlade width={b.width} />
        </motion.span>
      ))}
    </div>
  );
}

/** Écran de succès : onde de choc, coche qui se dessine, pluie de lames, barre de redirection. */
export function SuccessOverlay({ barberName, detail, calendarEvent = null, duration = SUCCESS_DURATION }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 45%, #0f1a15 0%, #07090c 70%)' }}
    >
      {/* Flash et ondes de choc au moment de l'éclatement */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0] }}
        transition={{ duration: 0.5, delay: BURST_AT, times: [0, 0.3, 1] }}
        className="absolute inset-0 bg-primary pointer-events-none"
      />
      {[0, 0.18].map((d) => (
        <motion.div
          key={d}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: 6, opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.4, delay: BURST_AT + d, ease: [0.16, 1, 0.3, 1], opacity: { duration: 1.4, delay: BURST_AT + d, times: [0, 0.15, 1] } }}
          className="absolute w-24 h-24 rounded-full border border-primary/70 pointer-events-none"
        />
      ))}

      <div className="relative flex flex-col items-center text-center px-8">
        <BladeBurst reduceMotion={reduceMotion} />

        {/* Coche : anneau gradué qui tourne, disque, coche qui se dessine */}
        <div className="relative w-28 h-28 flex items-center justify-center">
          <motion.svg
            viewBox="0 0 120 120"
            className="absolute inset-0 w-full h-full"
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 1 }}
            transition={{ rotate: { duration: 14, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.6, delay: 0.3 } }}
          >
            <circle cx="60" cy="60" r="56" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round" />
          </motion.svg>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.12, 1] }}
            transition={{ duration: 0.55, delay: BURST_AT - 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-[88px] h-[88px] rounded-full bg-primary flex items-center justify-center"
            style={{ boxShadow: '0 0 0 6px hsl(var(--primary) / 0.15), 0 18px 40px -10px hsl(var(--primary) / 0.7)' }}
          >
            <svg viewBox="0 0 48 48" className="w-11 h-11" aria-hidden="true">
              <motion.path
                d="M12 25 L21 34 L37 16"
                fill="none"
                stroke="hsl(var(--primary-foreground))"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ pathLength: { duration: 0.5, delay: BURST_AT + 0.15, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.1, delay: BURST_AT + 0.15 } }}
              />
            </svg>
          </motion.div>
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-2xl font-bold text-foreground mt-7"
        >
          Rendez-vous confirmé
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-sm text-muted-foreground mt-2"
        >
          {barberName ? `${barberName} vous attend au salon.` : 'À très vite au salon.'}
        </motion.p>
        {detail && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-foreground/90"
          >
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {detail}
          </motion.p>
        )}
        {/* Ajout au calendrier : Google Agenda ou fichier .ics (Apple Calendar / Outlook) */}
        {calendarEvent && (
          <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 flex items-center justify-center gap-2"
          >
            {CALENDAR_TARGETS.map(({ kind, label }) => (
              <motion.button
                key={kind}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => { hapticFeedback(); openCalendar(kind, calendarEvent); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-foreground/80 hover:bg-white/10 hover:text-foreground transition-colors"
              >
                <CalendarPlus className="w-3.5 h-3.5 text-primary" />
                {label}
              </motion.button>
            ))}
          </motion.div>
        )}
        {/* Barre qui se remplit pendant l'attente avant la redirection */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-7 w-40 h-px bg-white/15 overflow-hidden"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: (duration - 1200) / 1000, delay: 1.2, ease: 'linear' }}
            className="h-full w-full bg-primary origin-left"
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
          className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mt-3 pl-[0.3em]"
        >
          Vos rendez-vous
        </motion.p>
      </div>
    </motion.div>
  );
}

/** Liste vide stable (dépendance des `useMemo` tant qu'une requête n'a rien renvoyé). */
const EMPTY_LIST = [];

/**
 * Requête mise en pause hors connexion (réseau tombé en cours d'usage) : ni chargement ni erreur
 * pour React Query, mais aucune donnée. Traitée comme un échec : écran « Pas de connexion ».
 */
const isPausedQuery = (q) => q.isPending && q.fetchStatus === 'paused';
/** Erreur passée aux écrans d'erreur pour une requête en pause (`isNetworkError` la reconnaît). */
const OFFLINE_ERROR = new Error('Network offline');

/**
 * Clé des prestations d'un rendez-vous : exactement `serviceIdSet` du serveur (routes/entities.js),
 * qui reconnaît le même envoi (même compte, barber, jour, heure et prestations) et rend le RDV
 * existant au lieu d'en créer un second.
 */
function serviceKey(services) {
  let list = services;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { list = []; }
  }
  return (Array.isArray(list) ? list : [])
    .map(s => (s && (s.service_id || s.id) ? String(s.service_id || s.id) : ''))
    .sort()
    .join('|');
}

/** Message d'erreur lisible du serveur (sans « HTTP 409 » ni message réseau en anglais), sans point final. */
function serverMessage(err, fallback) {
  const raw = err?.data?.error || err?.message || '';
  if (!raw || /^HTTP \d+$/.test(raw) || /failed to fetch|network|load failed/i.test(raw)) return fallback;
  return String(raw).trim().replace(/[.!\s]+$/, '');
}

/** Horizon de réservation proposé au client, en mois à partir d'aujourd'hui. */
const BOOKING_MONTHS_AHEAD = 3;

/**
 * Barber de la dernière visite du client (RDV confirmé ou terminé déjà commencé), s'il figure
 * encore parmi les barbers réservables ; sinon `null`.
 */
function lastVisitBarber(appointments, employees) {
  const now = Date.now();
  const past = (appointments || [])
    .filter(a => a && ['confirmed', 'completed'].includes(a.status) && a.date && a.employee_id != null
      && parisInstant(a.date, a.start_time || '00:00') <= now)
    .sort((a, b) => `${b.date} ${b.start_time || ''}`.localeCompare(`${a.date} ${a.start_time || ''}`));
  for (const apt of past) {
    const emp = employees.find(e => String(e.id) === String(apt.employee_id));
    if (emp) return emp;
  }
  return null;
}

export default function Booking() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [step, setStep] = useState(0);
  // Sens de la dernière navigation entre étapes (1 = suivant, -1 = retour)
  const [direction, setDirection] = useState(1);
  const [success, setSuccess] = useState(false);
  // Rendez-vous renvoyé par le serveur à la création (id → UID stable du .ics)
  const [createdAppointment, setCreatedAppointment] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [retiredNotice, setRetiredNotice] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [notes, setNotes] = useState('');
  // « Peu importe » : aucun barber choisi, l'étape 3 propose l'union des créneaux de tous les barbers
  const [anyBarber, setAnyBarber] = useState(false);
  // Produits de la boutique ajoutés au rendez-vous : `{ [productId]: quantité }`
  const [addonSelection, setAddonSelection] = useState({});
  // Arrivée depuis une photo de la galerie : « Changer de prestation » rouvre le catalogue complet
  const [fullPicker, setFullPicker] = useState(false);
  // Dernier envoi dont la réponse s'est perdue (réseau coupé à la confirmation) : le rendez-vous a
  // peut-être été créé. Tant que la sélection est la même, l'heure reste choisie et « Confirmer »
  // reste affiché : le nouvel essai rend le RDV existant (doublon reconnu par le serveur).
  const [uncertainSend, setUncertainSend] = useState(null);
  // Sélection figée au moment de l'envoi (lue par onError)
  const sendRef = useRef(null);

  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedIds = (urlParams.get('services') || '').split(',').map(s => s.trim()).filter(Boolean);
  const preSelectedBarberId = urlParams.get('barber') || null;
  // Lien « Réserver cette prestation » d'une photo des réalisations (BarberGallery)
  const fromGallery = urlParams.get('from') === 'gallery';
  // « Déplacer » depuis Mes rendez-vous : l'ancien RDV n'est annulé qu'une fois le nouveau confirmé
  const rescheduleId = urlParams.get('reschedule') || null;
  // Lien d'une notification Last Minute (`/booking?barber=…&date=AAAA-MM-JJ&time=HH:MM`) : avec un
  // barber actif, la date puis l'heure annoncées sont déjà choisies quand le client arrive à l'étape
  // Date & Heure (l'heure seulement si elle est encore libre pour ses prestations). Appliqué une fois.
  const presetDateParam = urlParams.get('date') || '';
  const presetDateKey = /^\d{4}-\d{2}-\d{2}$/.test(presetDateParam) ? presetDateParam : null;
  const presetTimeMatch = /^(\d{1,2}):(\d{2})$/.exec(urlParams.get('time') || '');
  const presetTime = presetTimeMatch ? `${presetTimeMatch[1].padStart(2, '0')}:${presetTimeMatch[2]}` : null;
  const presetApplied = useRef({ date: false, time: false });
  // Heure du lien non proposée : 'gone' (prise, passée, date hors du bandeau) ou 'duration'
  // (le créneau tiendrait pour une prestation courte). Un bandeau l'explique au lieu du silence.
  const [presetMiss, setPresetMiss] = useState(null);
  const features = useCancelFeatures();

  // Mêmes clé et requête que Mes rendez-vous (cache partagé). Chargée pour tout client (pas
  // seulement sur un lien « Déplacer ») : une réservation qui doublerait un RDV déjà pris le même
  // jour est signalée avant « Confirmer » (incident du 18 oct. 2026 : l'ancien restait prévu)
  const isStaffRole = user?.role === 'admin' || user?.role === 'barber';
  const myAppointmentsQuery = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email }, '-date', 100),
    enabled: !!user?.email && (!!rescheduleId || !isStaffRole),
  });
  const myAppointments = myAppointmentsQuery.data || EMPTY_LIST;
  // Délai d'annulation du salon (mêmes requête et cache que Mes rendez-vous) : un RDV qui entre
  // dans ce délai ne se déplace plus en ligne (le serveur refuserait d'annuler l'ancien), et un
  // RDV pris à moins de N heures ne pourra plus être annulé ni déplacé en ligne (bandeau)
  const settingsQuery = useQuery({
    queryKey: ['salonSettings'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.SalonSettings.list(),
  });
  const cancelHours = parseInt(settingsQuery.data?.[0]?.cancellation_hours, 10) || 0;
  /** Le RDV commence-t-il dans moins de `cancelHours` heures (calculé à l'instant `nowMs`) ? */
  const withinCancelDelay = (apt, nowMs = Date.now()) => !!apt && cancelHours > 0
    && parisInstant(apt.date, apt.start_time || '00:00') - nowMs < cancelHours * 3600 * 1000;
  // RDV à déplacer : le sien, confirmé, pas encore commencé ; sinon le paramètre est ignoré
  const oldApt = useMemo(() => {
    if (!rescheduleId) return null;
    const apt = myAppointments.find(a => String(a.id) === String(rescheduleId));
    if (!apt || apt.status !== 'confirmed' || !apt.date) return null;
    return parisInstant(apt.date, apt.start_time || '00:00') > Date.now() ? apt : null;
  }, [myAppointments, rescheduleId]);
  // « Choisir une autre date » : la note laissée au barber sur l'ancien RDV est reprise une fois
  // (modifiable), comme dans le déplacement rapide de Mes rendez-vous ; une note déjà saisie reste
  const notesPrefilled = useRef(false);
  useEffect(() => {
    if (notesPrefilled.current || !oldApt) return;
    notesPrefilled.current = true;
    if (oldApt.notes) setNotes(prev => prev || String(oldApt.notes).slice(0, NOTES_MAX));
  }, [oldApt]);
  const oldAptLabel = oldApt
    ? `${format(new Date(`${oldApt.date}T12:00:00`), 'EEE d MMM', { locale: fr })} à ${oldApt.start_time}`
    : '';
  // Tant qu'on ne sait pas si le RDV à déplacer existe, « Confirmer » attend : sinon le nouveau
  // serait créé sans annuler l'ancien (doublon). Session en cours de vérification comprise.
  const reschedulePending = (!!rescheduleId && !oldApt && (
    isLoadingAuth || (!!user?.email && myAppointmentsQuery.isPending)
  )) || (!!oldApt && settingsQuery.isPending);
  // RDV à déplacer entré dans le délai d'annulation : « Confirmer » bloqué, le salon s'en occupe
  const rescheduleTooLate = !!oldApt && !settingsQuery.isPending && withinCancelDelay(oldApt);
  // Lien « Déplacer » inutilisable (RDV introuvable, annulé, passé, ou liste impossible à charger) :
  // on le dit clairement, la réservation devient un nouveau rendez-vous.
  const rescheduleUnavailable = !!rescheduleId && !oldApt && !reschedulePending && !!user?.email;
  const rescheduleCheckFailed = rescheduleUnavailable && myAppointmentsQuery.isError && !myAppointmentsQuery.data;

  /** « Ne pas déplacer » : on garde le parcours, sans le paramètre `reschedule`. */
  const dropReschedule = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('reschedule');
    const query = params.toString();
    navigate(query ? `/booking?${query}` : '/booking', { replace: true });
  };

  const servicesQuery = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });
  const { data: services = [], isPending: servicesPending } = servicesQuery;
  const servicesPaused = isPausedQuery(servicesQuery);
  // Prestations choisies lues dans le catalogue à jour : durée ou prix changés par le salon depuis
  // la sélection (page ouverte, cache) sont repris ; sinon le serveur, qui recalcule, refusait en
  // boucle l'heure reproposée ici. Prestation retirée du catalogue : l'objet d'origine reste (le
  // serveur répond alors « Prestation inconnue ou indisponible »).
  const servicesData = servicesQuery.data;
  const liveSelected = useMemo(() => {
    const list = servicesData || EMPTY_LIST;
    return selectedServices.map(s => list.find(x => String(x.id) === String(s.id)) || s);
  }, [selectedServices, servicesData]);

  // Depuis une photo de la galerie : écran court (prestation choisie, compléments, produits) puis
  // les créneaux du barber. Prestation de la photo retirée du catalogue, déplacement ou
  // « Changer de prestation » : le sélecteur complet, comme avant.
  const preSelectedKey = preSelectedIds.join(',');
  const galleryAvailable = useMemo(
    () => fromGallery && (servicesData || EMPTY_LIST).some(s => preSelectedKey.split(',').includes(String(s.id))),
    [fromGallery, servicesData, preSelectedKey],
  );
  const galleryFocus = fromGallery && !fullPicker && !rescheduleId && preSelectedIds.length > 0
    && ((servicesPending && !servicesPaused) || galleryAvailable);

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: fetchPublicBarbers,
  });
  const { data: employees = EMPTY_LIST, isPending: employeesPending } = employeesQuery;
  const employeesPaused = isPausedQuery(employeesQuery);
  // Barber choisi lu dans la liste à jour : horaires réduits ou jour de repos posés par le salon
  // depuis la sélection (lien, « Comme la dernière fois », page ouverte) sont repris. Sinon les
  // créneaux restaient calculés sur l'objet mémorisé et le serveur refusait en boucle (« ne reçoit
  // pas à cette heure-là »). Barber devenu inactif : l'objet d'origine reste (le serveur répond).
  const liveEmployee = useMemo(
    () => (selectedEmployee ? employees.find(e => String(e.id) === String(selectedEmployee.id)) || selectedEmployee : null),
    [selectedEmployee, employees],
  );

  // Barber passé dans l'URL (« Comme la dernière fois », relance « il est temps de revenir », photo
  // de la galerie) : présélectionné s'il figure parmi les barbers actifs. Introuvable (parti du
  // salon, désactivé, lien abîmé) → « Peu importe » et un mot qui l'explique sur l'écran Créneau.
  const preSelectedBarber = useMemo(
    () => (preSelectedBarberId ? employees.find(e => String(e.id) === String(preSelectedBarberId)) || null : null),
    [employees, preSelectedBarberId],
  );
  const missingBarber = !!preSelectedBarberId && !employeesPending && !preSelectedBarber;

  const timeOffsQuery = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    refetchOnMount: 'always',
  });
  const timeOffs = timeOffsQuery.data || EMPTY_LIST;

  // Jour de Paris (et non celui de l'appareil), recalculé au retour au premier plan : l'app
  // laissée ouverte la veille ne propose plus la date d'hier en tête.
  const [todayKey, setTodayKey] = useState(() => parisDay(0).key);
  const tomorrowKey = useMemo(() => format(addDays(dateFromKey(todayKey), 1), 'yyyy-MM-dd'), [todayKey]);
  // Horizon de réservation : jours d'aujourd'hui (compris) à `horizonKey` (exclu)
  const horizonKey = useMemo(() => format(addMonths(dateFromKey(todayKey), BOOKING_MONTHS_AHEAD), 'yyyy-MM-dd'), [todayKey]);
  const firstWeekKey = useMemo(() => weekKeyOf(dateFromKey(todayKey)), [todayKey]);
  // Lien Last Minute (carte de l'accueil, notification) : rappelé dès l'étape Prestation, sinon le
  // client ne retrouvait ni le barber ni l'heure du créneau avant l'écran Créneau (tests du 20 oct. 2026)
  const lastMinuteLink = presetTime && presetDateKey && preSelectedBarber && !rescheduleId
    && presetDateKey >= todayKey && presetDateKey < horizonKey
    ? {
        barber: barberFirstName(preSelectedBarber),
        day: presetDateKey === todayKey ? "aujourd'hui"
          : presetDateKey === tomorrowKey ? 'demain'
          : format(dateFromKey(presetDateKey), 'EEEE d MMMM', { locale: fr }),
        time: presetTime,
      }
    : null;
  // Tous les jours de l'horizon, pour la bande de jours de l'écran Créneau
  const horizonDays = useMemo(() => {
    const out = [];
    for (let date = dateFromKey(todayKey); format(date, 'yyyy-MM-dd') < horizonKey; date = addDays(date, 1)) {
      out.push({ date, key: format(date, 'yyyy-MM-dd') });
    }
    return out;
  }, [todayKey, horizonKey]);
  // Jours à l'écran dans la bande (signalés par `DayStrip` au défilement) : leurs semaines, et la
  // suivante d'avance, sont chargées pour afficher les places au fil du glissé
  const [visibleRange, setVisibleRange] = useState(null);
  const onVisibleRange = React.useCallback((range) => setVisibleRange(range), []);
  const visibleWeekKeys = useMemo(() => {
    if (!visibleRange) return [];
    const keys = [];
    const last = weekKeyOf(dateFromKey(visibleRange.lastKey));
    for (let k = weekKeyOf(dateFromKey(visibleRange.firstKey)); k <= last; k = format(addDays(dateFromKey(k), 7), 'yyyy-MM-dd')) keys.push(k);
    keys.push(format(addDays(dateFromKey(last), 7), 'yyyy-MM-dd'));
    return keys.filter(k => k < horizonKey);
  }, [visibleRange, horizonKey]);

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedWeekKey = selectedDate ? weekKeyOf(selectedDate) : null;
  const selectedServiceKey = useMemo(() => serviceKey(selectedServices), [selectedServices]);
  // Même sélection que l'envoi dont la réponse s'est perdue (barber, jour, heure, prestations)
  const uncertainMatch = !!uncertainSend && !!selectedEmployee
    && uncertainSend.employeeId === String(selectedEmployee.id)
    && uncertainSend.date === selectedDateStr
    && uncertainSend.time === selectedTime
    && uncertainSend.services === selectedServiceKey;

  // Lignes servant au calcul des créneaux, chargées **par semaine et pour tous les barbers** :
  // changer de barber ou de jour ne recharge rien, et les places de chaque jour se calculent
  // d'avance. Sans filtre de statut : le serveur dit lesquelles occupent le créneau (`blocks_client` :
  // RDV, pauses, terminés, absents, last minute rattachés à un client) ; ne charger que confirmés et
  // pauses proposait des heures qu'il refusait (409). Le client ne reçoit que les colonnes de
  // créneau. Les deux premières semaines sont chargées dès l'ouverture de la page (prochaines
  // disponibilités), puis la semaine affichée et celle du jour choisi. Clé sous le préfixe
  // `appointments-day` : Mes rendez-vous l'invalide après une annulation.
  const weekKeys = useMemo(() => {
    const keys = [];
    for (let i = 0; i < PRELOAD_WEEKS; i += 1) keys.push(format(addDays(dateFromKey(firstWeekKey), 7 * i), 'yyyy-MM-dd'));
    for (const k of [...visibleWeekKeys, selectedWeekKey]) if (k && !keys.includes(k)) keys.push(k);
    return keys;
  }, [firstWeekKey, visibleWeekKeys, selectedWeekKey]);
  const weekQueries = useQueries({
    queries: weekKeys.map(weekKey => ({
      queryKey: ['appointments-day', 'week', weekKey],
      // Limite explicite : la limite par défaut du serveur pourrait tronquer la semaine
      queryFn: () => api.entities.Appointment.filter({ date: weekDays(weekKey).map(d => d.key) }, 'start_time', 2000),
      staleTime: 30 * 1000,
    })),
  });
  // Privatisations confirmées de la semaine : le salon n'accepte aucun RDV sur leur fenêtre. Un
  // échec de lecture ne bloque pas la réservation (le serveur revérifie et refuse en 409).
  const privateQueries = useQueries({
    queries: weekKeys.map(weekKey => ({
      queryKey: ['privateEvents', 'week', weekKey],
      queryFn: () => api.entities.Event.filter({ date: weekDays(weekKey).map(d => d.key), status: 'confirmed' }, 'date', 50),
      staleTime: 60 * 1000,
    })),
  });
  const weekQueryOf = (weekKey) => weekQueries[weekKeys.indexOf(weekKey)] || null;
  const privateQueryOf = (weekKey) => privateQueries[weekKeys.indexOf(weekKey)] || null;

  // Lignes et privatisations de toutes les semaines chargées, par jour. Déplacement : l'ancien RDV
  // du client (annulé à la confirmation) ne bloque pas son nouveau créneau (le serveur l'ignore
  // aussi) ; un départ à la même heure reste refusé par le serveur.
  // Empreinte des données chargées (taille fixe pour les dépendances des `useMemo`)
  const weekStamp = `${weekKeys.join(',')}#${weekQueries.map(q => q.dataUpdatedAt).join(',')}`;
  const privateStamp = `${weekKeys.join(',')}#${privateQueries.map(q => q.dataUpdatedAt).join(',')}`;
  const allRowsByDate = useMemo(
    () => rowsByDate(weekQueries.flatMap(q => (Array.isArray(q.data) ? q.data : []))),
    [weekStamp],
  );
  const blockingByDate = useMemo(() => {
    const map = new Map();
    for (const [key, rows] of allRowsByDate) {
      map.set(key, rows.filter(blocksClient).filter(a => !(rescheduleId && String(a.id) === String(rescheduleId))));
    }
    return map;
  }, [allRowsByDate, rescheduleId]);
  const privatesByDate = useMemo(
    () => rowsByDate(privateQueries.flatMap(q => (Array.isArray(q.data) ? q.data : []))),
    [privateStamp],
  );

  const dayRows = selectedDateStr && weekQueryOf(selectedWeekKey)?.data ? (allRowsByDate.get(selectedDateStr) || EMPTY_LIST) : undefined;
  const appointments = (selectedDateStr && blockingByDate.get(selectedDateStr)) || EMPTY_LIST;
  const privateEvents = (selectedDateStr && privatesByDate.get(selectedDateStr)) || EMPTY_LIST;

  // Après une réponse perdue : ses propres RDV du jour, relus (et repris automatiquement au retour
  // du réseau) pour savoir si l'envoi a bien été enregistré
  const uncertainCheckQuery = useQuery({
    queryKey: ['uncertainBooking', user?.email, uncertainSend?.date],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email, date: uncertainSend.date }, 'start_time', 50),
    enabled: uncertainMatch && !!user?.email,
  });
  const uncertainRows = uncertainMatch ? uncertainCheckQuery.data : null;

  /**
   * Rendez-vous du client lui-même identique à la sélection (même règle que le doublon du serveur :
   * barber, jour, heure, prestations, confirmé). Il occupe l'heure choisie dans les créneaux relus,
   * mais « Confirmer » le rend tel quel : il ne doit pas faire retirer l'heure.
   */
  const ownSameBooking = useMemo(() => {
    if (!user?.email || !selectedEmployee || !selectedTime || !selectedDateStr) return null;
    const email = String(user.email).toLowerCase();
    const rows = [...(dayRows || []), ...(uncertainRows || [])];
    return rows.find(r => !!r && !!r.client_email && String(r.client_email).toLowerCase() === email
      && String(r.employee_id) === String(selectedEmployee.id)
      && (!r.date || String(r.date).slice(0, 10) === selectedDateStr)
      && String(r.start_time || '').slice(0, 5) === selectedTime
      && r.status === 'confirmed'
      && serviceKey(r.services) === selectedServiceKey) || null;
  }, [dayRows, uncertainRows, user?.email, selectedEmployee, selectedTime, selectedDateStr, selectedServiceKey]);

  // Créneaux d'une semaine calculables seulement quand ses RDV et pauses, les congés et les barbers
  // sont là : sans eux, toute la journée paraîtrait libre. Chargement → squelette ; échec (sans
  // données) → écran d'erreur. Requête en pause hors connexion : pas un chargement (squelette sans
  // fin) mais un échec. Privatisations : on attend leur lecture, son échec ne bloque pas.
  const baseSlotQueries = [timeOffsQuery, employeesQuery];
  const failedOf = (queries) => queries.find(q => q && ((q.isError && q.data === undefined) || isPausedQuery(q))) || null;
  const weekState = (weekKey) => {
    const rowsQuery = weekQueryOf(weekKey);
    const privQuery = privateQueryOf(weekKey);
    if (!rowsQuery) return 'loading';
    const queries = [rowsQuery, ...baseSlotQueries];
    if (queries.some(q => q.isPending && !isPausedQuery(q)) || (privQuery && privQuery.isPending && privQuery.fetchStatus !== 'paused')) return 'loading';
    return failedOf(queries) ? 'failed' : 'ready';
  };
  const slotsEnabled = !!selectedDate && (anyBarber || !!selectedEmployee);
  const selectedWeekState = slotsEnabled ? weekState(selectedWeekKey) : null;
  const slotsLoading = selectedWeekState === 'loading';
  const slotsFailedQuery = selectedWeekState === 'failed' ? failedOf([weekQueryOf(selectedWeekKey), ...baseSlotQueries]) : null;
  const slotsReady = selectedWeekState === 'ready';
  const slotsRetrying = [weekQueryOf(selectedWeekKey), ...baseSlotQueries].some(q => q?.isFetching);
  const retrySlots = () => {
    for (const q of [weekQueryOf(selectedWeekKey), privateQueryOf(selectedWeekKey), ...baseSlotQueries]) {
      if (q && (q.isError || q.data === undefined)) q.refetch();
    }
  };

  React.useEffect(() => {
    if (preSelectedIds.length > 0 && services.length > 0 && selectedServices.length === 0) {
      const preSelected = services.filter(s => preSelectedIds.includes(String(s.id)));
      if (preSelected.length > 0) setSelectedServices(preSelected);
      if (preSelected.length < new Set(preSelectedIds).size) setRetiredNotice(true);
    }
  }, [services]);

  // Lien avec des prestations (« Réserver » de la page Prestations, « Comme la dernière fois »,
  // relance, « Déplacer ») : toutes retrouvées dans le catalogue → directement l'écran Créneau.
  // Une prestation retirée : on reste sur le choix des prestations (bandeau « vérifiez »).
  // La réservation depuis une photo de la galerie garde son écran court.
  const autoAdvanced = useRef(false);
  useEffect(() => {
    if (autoAdvanced.current || step !== 0 || fromGallery || preSelectedIds.length === 0 || !servicesData) return;
    autoAdvanced.current = true;
    const found = servicesData.filter(s => preSelectedIds.includes(String(s.id)));
    if (found.length > 0 && found.length === new Set(preSelectedIds).size) {
      setDirection(1);
      setStep(1);
    }
  }, [servicesData, galleryFocus, step]);

  // Barber présélectionné à l'arrivée (une fois) : celui du lien s'il est réservable, sinon celui de
  // la dernière visite du client, sinon « Peu importe ». Attend la session, les barbers et, pour un
  // client connecté, ses rendez-vous (sans eux, on ne connaît pas son barber habituel).
  const usualBarber = useMemo(() => lastVisitBarber(myAppointments, employees), [myAppointments, employees]);
  const [barberReady, setBarberReady] = useState(false);
  useEffect(() => {
    if (barberReady || employeesPending) return;
    if (preSelectedBarber) {
      setAnyBarber(false);
      setSelectedEmployee(preSelectedBarber);
      setBarberReady(true);
      return;
    }
    if (isLoadingAuth || (myAppointmentsQuery.isPending && myAppointmentsQuery.fetchStatus === 'fetching')) return;
    setBarberReady(true);
    if (selectedEmployee || anyBarber) return;
    if (usualBarber && !missingBarber) setSelectedEmployee(usualBarber);
    else setAnyBarber(true);
  }, [barberReady, employeesPending, preSelectedBarber, isLoadingAuth, myAppointmentsQuery.isPending, myAppointmentsQuery.fetchStatus, usualBarber, missingBarber]);

  const catalogDuration = liveSelected.reduce((sum, s) => sum + (s.duration || 0), 0);
  // Déplacement avec les mêmes prestations : la durée allongée par le salon (« prévoir 1 h ») est
  // conservée, comme le fait le serveur ; sinon il refuserait (409) un créneau proposé ici
  const sameServicesAsOld = useMemo(() => {
    if (!oldApt || selectedServices.length === 0) return false;
    const key = (ids) => [...new Set(ids.filter(id => id !== undefined && id !== null && id !== '').map(String))].sort().join(',');
    const oldKey = key((Array.isArray(oldApt.services) ? oldApt.services : []).map(s => s?.service_id ?? s?.id));
    return oldKey !== '' && oldKey === key(selectedServices.map(s => s.id));
  }, [oldApt, selectedServices]);
  const totalDuration = sameServicesAsOld ? Math.max(catalogDuration, appointmentDuration(oldApt)) : catalogDuration;
  const totalPrice = liveSelected.reduce((sum, s) => sum + (s.price || 0), 0);

  // Produits ajoutés au rendez-vous (même catalogue et même cache que la Boutique). Pas proposés
  // pour un déplacement : les produits de l'ancien RDV suivent le nouveau côté serveur
  // (`reschedule_of`). Tant qu'on ne sait pas si c'est un déplacement, le bloc reste masqué.
  const productsQuery = useQuery(addonProductsQuery);
  const catalog = productsQuery.data;
  // Déplacement dont la réponse s'est perdue : l'ancien RDV, déjà annulé par le serveur, n'est plus
  // trouvé, mais ce n'est pas devenu une nouvelle réservation (pas de produits proposés)
  const addonsEnabled = !rescheduleId || (rescheduleUnavailable && !(uncertainMatch && uncertainSend?.previous));
  const addonProducts = useMemo(
    () => (catalog ? suggestAddonProducts(catalog, selectedServices) : EMPTY_LIST),
    [catalog, selectedServices],
  );
  const addonLines = useMemo(
    () => (addonsEnabled && catalog ? addonItems(addonSelection, catalog) : EMPTY_LIST),
    [addonsEnabled, catalog, addonSelection],
  );
  const addonSum = addonsEnabled && catalog ? addonTotal(addonSelection, catalog) : 0;
  const grandTotal = totalPrice + addonSum;

  // Prestations changées ou catalogue rechargé : la sélection est gardée, mais les produits qui ne
  // sont plus proposés (épuisés, retirés, hors suggestions) disparaissent et la quantité est
  // ramenée au stock restant. Rien n'est touché tant que le catalogue n'est pas chargé.
  useEffect(() => {
    if (!catalog) return;
    setAddonSelection(prev => {
      const allowed = new Map(addonProducts.map(p => [String(p.id), p]));
      const next = {};
      let changed = false;
      for (const [id, qty] of Object.entries(prev)) {
        const product = allowed.get(String(id));
        const kept = product ? Math.min(qty, addonMaxQuantity(product)) : 0;
        if (kept > 0) next[id] = kept;
        if (kept !== qty) changed = true;
      }
      return changed ? next : prev;
    });
  }, [catalog, addonProducts]);
  // Plus courte prestation choisie : sert à dire si c'est la durée qui empêche tout créneau
  const shortestDuration = liveSelected.reduce((min, s) => Math.min(min, s.duration || 30), 30);

  // Horloge à la minute : les créneaux du jour (calculés sur Date.now() par analyzeDay) sont
  // recalculés, une heure passée pendant que la page reste ouverte n'est plus proposée
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const key = parisDay(0).key;
      setTodayKey(prev => (prev === key ? prev : key));
      // Minuteries suspendues en arrière-plan (iOS) : heure et créneaux relus au retour
      setNowTick(Date.now());
      queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
      queryClient.invalidateQueries({ queryKey: ['privateEvents'] });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Lien Last Minute : date du lien sélectionnée si elle est dans l'horizon de réservation (sinon rien)
  useEffect(() => {
    if (presetApplied.current.date || !presetDateKey || !preSelectedBarber) return;
    presetApplied.current.date = true;
    const inRange = presetDateKey >= todayKey && presetDateKey < horizonKey;
    if (!selectedDate && inRange) {
      setSelectedDate(dateFromKey(presetDateKey));
    } else {
      presetApplied.current.time = true;
      if (presetTime && !selectedDate) setPresetMiss('gone');
    }
  }, [preSelectedBarber, todayKey]);

  // Jour changé pendant la réservation : une date choisie désormais passée est retirée
  useEffect(() => {
    if (!selectedDate || format(selectedDate, 'yyyy-MM-dd') >= todayKey) return;
    setSelectedDate(null);
    setSelectedTime(null);
    if (anyBarber) setSelectedEmployee(null);
    if (step === 2) { setDirection(-1); setStep(1); }
  }, [todayKey]);

  /**
   * Créneaux d'un jour (`dayOptions`, lib/availability.js) pour le barber choisi, ou union de tous
   * les barbers en « peu importe » (premier barber libre retenu pour chaque heure), avec la raison
   * quand il n'y en a aucun (`analyzeDay` / `mergeDayReasons`).
   */
  const scopeEmployee = anyBarber ? null : liveEmployee;
  // Barber connu (ou « peu importe » avec la liste des barbers) : les places peuvent se calculer
  const scopeReady = anyBarber ? !employeesPending : !!liveEmployee;
  const optionsForDay = (date, key) => dayOptions({
    date,
    employee: scopeEmployee,
    employees,
    rows: blockingByDate.get(key) || EMPTY_LIST,
    timeOffs,
    totalDuration,
    shortestDuration,
    privateEvents: privatesByDate.get(key) || EMPTY_LIST,
  });
  const { options: slotOptions, reason: emptyReason } = useMemo(() => {
    if (!selectedDate || !slotsReady || !scopeReady) return { options: [], reason: null };
    return optionsForDay(selectedDate, selectedDateStr);
  }, [scopeEmployee, scopeReady, selectedDate, selectedDateStr, slotsReady, blockingByDate, privatesByDate, timeOffs, totalDuration, shortestDuration, employees, nowTick]);

  // Places de chaque jour de l'horizon (bande de jours de l'écran Créneau), calculées pour les
  // semaines chargées ; les autres attendent (chargées au fil du défilement) ; lecture en échec → inconnu
  const weekStates = weekKeys.map(weekState);
  const stripDays = useMemo(() => horizonDays.map(({ date, key }) => {
    const i = weekKeys.indexOf(weekKeyOf(date));
    const stateOfWeek = i >= 0 ? weekStates[i] : 'loading';
    if (stateOfWeek === 'failed') return { date, key, status: 'unknown' };
    if (!scopeReady || stateOfWeek !== 'ready') return { date, key, status: 'loading' };
    const { options, reason } = optionsForDay(date, key);
    return options.length > 0 ? { date, key, status: 'open', count: options.length } : { date, key, status: 'empty', reason };
  }), [horizonDays, weekKeys.join(','), weekStates.join(','), scopeEmployee, scopeReady, blockingByDate, privatesByDate, timeOffs, totalDuration, shortestDuration, employees, nowTick]);

  // Prochaines disponibilités : premiers créneaux des deux premières semaines (deux par jour au
  // plus). `null` tant qu'elles ne sont pas chargées ; une semaine en échec est simplement sautée.
  const preloadStates = weekKeys.slice(0, PRELOAD_WEEKS).map(weekState);
  const nextItems = useMemo(() => {
    if (!scopeReady || preloadStates.includes('loading')) return null;
    const days = [];
    weekKeys.slice(0, PRELOAD_WEEKS).forEach((weekKey, i) => {
      if (preloadStates[i] !== 'ready') return;
      for (const { date, key } of weekDays(weekKey)) {
        if (key < todayKey || key >= horizonKey) continue;
        days.push({ date, key, options: optionsForDay(date, key).options });
      }
    });
    return pickNextOptions(days, { limit: 6, perDay: 2 });
  }, [preloadStates.join(','), weekKeys.join(','), todayKey, horizonKey, scopeEmployee, scopeReady, blockingByDate, privatesByDate, timeOffs, totalDuration, shortestDuration, employees, nowTick]);

  // L'heure choisie est-elle encore réservable ? (prestation ajoutée après coup, créneau pris entre-
  // temps) null = on ne sait pas encore (chargement) : on ne tranche pas.
  const selectedSlotValid = useMemo(() => {
    if (!selectedTime || !selectedDate || !slotsReady) return null;
    // Réponse perdue sur cette même sélection : l'heure reste choisie, le nouvel essai rend le RDV
    // existant (ou reçoit un vrai refus du serveur, traité par onError)
    if (uncertainMatch) return true;
    if (!selectedEmployee) return false;
    if (ownSameBooking) {
      // Son propre RDV identique, déjà enregistré : écarté du contrôle (barber précis comme « peu importe »)
      const own = appointments.filter(a => String(a.id) !== String(ownSameBooking.id)
        && String(a.employee_id) === String(selectedEmployee.id));
      return analyzeDay(liveEmployee, selectedDate, own, timeOffs, totalDuration, shortestDuration, privateEvents).slots.includes(selectedTime);
    }
    if (!anyBarber) return slotOptions.some(o => o.time === selectedTime);
    // « Peu importe » : le barber retenu doit encore être libre à cette heure (pas forcément le
    // premier de l'union, sinon un autre barber « passerait devant » à tort)
    const own = appointments.filter(a => String(a.employee_id) === String(selectedEmployee.id));
    return analyzeDay(liveEmployee, selectedDate, own, timeOffs, totalDuration, shortestDuration, privateEvents).slots.includes(selectedTime);
  }, [selectedTime, selectedDate, slotsReady, anyBarber, selectedEmployee, liveEmployee, slotOptions, appointments, timeOffs, totalDuration, shortestDuration, privateEvents, uncertainMatch, ownSameBooking, nowTick]);

  // Autres rendez-vous à venir du client qu'une nouvelle réservation ne remplacera PAS : le même
  // jour, ou les mêmes prestations à moins de 72 h (même règle que le serveur, qui refuse en 409 si
  // l'ancien est déjà dans le délai d'annulation sans `confirm_second`). Le client choisit
  // explicitement : « Déplacer plutôt celui-ci » (hors délai) ou « C'est un rendez-vous en plus ».
  const [extraAck, setExtraAck] = useState(false);
  const existingConflicts = useMemo(() => {
    if (rescheduleId || isStaffRole || !selectedDateStr || !selectedTime) return [];
    const now = Date.now();
    const newStart = parisInstant(selectedDateStr, selectedTime);
    return myAppointments
      .filter((a) => {
        if (!a || !['confirmed', 'pending'].includes(a.status) || !a.date) return false;
        // Renvoi du même envoi (réponse perdue) : c'est ce rendez-vous-là, pas un autre
        if (a.date === selectedDateStr && String(a.start_time || '').slice(0, 5) === selectedTime
          && selectedEmployee && String(a.employee_id) === String(selectedEmployee.id)) return false;
        const start = parisInstant(a.date, a.start_time || '00:00');
        if (!(start > now)) return false;
        if (a.date === selectedDateStr) return true;
        return serviceKey(a.services) === selectedServiceKey && Math.abs(start - newStart) <= 72 * 3600 * 1000;
      })
      .map((a) => ({
        apt: a,
        locked: withinCancelDelay(a, now),
        label: `${format(new Date(`${a.date}T12:00:00`), 'EEE d MMM', { locale: fr })} à ${String(a.start_time || '').slice(0, 5)}`,
      }));
  }, [myAppointments, rescheduleId, isStaffRole, selectedDateStr, selectedTime, selectedEmployee, selectedServiceKey, cancelHours]);
  // Nouvelle sélection : le choix « rendez-vous en plus » est redemandé
  useEffect(() => { setExtraAck(false); }, [selectedDateStr, selectedTime, selectedEmployee?.id, selectedServiceKey]);
  /** « Déplacer plutôt celui-ci » : la même sélection devient le déplacement de ce rendez-vous. */
  const moveInstead = (apt) => {
    const params = new URLSearchParams(window.location.search);
    params.set('reschedule', String(apt.id));
    navigate(`/booking?${params.toString()}`, { replace: true });
  };

  // RDV qui commence dans moins de `cancelHours` heures : il ne pourra plus être annulé ni déplacé
  // en ligne. Rien tant que les paramètres du salon ne sont pas chargés.
  const lateBooking = !!selectedDate && !!selectedTime && cancelHours > 0 && !settingsQuery.isPending
    && parisInstant(format(selectedDate, 'yyyy-MM-dd'), selectedTime) - Date.now() < cancelHours * 3600 * 1000;

  // Lien Last Minute : à l'arrivée sur l'étape Date & Heure, l'heure du lien est choisie si elle
  // figure parmi les créneaux calculés pour les prestations choisies (sinon rien, sans erreur)
  useEffect(() => {
    if (presetApplied.current.time || !presetTime || !presetApplied.current.date) return;
    if (step !== 1 || !slotsReady || !selectedDate || !selectedEmployee || selectedServices.length === 0) return;
    presetApplied.current.time = true;
    if (anyBarber || selectedTime) return;
    if (format(selectedDate, 'yyyy-MM-dd') !== presetDateKey) return;
    if (String(selectedEmployee.id) !== String(preSelectedBarberId)) return;
    if (slotOptions.some(o => o.time === presetTime)) { setSelectedTime(presetTime); return; }
    // Pas proposée : trop courte pour les prestations choisies (elle tiendrait pour 30 min au
    // plus), ou plus disponible (prise entre-temps, passée, barber absent)
    const passed = parisInstant(presetDateKey, presetTime) < Date.now();
    const shortLength = Math.min(30, shortestDuration || 30);
    const fitsShort = !passed && shortLength < totalDuration
      && analyzeDay(liveEmployee, selectedDate, appointments.filter(a => String(a.employee_id) === String(liveEmployee.id)), timeOffs, shortLength, shortestDuration, privateEvents).slots.includes(presetTime);
    setPresetMiss(fitsShort ? 'duration' : 'gone');
  }, [step, slotsReady, slotOptions, selectedDate, selectedEmployee]);

  // Le client choisit une autre heure, une autre date ou d'autres prestations : bandeau retiré
  // (pas à la présélection des prestations du lien, qui peut arriver après le bandeau)
  const prevServiceKey = useRef(selectedServiceKey);
  useEffect(() => {
    if (prevServiceKey.current && prevServiceKey.current !== selectedServiceKey) setPresetMiss(null);
    prevServiceKey.current = selectedServiceKey;
  }, [selectedServiceKey]);
  useEffect(() => { if (selectedTime) setPresetMiss(null); }, [selectedTime]);

  // Écran Créneau sans jour choisi : le premier jour qui a de la place (dans les deux premières
  // semaines) est choisi d'office, ses heures s'affichent tout de suite. Rien ne bouge si le client
  // a déjà un jour (lien Last Minute, retour depuis la confirmation, changement de barber).
  useEffect(() => {
    if (step !== 1 || selectedDate || !nextItems || nextItems.length === 0) return;
    setSelectedDate(nextItems[0].date);
  }, [step, selectedDate, nextItems]);

  const reduceMotion = useReducedMotion();
  // Titre d'étape : pas d'animation au premier affichage, une apparition à chaque changement
  const titleShownRef = useRef(false);
  useEffect(() => { titleShownRef.current = true; }, []);

  const toggleService = (service) => {
    hapticFeedback();
    const same = (s) => String(s.id) === String(service.id);
    setRetiredNotice(false);
    setSelectedServices(prev =>
      prev.some(same)
        ? prev.filter(s => !same(s))
        : [...prev, service]
    );
  };

  // Suggestion du sélecteur (ex. passer à une formule) ou prestation et compléments ajoutés depuis
  // la fiche : retire et ajoute en un seul rendu
  const swapServices = (remove, add) => {
    const removeIds = new Set(remove.map(s => String(s.id)));
    setRetiredNotice(false);
    setSelectedServices(prev => {
      const kept = prev.filter(s => !removeIds.has(String(s.id)));
      const known = new Set(kept.map(s => String(s.id)));
      return [...kept, ...add.filter(s => !known.has(String(s.id)))];
    });
  };

  const goToStep = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    hapticFeedback();
    // Chaque étape s'ouvre en haut de page (le catalogue a pu être défilé loin)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  };

  // Mesure d'audience : étapes atteintes (parcours de réservation d'Admin → Trafic)
  useEffect(() => {
    track('booking_step', { step: STEPS[step], from_gallery: fromGallery });
  }, [step]);

  // Redirection de l'écran de succès : annulée si la page est quittée avant (bouton retour…).
  // `mountedRef` : la page est-elle encore affichée ? TanStack Query exécute le onSuccess du hook
  // même après le démontage : sans ce repère, un retour pendant l'envoi ramenait de force sur
  // « Mes rendez-vous » 4 s plus tard, depuis la page où se trouvait le client.
  const successTimer = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; clearTimeout(successTimer.current); };
  }, []);

  /**
   * Action principale du catalogue (« Choisir » d'une ligne, d'une carte « Les plus demandées » ou de
   * la fiche d'une prestation) : exactement ces prestations, puis l'écran Créneau.
   */
  const pickServices = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    const seen = new Set();
    setSelectedServices(list.filter(s => s && !seen.has(String(s.id)) && seen.add(String(s.id))));
    setRetiredNotice(false);
    goToStep(1);
  };

  /** Écran Créneau, barber précis (quitte « peu importe ») : l'heure est gardée si ce barber l'a encore. */
  const chooseBarber = (emp) => {
    hapticFeedback();
    if (!anyBarber && String(selectedEmployee?.id) === String(emp.id)) return;
    setAnyBarber(false);
    setSelectedEmployee(emp);
    if (String(selectedEmployee?.id) !== String(emp.id)) setSelectedTime(null);
  };

  /** Écran Créneau, « peu importe » : le barber sera celui du créneau choisi. */
  const chooseAnyBarber = () => {
    hapticFeedback();
    if (anyBarber) return;
    setAnyBarber(true);
    setSelectedEmployee(null);
    setSelectedTime(null);
  };

  /** Jour du calendrier : ses heures s'affichent dessous (l'heure choisie sur un autre jour est retirée). */
  const chooseDay = (day) => {
    hapticFeedback();
    // Les heures s'affichent sous la bande de jours : sur un téléphone elles tombaient sous la barre
    // du bas et le tap semblait sans effet. La bande remonte en haut de l'écran, heures dessous.
    requestAnimationFrame(() => {
      const el = document.getElementById('day-strip');
      if (el && el.getBoundingClientRect().top > 24) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    if (selectedDateStr === day.key) return;
    setSelectedDate(day.date);
    setSelectedTime(null);
    setPresetMiss(null);
    if (anyBarber) setSelectedEmployee(null);
  };

  /** Heure choisie ; en « peu importe », le barber libre à cette heure devient le barber retenu. */
  const chooseSlot = (option) => {
    if (anyBarber && option.employee) setSelectedEmployee(option.employee);
    setSelectedTime(option.time);
    hapticFeedback();
  };

  /** « Prochaines disponibilités » : jour, heure (et barber en « peu importe ») d'un coup. */
  const chooseNext = (item) => {
    hapticFeedback();
    setSelectedDate(item.date);
    setPresetMiss(null);
    if (anyBarber && item.employee) setSelectedEmployee(item.employee);
    setSelectedTime(item.time);
  };

  /**
   * Annule l'ancien rendez-vous après un déplacement. Sans `features.appointmentCancelReason`,
   * exactement `{ status: 'cancelled' }` (un champ inconnu ferait refuser l'annulation).
   */
  const cancelPreviousAppointment = async (previous) => {
    const oldLabel = `${format(new Date(`${previous.date}T12:00:00`), 'EEE d MMM', { locale: fr })} ${previous.start_time || ''}`.trim();
    const newLabel = selectedDate && selectedTime ? `${format(selectedDate, 'EEE d MMM', { locale: fr })} ${selectedTime}` : '';
    try {
      await api.entities.Appointment.update(
        previous.id,
        features.appointmentCancelReason
          ? { status: 'cancelled', cancellation_reason: `Client : déplacé au ${newLabel}`.trim() }
          : { status: 'cancelled' },
      );
      toast.success('Ancien rendez-vous annulé');
    } catch {
      // Le serveur annule l'ancien lui-même à la création (reschedule_of) : l'échec de ce filet de
      // secours (réseau coupé) ne prouve rien, on relit l'état avant d'avertir
      const state = await checkOldCancelled(previous.id);
      if (state === 'cancelled') {
        toast.success('Ancien rendez-vous annulé');
      } else if (state === 'unknown') {
        toast.info('Connexion instable : vérifiez dans Mes rendez-vous que l\'ancien rendez-vous a bien disparu.', { duration: 8000 });
      } else {
        toast.warning(
          `Nouveau rendez-vous confirmé, mais l'ancien (${oldLabel}) n'a pas pu être annulé : annulez-le dans Mes rendez-vous ou appelez le salon au ${SALON_PHONE}.`,
          { duration: 12000 },
        );
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // Les produits de l'ancien RDV passent sur le nouveau : Mes commandes doit suivre
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
    }
  };

  const createAppointment = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !user) {
        // Redirect to login, will come back to booking
        // Toute la requête est gardée (`reschedule`, barber, prestations) : sans elle, un
        // déplacement repris après la connexion devenait un nouveau RDV et l'ancien restait prévu
        navigate(`/login?redirect=${encodeURIComponent(`/booking${window.location.search}`)}`);
        throw new Error('Non connecté');
      }
      if (user.role === 'admin' || user.role === 'barber') throw new Error('Les comptes de l\'équipe réservent depuis l\'agenda.');
      if (!selectedEmployee || !selectedDate || !selectedTime) throw new Error('Sélection incomplète');
      const [sh, sm] = selectedTime.split(':').map(Number);
      const endMin = sh * 60 + sm + totalDuration;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      // RDV à déplacer figé au moment de l'envoi ; délai d'annulation revérifié maintenant (pas
      // sur la valeur calculée à l'affichage : la page a pu rester ouverte plusieurs minutes)
      // Nouvel essai après une réponse perdue sur un déplacement : l'ancien RDV a pu être annulé
      // par le serveur entre-temps (il n'est plus trouvé) ; on renvoie quand même `reschedule_of`,
      // le serveur rend le RDV existant. Le délai ne se revérifie pas sur un envoi déjà passé.
      sendRef.current = null;
      const fromUncertain = !oldApt && uncertainMatch && uncertainSend?.previous ? uncertainSend.previous : null;
      const previous = oldApt || fromUncertain;
      if (previous && !fromUncertain && withinCancelDelay(previous, Date.now())) {
        throw Object.assign(new Error(`Ce rendez-vous est dans moins de ${cancelHours} h : pour le déplacer, appelez le salon au ${SALON_PHONE}.`), { tooLate: true });
      }
      sendRef.current = {
        employeeId: String(selectedEmployee.id),
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedTime,
        services: selectedServiceKey,
        previous,
      };
      const created = await api.entities.Appointment.create({
        client_email: user.email,
        client_name: user.full_name || user.name || '',
        employee_id: (liveEmployee || selectedEmployee).id,
        employee_name: (liveEmployee || selectedEmployee).name,
        services: liveSelected.map(s => ({ service_id: s.id, name: s.name, duration: s.duration, price: s.price })),
        date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime,
        end_time: endTime,
        total_duration: totalDuration,
        total_price: totalPrice,
        status: 'confirmed',
        notes: notes.slice(0, NOTES_MAX),
        // Déplacement : le serveur fait suivre au nouveau RDV les produits ajoutés à l'ancien
        ...(previous ? { reschedule_of: previous.id } : {}),
        // Rendez-vous en plus assumé par le client (un autre RDV reste prévu, bandeau coché)
        ...(!previous && extraAck && existingConflicts.length > 0 ? { confirm_second: true } : {}),
      });
      // Produits ajoutés : commande rattachée au RDV, créée seulement une fois le RDV confirmé.
      // Son échec ne remet jamais en cause la réservation (stock épuisé entre-temps, quota…).
      const items = previous ? [] : addonLines;
      let addon = null;
      if (items.length > 0) {
        const count = items.reduce((n, it) => n + it.quantity, 0);
        try {
          if (!created?.id) throw new Error('');
          await api.entities.Order.create({ items, appointment_id: created.id });
          addon = { ok: true, count };
        } catch (err) {
          if (created?.id && (isNetworkError(err) || err?.timeout)) {
            // Réponse perdue : la commande a peut-être été créée. Un seul nouvel essai, sans risque
            // (le serveur rend la commande existante pour le même rendez-vous)
            try {
              await api.entities.Order.create({ items, appointment_id: created.id });
              addon = { ok: true, count };
            } catch (err2) {
              addon = (isNetworkError(err2) || err2?.timeout)
                ? { ok: false, uncertain: true, count }
                : { ok: false, count, message: serverMessage(err2, 'le serveur n\'a pas répondu') };
            }
          } else {
            addon = { ok: false, count, message: serverMessage(err, 'le serveur n\'a pas répondu') };
          }
        }
      }
      return { created, previous, addon };
    },
    onSuccess: ({ created, previous, addon }) => {
      setUncertainSend(null);
      // Mesure d'audience : un rendez-vous réservé (un renvoi reconnu par le serveur ne compte pas)
      if (!created?.duplicate) {
        track('booking_done', {
          services: liveSelected.length, products: addon?.ok ? addon.count : 0,
          from_gallery: fromGallery, reschedule: !!previous,
        });
      }
      // Last Minute repris par cette réservation : retiré de l'accueil tout de suite (avant
      // l'invalidation, sinon l'écriture dans le cache l'annulerait), puis la liste est relue
      forgetBookedLastMinute(queryClient, created?.employee_id != null ? created : {
        employee_id: sendRef.current?.employeeId, date: sendRef.current?.date, start_time: sendRef.current?.time,
      });
      queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] }); // « Comme la dernière fois », Last Minute et prochain RDV de l'accueil
      // Le rendez-vous créé (id, heure de fin et prix recalculés par le serveur) alimente
      // l'« Ajouter au calendrier » de l'écran de succès
      setCreatedAppointment(created && typeof created === 'object' ? created : null);
      if (addon) {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['myOrders'] });
        queryClient.invalidateQueries({ queryKey: ['adminOrders'] });
      }
      const plural = addon?.count > 1;
      if (addon?.ok) {
        toast.success(plural ? 'Rendez-vous confirmé, vos produits vous attendront !' : 'Rendez-vous confirmé, votre produit vous attendra !');
      } else if (addon?.uncertain) {
        // Ne pas renvoyer vers la Boutique : la commande est peut-être déjà enregistrée
        toast.warning(`Rendez-vous confirmé. Connexion perdue pendant l'ajout ${plural ? 'des produits' : 'du produit'} : ${plural ? 'ils ont' : 'il a'} peut-être été enregistré${plural ? 's' : ''}. Vérifiez dans Mes commandes avant de recommander.`, { duration: 10000 });
      } else if (addon) {
        // Le message dit déjà que le rendez-vous est confirmé : pas de second toast
        toast.warning(
          `Rendez-vous confirmé, mais ${plural ? 'les produits n\'ont pas pu être ajoutés' : 'le produit n\'a pas pu être ajouté'} : ${addon.message}. Vous pouvez ${plural ? 'les' : 'le'} commander dans la Boutique.`,
          { duration: 10000 },
        );
      } else if (mountedRef.current) {
        toast.success('Rendez-vous confirmé !');
      }
      if (!mountedRef.current) {
        // Page quittée pendant l'envoi : ni écran de succès ni redirection forcée
        if (!addon) toast.success('Rendez-vous confirmé !', { action: { label: 'Voir', onClick: () => navigate('/appointments') } });
        if (previous) cancelPreviousAppointment(previous); // indispensable même hors de la page
        return;
      }
      // Explosion de lames, puis la liste des rendez-vous
      setSuccess(true);
      hapticFeedback();
      clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => navigate('/appointments'), SUCCESS_DURATION);
      // Déplacement : le nouveau RDV est confirmé, on annule l'ancien (jamais avant)
      if (previous) cancelPreviousAppointment(previous);
    },
    onError: (err) => {
      // Réseau coupé pendant l'envoi : le rendez-vous a peut-être été créé (réponse perdue). Le
      // serveur reconnaît le même envoi (même compte, barber, jour, heure et prestations, quel
      // que soit le délai) et ne le crée pas deux fois : on reste sur la confirmation, l'heure gardée.
      // Les créneaux du jour ne sont pas relus ici : ils contiendraient son propre RDV et l'heure
      // serait retirée (« n'est plus disponible »), poussant à en réserver une autre (second RDV).
      if (isNetworkError(err)) {
        toast.error('Connexion perdue : votre rendez-vous a peut-être été enregistré. Vérifiez Mes rendez-vous ou touchez de nouveau « Confirmer » (il ne sera pas créé deux fois).', { duration: 10000 });
        if (sendRef.current) setUncertainSend(sendRef.current);
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      setUncertainSend(null);
      // Le serveur vérifie la disponibilité et refuse pour des raisons précises (créneau passé,
      // hors horaires, congé, chevauchement, plafond de rendez-vous) : son message est affiché.
      const shown = serverMessage(err, 'Erreur lors de la création du rendez-vous');
      // Le client a déjà un RDV verrouillé (délai d'annulation) que celui-ci ne remplacerait pas :
      // on reste sur la confirmation, la liste relue fait apparaître le bandeau et son choix
      if (err?.data?.code === 'locked_appointment') {
        setExtraAck(false);
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        toast.error(`${shown}.`, {
          duration: 12000,
          action: { label: 'Appeler', onClick: () => { window.location.href = SALON_PHONE_HREF; } },
        });
        return;
      }
      // Déplacement impossible en ligne (ancien RDV dans le délai d'annulation, ou plus
      // déplaçable) : le salon s'en occupe, on reste sur la page
      if (err?.tooLate || (oldApt && err?.status === 409 && /pour le déplacer|ne peut plus être déplacé/i.test(shown))) {
        toast.error(`${shown}.`, {
          duration: 10000,
          action: { label: 'Appeler', onClick: () => { window.location.href = SALON_PHONE_HREF; } },
        });
        queryClient.invalidateQueries({ queryKey: ['salonSettings'] });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      if (oldApt && err?.status === 409) {
        // Déplacement : l'ancien RDV, encore confirmé, occupe son créneau et compte dans le
        // plafond des rendez-vous à venir. Un décalage de quelques minutes passe par le salon.
        // Ancien RDV relu : sa durée allongée par le salon (« prévoir 1 h ») est reprise par
        // `totalDuration`, sinon les mêmes heures trop courtes revenaient
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        toast.error(`${shown}. Choisissez une autre heure (pas la même heure de départ), ou appelez le salon au ${SALON_PHONE}.`, {
          duration: 10000,
          action: { label: 'Appeler', onClick: () => { window.location.href = SALON_PHONE_HREF; } },
        });
      } else {
        toast.error(shown);
      }
      // Refus 400 qui porte sur le créneau (passé entre-temps, congé posé, horaires changés) :
      // même chemin qu'un créneau pris, sinon la page restait sur l'heure refusée
      const slotRefused = err?.status === 400 && SLOT_REFUSED_RE.test(shown);
      if (err?.status === 409 || slotRefused) {
        // Retour au choix de l'heure : rester sur la confirmation laissait un récapitulatif sans
        // heure et un bouton actif. Les créneaux sont vidés puis rechargés (squelette pendant ce
        // temps) : l'heure refusée ne peut pas être reprise avant d'avoir les données à jour.
        queryClient.resetQueries({ queryKey: ['appointments-day'] });
        // Privatisation confirmée entre-temps (ou lecture échouée, repli sur une liste vide) :
        // relue aussi, sinon les mêmes heures refusées étaient reproposées en boucle
        queryClient.resetQueries({ queryKey: ['privateEvents'] });
        // Durée d'une prestation changée par le salon : le catalogue relu met à jour `liveSelected`,
        // donc l'heure refusée n'est plus reproposée
        queryClient.invalidateQueries({ queryKey: ['services'] });
        if (slotRefused) {
          // Congé ou horaires changés : barbers et congés relus aussi
          queryClient.invalidateQueries({ queryKey: ['employees'] });
          queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
        }
        setSelectedTime(null);
        if (anyBarber) setSelectedEmployee(null);
        goToStep(1);
      } else if (err?.status === 400) {
        // Autres refus (plafond de rendez-vous, prestation, note) : on reste sur la confirmation
        queryClient.invalidateQueries({ queryKey: ['appointments-day'] });
      }
    },
  });

  const canNext = () => {
    if (step === 0) return selectedServices.length > 0;
    if (step === 1) return !!selectedEmployee && !!selectedDate && !!selectedTime && selectedSlotValid === true;
    return true;
  };

  // Heure choisie devenue impossible (prestation ajoutée après coup, créneau pris entre-temps) :
  // retirée dès que les créneaux à jour sont là, avec un mot ; retour au choix de l'heure
  useEffect(() => {
    if (selectedSlotValid !== false || createAppointment.isPending || success || uncertainMatch) return;
    const old = selectedTime;
    setSelectedTime(null);
    if (anyBarber) setSelectedEmployee(null);
    toast.info(`${old} n'est plus disponible pour vos prestations : choisissez une autre heure.`);
    if (step === 2) { setDirection(-1); setStep(1); }
  }, [selectedSlotValid]);
  // « Confirmer » : sélection complète, et RDV à déplacer identifié (ou écarté) avant l'envoi
  // Comptes de l'équipe : ils réservent depuis l'agenda (le serveur refuse un RDV à leur propre
  // email). La navigation dans les étapes reste possible pour prévisualiser la page.
  const isStaffAccount = user?.role === 'admin' || user?.role === 'barber';
  // Lien « Déplacer » non vérifiable (liste en échec) : pas d'envoi tant que ce n'est pas vérifié ou
  // que le client n'a pas choisi « Réserver quand même » (l'ancien resterait prévu sans le savoir).
  // Autre RDV que celui-ci ne remplacera pas : choix explicite demandé (bandeau)
  const canConfirm = !!selectedEmployee && !!selectedDate && !!selectedTime && !reschedulePending && !rescheduleTooLate && !isStaffAccount
    && selectedSlotValid !== false && !rescheduleCheckFailed && (existingConflicts.length === 0 || extraAck);

  // Bouton retour d'Android : étape précédente (même règle que « Retour ») au lieu de quitter la
  // page et de perdre la sélection ; sur l'écran de succès, « Mes rendez-vous » tout de suite (sans
  // retour arrière suivi d'une redirection surprise). Sans effet sur le web et iOS.
  useAndroidBack(step > 0 && !success && !createAppointment.isPending, () => goToStep(step - 1));
  // Pendant l'envoi : le retour est ignoré (il quittait la page en pleine confirmation)
  useAndroidBack(createAppointment.isPending, () => {});
  useAndroidBack(success, () => {
    clearTimeout(successTimer.current);
    navigate('/appointments', { replace: true });
  });

  // Date sans créneau : pourquoi (repos, congé, journée terminée ou complète), et le conseil sur la
  // durée des prestations seulement quand un créneau plus court tiendrait ce jour-là.
  const emptyMessage = slotsReady && selectedDate && slotOptions.length === 0 && (anyBarber || selectedEmployee)
    ? emptyDayMessage(emptyReason, {
      barberName: anyBarber ? null : selectedEmployee.name,
      date: selectedDate,
      totalDuration,
      serviceCount: selectedServices.length,
      canChangeBarber: true,
    })
    : null;

  /**
   * Événement proposé sur l'écran de succès (« Ajouter au calendrier ») : le rendez-vous créé, avec
   * le même UID que dans Mes rendez-vous (`appointment-<id>@dhomebarber.fr`). L'ajouter ici puis
   * depuis la liste met à jour l'événement au lieu de le dupliquer dans l'agenda du client.
   */
  const calendarEvent = useMemo(() => {
    if (!success || !selectedEmployee || !selectedDate || !selectedTime) return null;
    const created = createdAppointment || {};
    return appointmentEvent({
      id: created.id,
      employee_name: created.employee_name || selectedEmployee.name,
      services: created.services || liveSelected,
      date: created.date || format(selectedDate, 'yyyy-MM-dd'),
      start_time: created.start_time || selectedTime,
      end_time: created.end_time,
      total_duration: created.total_duration ?? totalDuration,
      total_price: created.total_price ?? totalPrice,
    });
  }, [success, createdAppointment, selectedEmployee, selectedDate, selectedTime, liveSelected, totalDuration, totalPrice]);

  // Récapitulatifs de la barre du bas et de la confirmation
  const serviceCountLabel = `${liveSelected.length} prestation${liveSelected.length > 1 ? 's' : ''}`;
  const servicesTitle = liveSelected.length === 1 ? liveSelected[0].name : serviceCountLabel;
  const durationPrice = `${formatDuration(totalDuration)} · ${formatPrice(totalPrice)}`;
  const endTime = selectedTime ? (() => {
    const [h, m] = selectedTime.split(':').map(Number);
    const end = h * 60 + m + totalDuration;
    return `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  })() : null;
  // Heure limite du délai d'annulation (heure de Paris), pour ne pas la découvrir trop tard
  const cancelDeadline = selectedDateStr && selectedTime && cancelHours > 0 && !lateBooking
    ? PARIS_DEADLINE.format(new Date(parisInstant(selectedDateStr, selectedTime) - cancelHours * 3600 * 1000)).replace(', ', ' à ')
    : null;
  const selectedDayLabel = selectedDate ? upperFirst(format(selectedDate, 'EEEE d MMMM', { locale: fr })) : '';
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const showAddons = addonsEnabled && !galleryFocus && addonProducts.length > 0;
  const barberLabel = (liveEmployee || selectedEmployee)?.name;

  return (
    <div className="min-h-screen relative overflow-x-clip">
      {/* Halos d'ambiance */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-5 pb-48">
        {/* En-tête : retour, progression en trois étapes, titre */}
        <div className="mb-6">
          <BookingSteps step={step} onBack={() => goToStep(step - 1)} backDisabled={createAppointment.isPending} />

          {/* Le nouveau titre remplace l'ancien tout de suite, en fondu. Avec AnimatePresence
              mode="wait", il attendait la fin de la sortie de l'ancien : des changements d'étape
              rapprochés (refus 409 qui ramène au créneau) pouvaient laisser « Vérifiez et
              confirmez » au-dessus de l'écran Créneau (relevé par les tests le 20 oct. 2026) */}
          <motion.div
            key={step}
            initial={titleShownRef.current && !reduceMotion ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-4"
          >
            <h1 className="font-display text-[26px] leading-tight font-bold text-foreground">
              {step === 0 && galleryFocus ? 'Votre prestation' : STEP_TITLES[step]}
            </h1>
            {/* Heure du lien encore proposée (pas « plus disponible », pas remplacée par une autre) */}
            {step === 0 && !galleryFocus && (lastMinuteLink && presetMiss !== 'gone'
              && (!presetApplied.current.time || selectedTime === presetTime) ? (
              <p className="mt-2 flex items-start gap-2.5 rounded-2xl border border-orange-500/40 bg-orange-500/10 px-3.5 py-2.5 text-sm text-foreground">
                <Zap className="w-4 h-4 mt-0.5 shrink-0 fill-current text-orange-600 dark:text-orange-400" aria-hidden="true" />
                <span>
                  <span className="font-semibold">Last Minute avec {lastMinuteLink.barber}, {lastMinuteLink.day} à {lastMinuteLink.time}.</span>
                  {' '}Choisissez votre prestation : l'heure sera proposée à l'étape suivante.
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Touchez « Choisir » : vous choisirez ensuite le barber et l'heure.</p>
            ))}
          </motion.div>

          {/* Compte de l'équipe (admin qui parcourt les pages client) : réservation depuis l'agenda */}
          {isStaffAccount && !success && (
            <div role="status" className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90 break-words">
              Les comptes de l'équipe réservent depuis l'agenda.{' '}
              <Link to="/admin/agenda" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Ouvrir l'agenda</Link>
            </div>
          )}

          {/* Lien « Déplacer » inutilisable : la réservation sera un nouveau rendez-vous */}
          {rescheduleUnavailable && !success && !uncertainMatch && (
            <div role="status" className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90 break-words">
              {rescheduleCheckFailed
                ? 'Impossible de vérifier le rendez-vous à déplacer. Réessayez, ou réservez un nouveau rendez-vous : l\'ancien restera alors prévu.'
                : 'Ce rendez-vous ne peut plus être déplacé : celui-ci sera un nouveau rendez-vous.'}
              {' '}
              {rescheduleCheckFailed ? (
                <>
                  <button type="button" onClick={() => myAppointmentsQuery.refetch()} disabled={myAppointmentsQuery.isFetching}
                    className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap disabled:opacity-60">
                    {myAppointmentsQuery.isFetching ? 'Vérification…' : 'Réessayer'}
                  </button>
                  {' · '}
                  <button type="button" onClick={dropReschedule} className="font-semibold text-primary underline underline-offset-2">
                    Réserver un rendez-vous en plus
                  </button>
                </>
              ) : (
                <button type="button" onClick={dropReschedule} className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">
                  Compris
                </button>
              )}
            </div>
          )}

          {/* Déplacement impossible en ligne : l'ancien RDV est entré dans le délai d'annulation */}
          {rescheduleTooLate && !success && (
            <div role="status" className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90 break-words">
              Votre rendez-vous du <span className="font-semibold">{oldAptLabel}</span> est dans moins de {cancelHours} h : pour le déplacer,{' '}
              <a href={SALON_PHONE_HREF} className="font-semibold text-primary whitespace-nowrap">appelez le salon au {SALON_PHONE}</a>.
              {' '}
              <span className="mt-1.5 block">
                Réserver un autre créneau ne le supprimera pas : les deux resteraient prévus.{' '}
                <button type="button" onClick={dropReschedule} className="font-semibold text-primary underline underline-offset-2">
                  Réserver un rendez-vous en plus (celui du {oldAptLabel} reste prévu)
                </button>
              </span>
            </div>
          )}

          {retiredNotice && !success && (
            <div role="status" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-300 break-words">
              Une prestation de votre rendez-vous n'est plus proposée : vérifiez votre sélection.
            </div>
          )}

          {/* Déplacement d'un rendez-vous existant */}
          {oldApt && !rescheduleTooLate && !success && (
            <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/10 px-3.5 py-3 text-xs leading-relaxed text-foreground/90 break-words">
              Déplacement de votre rendez-vous du <span className="font-semibold">{oldAptLabel}</span>
              {oldApt.employee_name ? <> avec <span className="font-semibold">{oldApt.employee_name}</span></> : null}
              {' '}: l'ancien sera annulé une fois le nouveau confirmé.
              {' '}
              <button type="button" onClick={dropReschedule} className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">
                Ne pas déplacer
              </button>
              <span className="mt-1.5 block text-muted-foreground">
                Un décalage de quelques minutes est possible (pas la même heure de départ) ; en cas de souci, appelez le salon au{' '}
                <a href={SALON_PHONE_HREF} className="font-semibold text-primary whitespace-nowrap">{SALON_PHONE}</a>.
              </span>
            </div>
          )}
        </div>

        <div className="relative">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          {/* Étape 1 : prestations (écran court depuis une photo de la galerie) */}
          {step === 0 && galleryFocus && (
            <motion.div key="gallery-quick" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}>
              <GalleryQuickStep
                catalog={services}
                selected={liveSelected}
                photoServiceIds={preSelectedIds}
                loading={servicesPending || selectedServices.length === 0}
                barber={selectedEmployee || preSelectedBarber}
                onToggle={toggleService}
                onSwap={swapServices}
                onChangeServices={() => { hapticFeedback(); setFullPicker(true); }}
                addonsEnabled={addonsEnabled}
                addonSelection={addonSelection}
                onAddonChange={setAddonSelection}
              />
            </motion.div>
          )}
          {step === 0 && !galleryFocus && (
            <motion.div key="services" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}>
              {/* Même catalogue que la page Prestations : « Choisir » mène au créneau, la sélection
                  multiple passe par « Ajouter » et la barre du bas */}
              <ServicePicker
                services={services}
                loading={servicesPending && !servicesPaused}
                error={servicesQuery.isError && !servicesQuery.data ? servicesQuery.error : servicesPaused ? OFFLINE_ERROR : null}
                onRetry={servicesQuery.refetch}
                retrying={servicesQuery.isFetching}
                selectedIds={selectedServices.map(s => String(s.id))}
                onToggle={toggleService}
                onSwap={swapServices}
                onPick={pickServices}
                pickLabel="Choisir"
              />
            </motion.div>
          )}

          {/* Étape 2 : barber, jour et heure sur le même écran */}
          {step === 1 && (
            <motion.div key="datetime" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}
              className="space-y-6">
              {/* Prestations choisies */}
              <div className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-card">
                <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/12 text-primary flex items-center justify-center" aria-hidden="true">
                  <Scissors className="w-[18px] h-[18px]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground line-clamp-2 break-words">
                    {liveSelected.length > 1 ? liveSelected.map(s => s.name).join(' + ') : liveSelected[0]?.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{durationPrice}</p>
                </div>
                <button type="button" onClick={() => goToStep(0)}
                  className="shrink-0 min-h-[44px] px-2 text-[13px] font-semibold text-primary hover:text-primary/80">
                  Modifier
                </button>
              </div>

              {/* Avec qui ? */}
              <section aria-labelledby="barber-strip-title">
                <h2 id="barber-strip-title" className="text-[15px] font-semibold text-foreground mb-1">Avec qui ?</h2>
                {/* Lien (relance, « Comme la dernière fois ») vers un barber qui n'est plus réservable */}
                {missingBarber && (
                  <p role="status" className="my-2 px-3.5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs leading-relaxed text-amber-200/90">
                    Le barber de votre lien n'est plus disponible à la réservation : choisissez-en un autre, ou prenez le premier créneau disponible.
                  </p>
                )}
                <BarberStrip
                  employees={employees}
                  anyBarber={anyBarber}
                  selectedId={selectedEmployee?.id}
                  usualId={usualBarber?.id}
                  loading={employeesPending && !employeesPaused}
                  onAny={chooseAnyBarber}
                  onSelect={chooseBarber}
                />
                {/* Barbers impossibles à charger : seule « Peu importe » resterait, sans explication */}
                {((employeesQuery.isError && !employeesQuery.data) || employeesPaused) && (
                  <LoadError what="les barbers" error={employeesQuery.error} onRetry={employeesQuery.refetch}
                    retrying={employeesQuery.isFetching} compact className="mt-3" />
                )}
              </section>

              {/* Prochaines disponibilités : jour, heure et barber en un tap */}
              <NextSlots
                items={nextItems || EMPTY_LIST}
                loading={nextItems === null && !((employeesQuery.isError && !employeesQuery.data) || employeesPaused)}
                todayKey={todayKey}
                tomorrowKey={tomorrowKey}
                selectedKey={selectedDateStr}
                selectedTime={selectedTime}
                showBarber={anyBarber}
                onSelect={chooseNext}
              />

              {/* Lien Last Minute dont l'heure n'est pas proposée : on dit pourquoi */}
              {presetMiss && presetTime && !selectedTime && (!selectedDate || selectedDateStr === presetDateKey) && (
                <div role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90 break-words">
                  {presetMiss === 'duration'
                    ? `Le créneau Last Minute de ${presetTime} est trop court pour vos prestations : choisissez une prestation plus courte ou une autre heure.`
                    : `Le créneau Last Minute de ${presetTime} n'est plus disponible : choisissez une autre heure.`}
                </div>
              )}

              {/* Jours : bande qui défile, places de chaque jour */}
              <DayStrip
                days={stripDays}
                selectedKey={selectedDateStr}
                onSelect={chooseDay}
                onVisibleRange={onVisibleRange}
              />

              {/* Rien dans les deux prochaines semaines : on le dit (les flèches mènent plus loin) */}
              {!selectedDate && nextItems && nextItems.length === 0 && (
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {anyBarber ? 'Aucune place dans les deux prochaines semaines.' : `${barberLabel || 'Ce barber'} n'a plus de place dans les deux prochaines semaines.`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground/80">
                    {anyBarber ? 'Regardez les semaines suivantes avec les flèches.' : 'Choisissez « Peu importe », un autre barber, ou les semaines suivantes.'}
                  </p>
                </div>
              )}

              {/* Heures du jour choisi */}
              {selectedDate && (
                // Hauteur minimale : avec peu d'heures la page était trop courte pour remonter la bande
                // de jours en haut, et elle sautait à une hauteur différente à chaque jour touché
                <section aria-labelledby="day-slots-title" className="min-h-[60vh]">
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <h2 id="day-slots-title" className="text-[15px] font-semibold text-foreground">{selectedDayLabel}</h2>
                    {slotsReady && slotOptions.length > 0 && (
                      <span className="text-xs text-muted-foreground text-right">
                        {slotOptions.length} créneau{slotOptions.length > 1 ? 'x' : ''}{anyBarber ? ', tous barbers' : barberLabel ? ` avec ${barberLabel}` : ''}
                      </span>
                    )}
                  </div>
                  {slotsLoading || (!scopeReady && !slotsFailedQuery) ? (
                    <div className="grid grid-cols-4 gap-2" aria-busy="true" aria-label="Chargement des créneaux">
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="h-[52px] rounded-xl bg-card border border-border animate-pulse" />
                      ))}
                    </div>
                  ) : slotsFailedQuery ? (
                    <LoadError what="les créneaux" error={slotsFailedQuery.error} onRetry={retrySlots} retrying={slotsRetrying} compact />
                  ) : slotOptions.length > 0 ? (
                    <SlotGroups
                      options={slotOptions}
                      selectedTime={selectedTime}
                      selectedEmployeeId={selectedEmployee?.id}
                      showBarber={anyBarber}
                      onSelect={chooseSlot}
                    />
                  ) : emptyMessage && (
                    <div className="rounded-2xl border border-border bg-card p-6 text-center">
                      <p className="text-sm text-muted-foreground">{emptyMessage.title}</p>
                      <p className="mt-2 text-xs text-muted-foreground/80">{emptyMessage.hint}</p>
                    </div>
                  )}
                </section>
              )}
            </motion.div>
          )}

          {/* Étape 3 : confirmation */}
          {step === 2 && (
            <motion.div key="confirm" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}
              className="space-y-4">
              {/* Réponse perdue, mais le rendez-vous est bien enregistré : « Confirmer » le rend tel quel */}
              {uncertainMatch && ownSameBooking && !success && (
                <div role="status" className="p-3 rounded-2xl border border-primary/30 bg-primary/10 text-xs text-foreground/90 leading-relaxed break-words">
                  <span className="font-semibold">Votre rendez-vous est bien enregistré.</span>{' '}
                  Touchez « Confirmer » pour terminer, ou retrouvez-le dans{' '}
                  <Link to="/appointments" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Mes rendez-vous</Link>.
                </div>
              )}

              {/* Autre rendez-vous que celui-ci ne remplacera pas : choix explicite avant « Confirmer » */}
              {!success && existingConflicts.length > 0 && (
                <div role="status" className="p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 leading-relaxed break-words">
                  {existingConflicts.map(({ apt, locked, label }) => (
                    <p key={apt.id} className="mb-2">
                      Vous avez déjà rendez-vous le <span className="font-semibold text-amber-100">{label}</span>
                      {apt.employee_name ? <> avec <span className="font-semibold text-amber-100">{apt.employee_name}</span></> : null}.
                      {' '}Ce nouveau rendez-vous s'ajoutera : <span className="font-semibold text-amber-100">celui-ci restera prévu</span>.
                      {locked ? (
                        <>
                          {' '}Il est dans moins de {cancelHours} h : il ne peut plus être déplacé ni annulé en ligne. Pour le déplacer,{' '}
                          <a href={SALON_PHONE_HREF} className="font-semibold text-amber-100 underline whitespace-nowrap">appelez le salon au {SALON_PHONE}</a>.
                        </>
                      ) : (
                        <>
                          {' '}
                          <button type="button" onClick={() => moveInstead(apt)} className="font-semibold text-primary underline underline-offset-2">
                            Déplacer plutôt celui du {label}
                          </button>
                        </>
                      )}
                    </p>
                  ))}
                  <label className="flex items-start gap-2 cursor-pointer text-amber-100">
                    <input type="checkbox" checked={extraAck} onChange={(e) => setExtraAck(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
                    <span>C'est un rendez-vous en plus (pour moi ou un proche) : je garde {existingConflicts.length > 1 ? 'les autres' : 'l\'autre'}.</span>
                  </label>
                </div>
              )}

              {lateBooking && !rescheduleTooLate && (
                <div role="status" className="p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 leading-relaxed">
                  Ce rendez-vous commence dans moins de {cancelHours} h : il ne pourra plus être annulé ni déplacé en ligne.
                  En cas d'empêchement, appelez le salon au{' '}
                  <a href={SALON_PHONE_HREF} className="font-semibold text-amber-100 underline whitespace-nowrap">{SALON_PHONE}</a>.
                </div>
              )}
              <ConfirmSummary
                services={liveSelected}
                totalDuration={totalDuration}
                totalPrice={totalPrice}
                employee={liveEmployee || selectedEmployee}
                anyBarber={anyBarber}
                dateLabel={selectedDayLabel}
                time={selectedTime}
                endTime={endTime}
                onEditServices={() => goToStep(0)}
                onEditSlot={() => goToStep(1)}
              />

              {/* Produits de la boutique à ajouter (pas pour un déplacement : ceux de l'ancien RDV suivent).
                  Repliés : le client les ouvre s'il le souhaite. Déjà proposés avant le créneau quand la
                  réservation vient d'une photo : le total ci-dessous les reprend */}
              {showAddons && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <button type="button" onClick={() => { hapticFeedback(); setAddonsOpen(v => !v); }} aria-expanded={addonsOpen || addonLines.length > 0}
                    className="w-full min-h-[52px] px-3.5 flex items-center gap-3 text-left">
                    <ShoppingBag className="w-[18px] h-[18px] text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {addonLines.length > 0
                        ? `${addonLines.reduce((n, it) => n + it.quantity, 0)} produit${addonLines.reduce((n, it) => n + it.quantity, 0) > 1 ? 's' : ''} ajouté${addonLines.reduce((n, it) => n + it.quantity, 0) > 1 ? 's' : ''} · ${formatPrice(addonSum)}`
                        : 'Ajouter un produit de la boutique'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-primary shrink-0 transition-transform duration-300 ${addonsOpen || addonLines.length > 0 ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  <AnimatePresence initial={false}>
                    {(addonsOpen || addonLines.length > 0) && (
                      <motion.div key="addons" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.25 }} className="px-3.5 pb-3.5 empty:hidden">
                        <ProductAddon services={selectedServices} selection={addonSelection} onChange={setAddonSelection} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Note pour le barber, repliée tant qu'elle est vide */}
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <button type="button" onClick={() => { hapticFeedback(); setNoteOpen(v => !v); }} aria-expanded={noteOpen || !!notes}
                  className="w-full min-h-[52px] px-3.5 flex items-center gap-3 text-left">
                  <MessageSquare className="w-[18px] h-[18px] text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-sm font-medium text-foreground">{barberLabel ? `Ajouter une note pour ${barberLabel}` : 'Ajouter une note'}</span>
                  <ChevronDown className={`w-4 h-4 text-primary shrink-0 transition-transform duration-300 ${noteOpen || notes ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {(noteOpen || !!notes) && (
                  <div className="px-3.5 pb-3.5">
                    <Textarea
                      placeholder="Une précision pour votre barber (facultatif)"
                      aria-label="Note pour le barber"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                      maxLength={NOTES_MAX}
                      className="bg-background/40 border-border resize-none rounded-xl placeholder:text-muted-foreground/60"
                      rows={3}
                    />
                    <p className="mt-1 text-right text-[10px] text-muted-foreground">{notes.length}/{NOTES_MAX}</p>
                  </div>
                )}
              </div>

              {/* Délai pour déplacer ou annuler soi-même (heure de Paris) */}
              {cancelDeadline && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                  <span>Déplaçable ou annulable en ligne jusqu'au <span className="font-semibold text-foreground/80">{cancelDeadline}</span> ; ensuite, seul le salon pourra le faire.</span>
                </p>
              )}

              {/* Total */}
              <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
                {addonLines.length > 0 && (
                  <>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground">Prestations</span>
                      <span className="text-xs font-medium text-foreground tabular-nums">{formatPrice(totalPrice)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted-foreground">Produits</span>
                      <span className="text-xs font-medium text-foreground tabular-nums">{formatPrice(addonSum)}</span>
                    </div>
                  </>
                )}
                <div className={`flex justify-between items-center ${addonLines.length > 0 ? 'pt-2 border-t border-primary/20' : ''}`}>
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">Total</p>
                    <p className="text-[11px] text-muted-foreground">À régler au salon · {formatDuration(totalDuration)}</p>
                  </div>
                  <span className="font-fut text-[32px] font-bold leading-none text-primary tabular-nums">{formatPrice(grandTotal)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* Fond plein sous la barre et la barre du bas : le contenu ne transparaît plus entre les deux */}
      {!success && (step > 0 || selectedServices.length > 0) && (
        <div
          aria-hidden="true"
          className="booking-bar fixed inset-x-0 bottom-0 z-30 pointer-events-none h-[calc(12rem+env(safe-area-inset-bottom,0px))]"
          style={{ background: 'linear-gradient(to top, hsl(var(--background)) 72%, hsl(var(--background) / 0))' }}
        />
      )}

      {/* Barre fixée en bas : ce qui est choisi et le bouton de l'étape */}
      <AnimatePresence>
        {!success && step === 0 && selectedServices.length > 0 && (
          galleryFocus ? (
            <BookingBar
              key="bar-gallery"
              actionLabel={selectedEmployee ? `Choisir mon créneau avec ${selectedEmployee.name}` : 'Choisir mon créneau'}
              onAction={() => goToStep(1)}
              disabled={!canNext()}
            />
          ) : (
            <BookingBar
              key="bar-services"
              title={servicesTitle}
              subtitle={durationPrice}
              actionLabel="Continuer"
              onAction={() => goToStep(1)}
              disabled={!canNext()}
            />
          )
        )}
        {!success && step === 1 && (
          <BookingBar
            key="bar-slot"
            title={selectedTime && selectedDate ? `${upperFirst(format(selectedDate, 'EEE d MMM', { locale: fr }))} · ${selectedTime}` : 'Choisissez une heure'}
            subtitle={selectedTime && selectedEmployee ? `avec ${selectedEmployee.name} · ${durationPrice}` : durationPrice}
            actionLabel="Continuer"
            onAction={() => goToStep(2)}
            disabled={!canNext()}
          />
        )}
        {!success && step === 2 && (
          <BookingBar
            key="bar-confirm"
            actionLabel={createAppointment.isPending ? 'Confirmation…' : reschedulePending ? 'Vérification du rendez-vous…' : 'Confirmer le rendez-vous'}
            onAction={() => createAppointment.mutate()}
            disabled={createAppointment.isPending || !canConfirm}
            pulse={canConfirm && !createAppointment.isPending}
            icon={Check}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {success && (
          <SuccessOverlay
            key="success"
            barberName={selectedEmployee?.name}
            detail={selectedDate && selectedTime ? `${upperFirst(format(selectedDate, 'EEEE d MMMM', { locale: fr }))} · ${selectedTime}` : ''}
            calendarEvent={calendarEvent}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
