import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, User, X, Scissors, Plus } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const statusConfig = {
  pending:   { label: 'En attente', bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmé',   bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  completed: { label: 'Terminé',    bg: 'bg-primary/10 text-primary border-primary/20' },
  cancelled: { label: 'Annulé',     bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
  no_show:   { label: 'Absent',     bg: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Appointments() {
  const [tab, setTab] = useState('upcoming');
  const [cancelId, setCancelId] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email }, '-date', 100),
    enabled: !!user?.email,
    refetchInterval: 15000, // Auto-refresh toutes les 15s
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.entities.Appointment.update(id, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
      toast.success('Rendez-vous annulé');
      setCancelId(null);
    },
  });

  const upcoming = appointments.filter(a => !isPast(parseISO(a.date)) && a.status !== 'cancelled' && a.status !== 'completed');
  const past = appointments.filter(a => isPast(parseISO(a.date)) || a.status === 'cancelled' || a.status === 'completed');
  const list = tab === 'upcoming' ? upcoming : past;

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
                const canCancel = apt.status === 'confirmed' && !isPast(parseISO(apt.date));
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
                          <p className="font-bold text-sm text-foreground capitalize">
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

                      {/* Cancel */}
                      {canCancel && (
                        <div className="mt-3 pt-3 border-t border-white/6 flex justify-end">
                          <button
                            onClick={() => setCancelId(apt.id)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Annuler le rendez-vous
                          </button>
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

      <AlertDialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <AlertDialogContent className="bg-card/90 backdrop-blur-2xl border-white/10 rounded-3xl mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl">Annuler ce rendez-vous ?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              Cette action est irréversible. Le créneau sera libéré.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="flex-1 rounded-2xl border-white/10 bg-white/5">Non, garder</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate(cancelId)}
              className="flex-1 rounded-2xl bg-red-500/90 text-white hover:bg-red-500"
            >
              Oui, annuler
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}