import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, animate, useReducedMotion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, User, Scissors, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import ServiceCard from '@/components/shared/ServiceCard';
import EmployeeCard from '@/components/shared/EmployeeCard';
import { hapticFeedback } from '@/lib/capacitor';

const STEPS = ['services', 'barber', 'datetime', 'confirm'];
const STEP_LABELS = ['Prestations', 'Barber', 'Date & Heure', 'Confirmation'];
const STEP_ICONS = [Scissors, User, Calendar, Check];

// Étapes qui glissent dans le sens de la navigation (suivant → entre par la droite)
const stepVariants = {
  enter: (dir) => ({ opacity: 0, x: dir >= 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -40 : 40 }),
};
const stepTransition = { x: { type: 'spring', stiffness: 380, damping: 34 }, opacity: { duration: 0.18 } };
const springy = { type: 'spring', stiffness: 420, damping: 30 };
/** Durée de l'écran de succès avant la redirection vers Mes rendez-vous (ms). */
const SUCCESS_DURATION = 4200;
/** Pluie de lames : nombre et instant de l'éclatement (s). */
const BLADE_COUNT = 30;
const BURST_AT = 0.35;
/** Écran de chargement (envoi du rendez-vous) : affiché au moins ce temps, progression simulée jusqu'à 88 % puis 100 % à la réponse. */
const LOADING_MIN_MS = 1500;
const LOADING_FAKE_DURATION = 2.4;
const TICK_COUNT = 34;

function generateTimeSlots(start, end, interval = 30) {
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

/** Nombre qui glisse de l'ancienne valeur à la nouvelle (écrit dans le DOM, sans re-render). */
function AnimatedNumber({ value, suffix = '', className }) {
  const ref = useRef(null);
  const previous = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const from = previous.current;
    previous.current = value;
    if (reduceMotion || from === value) { el.textContent = `${value}${suffix}`; return undefined; }
    const controls = animate(from, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = `${Math.round(v)}${suffix}`; },
    });
    return () => controls.stop();
  }, [value, suffix, reduceMotion]);

  return <span ref={ref} className={className}>{value}{suffix}</span>;
}

