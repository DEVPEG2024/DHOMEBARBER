import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence, animate, useReducedMotion } from 'framer-motion';
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
const SUCCESS_DURATION = 3600;

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

/** Lame de rasoir (silhouette classique à double tranchant, rendu métallique). */
function RazorBlade({ width = 30 }) {
  return (
    <svg width={width} height={width * 0.45} viewBox="0 0 44 20" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M2 4 Q2 2 4 2 H40 Q42 2 42 4 V16 Q42 18 40 18 H4 Q2 18 2 16 Z" fill="url(#blade-metal)" stroke="#8a93a0" strokeWidth="0.6" />
      <path d="M14 8 h5 v-2.5 h6 v2.5 h5 v4 h-5 v2.5 h-6 v-2.5 h-5 z" fill="#0b0f0d" opacity="0.85" />
      <circle cx="8" cy="10" r="1.6" fill="#0b0f0d" opacity="0.85" />
      <circle cx="36" cy="10" r="1.6" fill="#0b0f0d" opacity="0.85" />
      <path d="M3 2.6 H41" stroke="#ffffff" strokeWidth="0.9" opacity="0.9" />
      <path d="M3 17.4 H41" stroke="#ffffff" strokeWidth="0.9" opacity="0.9" />
    </svg>
  );
}

/** Pluie de lames de rasoir : deux vagues, vol en arc, rotation et chute (transform / opacity uniquement). */
function RazorRain({ count = 26 }) {
  const parts = useMemo(() => Array.from({ length: count }, (_, i) => {
    const wave = i % 2;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 110 + Math.random() * 120;
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      rotate: (Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 540),
      width: 26 + Math.random() * 16,
      delay: wave * 0.7 + Math.random() * 0.35,
      duration: 2.2 + Math.random() * 0.6,
    };
  }), [count]);

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center" aria-hidden="true">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="blade-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7f9fc" />
            <stop offset="45%" stopColor="#b4bcc8" />
            <stop offset="70%" stopColor="#e6eaf0" />
            <stop offset="100%" stopColor="#9aa3b0" />
          </linearGradient>
        </defs>
      </svg>
      {parts.map(p => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y + 160, scale: 1, opacity: 0, rotate: p.rotate }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
            rotate: { duration: p.duration, delay: p.delay, ease: 'linear' },
            opacity: { duration: 0.7, delay: p.delay + p.duration - 0.8 },
          }}
          className="absolute"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        >
          <RazorBlade width={p.width} />
        </motion.span>
      ))}
    </div>
  );
}

/** Écran de succès : coche à ressort, anneau qui s'échappe, pluie de lames de rasoir, barre de redirection. */
export function SuccessOverlay({ barberName, duration = SUCCESS_DURATION }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-md"
    >
      <div className="relative flex flex-col items-center text-center px-8">
        <RazorRain />
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.05 }}
          className="relative w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/40"
        >
          <motion.span
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.3, ease: 'easeOut', delay: 0.2, repeat: Infinity, repeatDelay: 0.3 }}
            className="absolute inset-0 rounded-full border-2 border-primary"
          />
          <motion.span
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 1.3, ease: 'easeOut', delay: 0.85, repeat: Infinity, repeatDelay: 0.3 }}
            className="absolute inset-0 rounded-full border border-primary"
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.25, 1] }}
            transition={{ delay: 0.28, duration: 0.5, ease: 'easeOut' }}
          >
            <Check className="w-12 h-12 text-primary-foreground" strokeWidth={3} />
          </motion.div>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="font-display text-2xl font-bold text-foreground mt-6"
        >
          Rendez-vous confirmé
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-muted-foreground mt-2"
        >
          {barberName ? `${barberName} vous attend au salon.` : 'À très vite au salon.'}
        </motion.p>
        {/* Barre qui se remplit pendant l'attente avant la redirection */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-8 w-40 h-1 rounded-full bg-white/10 overflow-hidden"
        >
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: (duration - 900) / 1000, delay: 0.9, ease: 'linear' }}
            className="h-full w-full bg-primary origin-left"
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mt-3"
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
      // Écran de succès animé, puis la liste des rendez-vous
      setSuccess(true);
      hapticFeedback();
      toast.success('Rendez-vous confirmé !');
      setTimeout(() => navigate('/appointments'), SUCCESS_DURATION);
    },
    onError: () => {
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
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => createAppointment.mutate()} disabled={createAppointment.isPending}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
                {createAppointment.isPending ? 'Confirmation...' : 'Confirmer le rendez-vous'}
                <Check className="w-4 h-4" />
              </motion.button>
            </span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {success && <SuccessOverlay barberName={selectedEmployee?.name} />}
      </AnimatePresence>
    </div>
  );
}
