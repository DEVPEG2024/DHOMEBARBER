import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, User, Scissors, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import ServiceCard from '@/components/shared/ServiceCard';
import EmployeeCard from '@/components/shared/EmployeeCard';

const STEPS = ['services', 'barber', 'datetime', 'confirm'];
const STEP_LABELS = ['Prestations', 'Barber', 'Date & Heure', 'Confirmation'];
const STEP_ICONS = [Scissors, User, Calendar, Check];

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

export default function Booking() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [selectedServices, setSelectedServices] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [notes, setNotes] = useState('');

  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedIds = urlParams.get('services')?.split(',') || [];

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => base44.entities.Service.filter({ is_active: true }, 'sort_order', 100),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => base44.entities.TimeOff.list('-start_date', 200),
  });

  const { data: confirmedApts = [] } = useQuery({
    queryKey: ['appointments-confirmed', selectedDate, selectedEmployee?.id],
    queryFn: () => {
      if (!selectedDate || !selectedEmployee) return [];
      return base44.entities.Appointment.filter({
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
      return base44.entities.Appointment.filter({
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
      t.employee_id === selectedEmployee.id && dateStr >= t.start_date && dateStr <= t.end_date && (t.status === 'approved' || !t.status)
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
  }, [selectedEmployee, selectedDate, appointments, totalDuration]);

  const toggleService = (service) => {
    setSelectedServices(prev =>
      prev.find(s => s.id === service.id)
        ? prev.filter(s => s.id !== service.id)
        : [...prev, service]
    );
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
      return base44.entities.Appointment.create({
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
      navigate('/appointments');
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

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((_, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <React.Fragment key={i}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 ${
                    i < step ? 'bg-primary border-primary' :
                    i === step ? 'bg-primary/10 border-primary' :
                    'bg-white/5 border-white/10'
                  }`}>
                    {i < step ? (
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                    ) : (
                      <Icon className={`w-3.5 h-3.5 ${i === step ? 'text-primary' : 'text-muted-foreground/40'}`} />
                    )}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px transition-colors duration-300 ${i < step ? 'bg-primary' : 'bg-white/10'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground">{STEP_LABELS[step]}</h1>
          <p className="text-xs text-muted-foreground mt-1">Étape {step + 1} sur {STEPS.length}</p>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Services */}
          {step === 0 && (
            <motion.div key="services" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <p className="text-xs text-muted-foreground mb-4">Sélectionnez vos prestations puis appuyez sur Suivant.</p>
              <div className="space-y-3">
                {services.map(service => (
                  <ServiceCard key={service.id} service={service} selected={!!selectedServices.find(s => s.id === service.id)} onClick={toggleService} />
                ))}
              </div>
              {selectedServices.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-3 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{selectedServices.length} prestation{selectedServices.length > 1 ? 's' : ''}</p>
                    <p className="text-sm font-bold text-primary">{totalPrice}€ · {totalDuration} min</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Step 2: Employee */}
          {step === 1 && (
            <motion.div key="barber" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <p className="text-xs text-muted-foreground mb-4">Choisissez votre barber</p>
              <div className="grid grid-cols-2 gap-3">
                {employees.map(emp => (
                  <EmployeeCard key={emp.id} employee={emp} selected={selectedEmployee?.id === emp.id}
                    onClick={(e) => { setSelectedEmployee(e); setTimeout(() => setStep(2), 250); }} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Date & Time */}
          {step === 2 && (
            <motion.div key="datetime" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 flex items-center gap-2 text-foreground/80">
                  <Calendar className="w-4 h-4 text-primary" /> Choisir une date
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                  {dates.map(date => (
                    <button
                      key={date.toISOString()}
                      onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                      className={`flex-shrink-0 w-16 py-3 rounded-2xl text-center transition-all duration-300 ${
                        selectedDate && isSameDay(date, selectedDate)
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                          : 'backdrop-blur-xl bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                      }`}
                    >
                      <p className="text-[11px] uppercase opacity-70">{format(date, 'EEE', { locale: fr })}</p>
                      <p className="text-lg font-bold leading-tight">{format(date, 'd')}</p>
                      <p className="text-[11px] opacity-60">{format(date, 'MMM', { locale: fr })}</p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDate && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-sm font-medium mb-3 flex items-center gap-2 text-foreground/80">
                    <Clock className="w-4 h-4 text-primary" /> Créneaux disponibles
                  </p>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map(slot => (
                        <button
                          key={slot}
                          onClick={() => { setSelectedTime(slot); setTimeout(() => setStep(3), 250); }}
                          className={`py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                            selectedTime === slot
                              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                              : 'backdrop-blur-xl bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                          }`}
                        >
                          {slot}
                        </button>
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
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
              className="space-y-4">
              {/* Summary card */}
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                {[
                  { icon: User, label: 'Barber', value: selectedEmployee?.name },
                  { icon: Calendar, label: 'Date & Heure', value: `${selectedDate ? format(selectedDate, 'EEEE d MMMM', { locale: fr }) : ''} à ${selectedTime}` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
                      <p className="text-sm font-semibold text-foreground capitalize">{value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <Scissors className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Prestations</p>
                    {selectedServices.map(s => (
                      <p key={s.id} className="text-sm text-foreground">{s.name} <span className="text-primary font-semibold">{s.price}€</span></p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="backdrop-blur-xl bg-primary/10 border border-primary/20 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Durée totale</span>
                  <span className="text-xs font-medium text-foreground">{totalDuration} min</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-primary/20">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">{totalPrice}€</span>
                </div>
              </div>

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

        {/* Navigation */}
        <div className="flex gap-3 mt-8 pb-6">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-5 h-12 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 text-sm font-medium text-foreground hover:bg-white/10 transition-all">
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
          )}
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-semibold transition-all duration-300 ${
                canNext()
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90'
                  : 'bg-white/5 border border-white/10 text-muted-foreground cursor-not-allowed'
              }`}>
              Suivant <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={() => createAppointment.mutate()} disabled={createAppointment.isPending}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-60">
              {createAppointment.isPending ? 'Confirmation...' : 'Confirmer le rendez-vous'}
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}