const Chip = React.forwardRef(function Chip({ icon: Icon, children }, ref) {
  return (
    <motion.span
      ref={ref}
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={springy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-foreground/90 capitalize"
    >
      {Icon && <Icon className="w-3 h-3 text-primary" />}
      {children}
    </motion.span>
  );
});

/** Graduation de l'arc : s'allume quand la progression dépasse son seuil. */
function Tick({ index, progress, angle, radius }) {
  const threshold = ((index + 1) / TICK_COUNT) * 100;
  const opacity = useTransform(progress, (v) => (v >= threshold ? 1 : 0.16));
  const glow = useTransform(progress, (v) => (v >= threshold ? 0.55 : 0));
  return (
    <g transform={`rotate(${angle})`}>
      <motion.rect x={radius - 3} y="-3" width="20" height="6" rx="3" fill="#bfe9ff" style={{ opacity: glow }} />
      <motion.rect x={radius} y="-1.4" width="14" height="2.8" rx="1.4" fill="#e9f7ff" style={{ opacity }} />
    </g>
  );
}

/** Lame de rasoir sombre (verticale) avec traînée de fines stries sur le tranchant droit. */
function DarkBlade() {
  const streaks = Array.from({ length: 22 }, (_, i) => 32 + i * 7.2);
  return (
    <g>
      <defs>
        <linearGradient id="ld-blade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a2f37" />
          <stop offset="45%" stopColor="#151920" />
          <stop offset="100%" stopColor="#0a0d11" />
        </linearGradient>
        <linearGradient id="ld-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="ld-streak" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5a626c" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#5a626c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* corps de la lame */}
      <rect x="22" y="18" width="104" height="208" rx="10" fill="url(#ld-blade)" stroke="url(#ld-edge)" strokeWidth="1.2" />
      {/* tranchants : liserés clairs */}
      <path d="M26,22 H122" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" strokeLinecap="round" />
      <path d="M26,222 H122" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="1" strokeLinecap="round" />
      {/* découpe centrale classique */}
      <circle cx="74" cy="52" r="7" fill="#07090c" />
      <circle cx="74" cy="192" r="7" fill="#07090c" />
      <rect x="67" y="70" width="14" height="104" rx="5" fill="#07090c" />
      <rect x="56" y="106" width="36" height="32" rx="6" fill="#07090c" />
      <rect x="62" y="84" width="24" height="12" rx="4" fill="#07090c" />
      <rect x="62" y="148" width="24" height="12" rx="4" fill="#07090c" />
      {/* stries qui filent vers la droite (mouvement) */}
      {streaks.map((y, i) => (
        <rect key={y} x="126" y={y} width={18 + (i % 4) * 8} height="1.6" rx="0.8" fill="url(#ld-streak)" />
      ))}
    </g>
  );
}

/** Écran de chargement pendant l'envoi du rendez-vous : lame, arc de graduations, pourcentage. */
export function LoadingOverlay({ progress }) {
  const percent = useTransform(progress, (v) => `${Math.round(v)} %`);
  const barScale = useTransform(progress, (v) => v / 100);
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, i) => ({ i, angle: -78 + (156 * i) / (TICK_COUNT - 1) })), []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 42%, #10141a 0%, #07090c 70%)' }}
    >
      <motion.svg
        viewBox="0 0 320 250"
        width="300"
        height="234"
        aria-hidden="true"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ overflow: 'visible' }}
      >
        {/* halo derrière la lame */}
        <ellipse cx="74" cy="122" rx="110" ry="130" fill="url(#ld-halo)" />
        <defs>
          <radialGradient id="ld-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b8fc9" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#3b8fc9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <DarkBlade />
        {/* arc de graduations, centré sur la lame */}
        <g transform="translate(74 122)">
          {ticks.map(({ i, angle }) => <Tick key={i} index={i} progress={progress} angle={angle} radius={150} />)}
        </g>
      </motion.svg>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col items-center mt-6">
        <p className="text-xl font-medium tracking-[0.42em] text-white/95 uppercase pl-[0.42em]">Chargement</p>
        <p className="text-[10px] tracking-[0.35em] text-white/45 uppercase mt-1.5 pl-[0.35em]">En cours</p>
        <motion.p className="text-3xl font-light text-white tabular-nums mt-4">{percent}</motion.p>
        <div className="mt-4 w-52 h-px bg-white/15 overflow-hidden">
          <motion.div className="h-full w-full bg-white/85 origin-left" style={{ scaleX: barScale }} />
        </div>
        <p className="text-[9px] tracking-[0.35em] text-white/35 uppercase mt-4 pl-[0.35em]">Veuillez patienter</p>
      </motion.div>
    </motion.div>
  );
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
export function SuccessOverlay({ barberName, detail, duration = SUCCESS_DURATION }) {
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
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-foreground/90 capitalize"
          >
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {detail}
          </motion.p>
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

export default function Booking() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  // Sens de la dernière navigation entre étapes (1 = suivant, -1 = retour)
  const [direction, setDirection] = useState(1);
  const [success, setSuccess] = useState(false);
  // Écran de chargement : progression simulée (motion value, pas de re-render)
  const [loading, setLoading] = useState(false);
  const progress = useMotionValue(0);
  const progressAnimRef = useRef(null);
  const loadingStartRef = useRef(0);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [notes, setNotes] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedIds = urlParams.get('services')?.split(',') || [];
  const preSelectedBarberId = urlParams.get('barber') || null;

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    staleTime: 5 * 60 * 1000, // catalogue : change rarement
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    refetchOnMount: 'always',
  });

  const { data: confirmedApts = [] } = useQuery({
    queryKey: ['appointments-confirmed', selectedDate, selectedEmployee?.id],
    queryFn: () => {
      if (!selectedDate || !selectedEmployee) return [];
      return api.entities.Appointment.filter({
        date: format(selectedDate, 'yyyy-MM-dd'),
        employee_id: selectedEmployee.id,
        status: 'confirmed'
      });
    },
    enabled: !!selectedDate && !!selectedEmployee,
  });

  const { data: breakApts = [] } = useQuery({
    queryKey: ['appointments-breaks', selectedDate, selectedEmployee?.id],
    queryFn: () => {
      if (!selectedDate || !selectedEmployee) return [];
      return api.entities.Appointment.filter({
        date: format(selectedDate, 'yyyy-MM-dd'),
        employee_id: selectedEmployee.id,
        status: 'break'
      });
    },
    enabled: !!selectedDate && !!selectedEmployee,
  });

  const appointments = useMemo(() => [...confirmedApts, ...breakApts], [confirmedApts, breakApts]);

  React.useEffect(() => {
    if (preSelectedIds.length > 0 && services.length > 0 && selectedServices.length === 0) {
      const preSelected = services.filter(s => preSelectedIds.includes(s.id));
      if (preSelected.length > 0) setSelectedServices(preSelected);
    }
  }, [services]);

  // Pre-select barber from URL param and skip barber step
  React.useEffect(() => {
    if (preSelectedBarberId && employees.length > 0 && !selectedEmployee) {
      const barber = employees.find(e => e.id === preSelectedBarberId);
      if (barber) {
        setSelectedEmployee(barber);
      }
    }
  }, [employees, preSelectedBarberId]);

  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);

  const dates = useMemo(() => {
    const d = [];
    for (let i = 0; i < 14; i++) {
      d.push(addDays(startOfDay(new Date()), i));
    }
    return d;
  }, []);

  const availableSlots = useMemo(() => {
    if (!selectedEmployee || !selectedDate) return [];
    // Check if barber is on approved leave
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const onLeave = timeOffs.some(t =>
      String(t.employee_id) === String(selectedEmployee.id) && dateStr >= String(t.start_date).slice(0,10) && dateStr <= String(t.end_date).slice(0,10) && (t.status === 'approved' || !t.status)
    );
    if (onLeave) return [];
    const dayName = format(selectedDate, 'EEEE').toLowerCase();
    const hours = selectedEmployee.working_hours?.[dayName];
    if (!hours || hours.closed) return [];
    const allSlots = generateTimeSlots(hours.start || '09:00', hours.end || '19:00', 30);
    return allSlots.filter(slot => {
      const [sh, sm] = slot.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      const slotEnd = slotStart + totalDuration;
      return !appointments.some(apt => {
        if (apt.status === 'cancelled') return false;
        const [ah, am] = apt.start_time.split(':').map(Number);
        const [bh, bm] = apt.end_time.split(':').map(Number);
        const aptStart = ah * 60 + am;
        const aptEnd = bh * 60 + bm;
        return slotStart < aptEnd && slotEnd > aptStart;
      });
    });
  }, [selectedEmployee, selectedDate, appointments, totalDuration, timeOffs]);

  const toggleService = (service) => {
    hapticFeedback();
    setSelectedServices(prev =>
      prev.find(s => s.id === service.id)
        ? prev.filter(s => s.id !== service.id)
        : [...prev, service]
    );
  };

  const goToStep = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    hapticFeedback();
  };

  const startLoading = () => {
    loadingStartRef.current = Date.now();
    progress.set(0);
    setLoading(true);
    progressAnimRef.current?.stop();
    progressAnimRef.current = animate(progress, 88, { duration: LOADING_FAKE_DURATION, ease: 'easeInOut' });
  };

  const finishLoading = () => {
    // Affiché au moins LOADING_MIN_MS, puis 100 %, puis la scène de coupe
    const wait = Math.max(0, LOADING_MIN_MS - (Date.now() - loadingStartRef.current));
    setTimeout(() => {
      progressAnimRef.current?.stop();
      progressAnimRef.current = animate(progress, 100, {
        duration: 0.45,
        ease: 'easeOut',
        onComplete: () => setTimeout(() => {
          setLoading(false);
          setSuccess(true);
          hapticFeedback();
          setTimeout(() => navigate('/appointments'), SUCCESS_DURATION);
        }, 300),
      });
    }, wait);
  };

  const createAppointment = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated || !user) {
        // Redirect to login, will come back to booking
        navigate('/login?redirect=/booking');
        throw new Error('Non connecté');
      }
      const [sh, sm] = selectedTime.split(':').map(Number);
      const endMin = sh * 60 + sm + totalDuration;
      const endTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      return api.entities.Appointment.create({
        client_email: user.email,
        client_name: user.full_name || user.name || '',
        employee_id: selectedEmployee.id,
        employee_name: selectedEmployee.name,
        services: selectedServices.map(s => ({ service_id: s.id, name: s.name, duration: s.duration, price: s.price })),
        date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime,
        end_time: endTime,
        total_duration: totalDuration,
        total_price: totalPrice,
        status: 'confirmed',
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments-confirmed'] });
      toast.success('Rendez-vous confirmé !');
      // Chargement → 100 % → scène de coupe → liste des rendez-vous
      finishLoading();
    },
    onError: () => {
      progressAnimRef.current?.stop();
      setLoading(false);
      toast.error('Erreur lors de la création du rendez-vous');
    },
  });

  const canNext = () => {
    if (step === 0) return selectedServices.length > 0;
    if (step === 1) return !!selectedEmployee;
    if (step === 2) return !!selectedDate && !!selectedTime;
    return true;
  };

  const hasRecap = selectedServices.length > 0 || !!selectedEmployee || !!selectedTime;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 bg-primary/6 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-primary/70 font-medium mb-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            Réservation
          </p>

          {/* Step indicators : halo qui glisse d'une étape à l'autre, coches à ressort, lignes qui se remplissent */}
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((_, i) => {
              if (i === 1 && preSelectedBarberId) return null;
              const Icon = STEP_ICONS[i];
              const done = i < step;
              const active = i === step;
              return (
                <React.Fragment key={i}>
                  <motion.div
                    animate={{ scale: active ? 1.1 : 1 }}
                    transition={springy}
                    className={`relative flex items-center justify-center w-8 h-8 rounded-full border transition-colors duration-300 ${
                      done ? 'bg-primary border-primary' :
                      active ? 'bg-primary/10 border-primary' :
                      'bg-white/5 border-white/10'
                    }`}
                  >
                    {active && (
                      <motion.span layoutId="step-halo" transition={springy} className="absolute -inset-1.5 rounded-full border border-primary/40" />
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                      {done ? (
                        <motion.span key="done" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }} className="flex">
                          <Check className="w-3.5 h-3.5 text-primary-foreground" />
                        </motion.span>
                      ) : (
                        <motion.span key="icon" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
                          <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-muted-foreground/40'}`} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                  {i < STEPS.length - 1 && !(i === 0 && preSelectedBarberId) && (
                    <div className="flex-1 h-px bg-white/10 relative overflow-hidden">
                      <motion.div
                        initial={false}
                        animate={{ scaleX: i < step ? 1 : 0 }}
                        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                        className="absolute inset-0 bg-primary origin-left"
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              <h1 className="font-display text-2xl font-bold text-foreground">{STEP_LABELS[step]}</h1>
              <p className="text-xs text-muted-foreground mt-1">Étape {step + 1} sur {STEPS.length}{preSelectedBarberId && selectedEmployee ? ` · avec ${selectedEmployee.name}` : ''}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative">
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          {/* Step 1: Services */}
          {step === 0 && (
            <motion.div key="services" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}>
              <p className="text-xs text-muted-foreground mb-4">Sélectionnez vos prestations puis appuyez sur Suivant.</p>
              <div className="space-y-3">
                {services.map((service, i) => (
                  <motion.div key={service.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: 'easeOut' }}>
                    <ServiceCard service={service} selected={!!selectedServices.find(s => s.id === service.id)} onClick={toggleService} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Employee */}
          {step === 1 && (
            <motion.div key="barber" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}>
              <p className="text-xs text-muted-foreground mb-4">Choisissez votre barber</p>
              <div className="grid grid-cols-2 gap-3">
                {employees.map((emp, i) => (
                  <motion.div key={emp.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3, ease: 'easeOut' }}>
                    <EmployeeCard employee={emp} selected={selectedEmployee?.id === emp.id}
                      onClick={(e) => { setSelectedEmployee(e); hapticFeedback(); setTimeout(() => goToStep(2), 250); }} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Date & Time */}
          {step === 2 && (
            <motion.div key="datetime" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}>
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 flex items-center gap-2 text-foreground/80">
                  <Calendar className="w-4 h-4 text-primary" /> Choisir une date
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                  {dates.map((date, i) => {
                    const active = selectedDate && isSameDay(date, selectedDate);
                    return (
                      <motion.button
                        key={date.toISOString()}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.3, ease: 'easeOut' }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => { setSelectedDate(date); setSelectedTime(null); hapticFeedback(); }}
                        className={`flex-shrink-0 w-16 py-3 rounded-2xl text-center transition-colors duration-300 ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                            : 'backdrop-blur-xl bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                        }`}
                      >
                        <p className="text-[11px] uppercase opacity-70">{format(date, 'EEE', { locale: fr })}</p>
                        <p className="text-lg font-bold leading-tight">{format(date, 'd')}</p>
                        <p className="text-[11px] opacity-60">{format(date, 'MMM', { locale: fr })}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {selectedDate && (
                <motion.div key={selectedDate.toISOString()} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-sm font-medium mb-3 flex items-center gap-2 text-foreground/80">
                    <Clock className="w-4 h-4 text-primary" /> Créneaux disponibles
                  </p>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((slot, i) => (
                        <motion.button
                          key={slot}
                          layoutId={`slot-${slot}`}
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ delay: Math.min(i, 14) * 0.025, duration: 0.28, ease: 'easeOut', layout: springy }}
                          whileTap={{ scale: 0.94 }}
                          onClick={() => { setSelectedTime(slot); hapticFeedback(); setTimeout(() => goToStep(3), 250); }}
                          className={`py-3 rounded-xl text-sm font-semibold transition-colors duration-300 ${
                            selectedTime === slot
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                              : 'backdrop-blur-xl bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                          }`}
                        >
                          {slot}
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                      <p className="text-sm text-muted-foreground">Aucun créneau disponible ce jour</p>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Step 4: Confirm */}
          {step === 3 && (
            <motion.div key="confirm" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={stepTransition}
              className="space-y-4">
              {/* Summary card */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                {[
                  { icon: User, label: 'Barber', value: selectedEmployee?.name },
                  {
                    icon: Calendar,
                    label: 'Date & Heure',
                    value: (
                      <>
                        {selectedDate ? format(selectedDate, 'EEEE d MMMM', { locale: fr }) : ''} à{' '}
                        <motion.span
                          layoutId={`slot-${selectedTime}`}
                          transition={springy}
                          className="inline-block px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-bold tabular-nums"
                        >
                          {selectedTime}
                        </motion.span>
                      </>
                    ),
                  },
                ].map(({ icon: Icon, label, value }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-foreground capitalize">{value}</p>
                    </div>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.26 }} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <Scissors className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Prestations</p>
                    {selectedServices.map(s => (
                      <p key={s.id} className="text-sm text-foreground">{s.name} <span className="text-primary font-semibold">{s.price}€</span></p>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Total */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="backdrop-blur-xl bg-primary/10 border border-primary/20 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Durée totale</span>
                  <span className="text-xs font-medium text-foreground">{totalDuration} min</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">{totalPrice}€</span>
                </div>
              </motion.div>

              <Textarea
                placeholder="Ajouter une note (optionnel)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="backdrop-blur-xl bg-white/5 border-white/10 resize-none rounded-2xl placeholder:text-muted-foreground/40"
                rows={3}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* Récapitulatif qui grandit à chaque choix : prix qui compte */}
        <AnimatePresence>
          {hasRecap && step !== 3 && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={springy}
              className="mt-6 p-3.5 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Votre réservation</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-xs">
                  <AnimatePresence mode="popLayout">
                    {selectedServices.length > 0 && (
                      <Chip key="services" icon={Scissors}>{selectedServices.length} prestation{selectedServices.length > 1 ? 's' : ''}</Chip>
                    )}
                    {selectedEmployee && <Chip key="barber" icon={User}>{selectedEmployee.name}</Chip>}
                    {selectedDate && <Chip key="date" icon={Calendar}>{format(selectedDate, 'EEE d MMM', { locale: fr })}</Chip>}
                  </AnimatePresence>
                </div>
              </div>
              <div className="text-right shrink-0">
                <AnimatedNumber value={totalPrice} suffix="€" className="block text-lg font-bold text-primary tabular-nums leading-tight" />
                <p className="text-[10px] text-muted-foreground"><AnimatedNumber value={totalDuration} suffix=" min" /></p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex gap-3 mt-6 pb-6">
          {step > 0 && (
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => goToStep((step === 2 && preSelectedBarberId) ? 0 : step - 1)}
              className="flex items-center gap-2 px-5 h-12 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 text-sm font-medium text-foreground hover:bg-white/10 transition-all">
              <ChevronLeft className="w-4 h-4" /> Retour
            </motion.button>
          )}
          {step < 3 ? (
            <motion.button whileTap={canNext() ? { scale: 0.97 } : undefined} onClick={() => goToStep((step === 0 && preSelectedBarberId) ? 2 : step + 1)} disabled={!canNext()}
              className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                canNext()
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90'
                  : 'bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed'
              }`}>
              Suivant <ChevronRight className="w-4 h-4" />
            </motion.button>
          ) : (
            <span className="flex-1 pulse-cta rounded-2xl">
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => { if (createAppointment.isPending || loading) return; startLoading(); createAppointment.mutate(); }} disabled={createAppointment.isPending || loading}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
                {createAppointment.isPending ? 'Confirmation...' : 'Confirmer le rendez-vous'}
                <Check className="w-4 h-4" />
              </motion.button>
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {loading && <LoadingOverlay key="loading" progress={progress} />}
        {success && (
          <SuccessOverlay
            key="success"
            barberName={selectedEmployee?.name}
            detail={selectedDate && selectedTime ? `${format(selectedDate, 'EEEE d MMMM', { locale: fr })} · ${selectedTime}` : ''}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
