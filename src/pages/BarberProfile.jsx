import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, Scissors, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BarberProfile() {
  const { id } = useParams();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const all = await base44.entities.Employee.filter({ is_active: true }, 'sort_order', 100);
      return all.find(e => e.id === id) || null;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Barber introuvable</p>
        <Link to="/" className="text-primary text-sm mt-2 inline-block">Retour à l'accueil</Link>
      </div>
    );
  }

  const initials = employee.name?.charAt(0) || '?';

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 pt-6 pb-28">
        {/* Back button */}
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ChevronLeft className="w-4 h-4" />
          Retour
        </Link>

        {/* Photo */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="w-32 h-32 rounded-3xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mx-auto shadow-2xl shadow-primary/10">
              {employee.photo_url ? (
                <img src={employee.photo_url} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-14 h-14 text-muted-foreground/30" />
                </div>
              )}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Scissors className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-foreground">{employee.name}</h1>
          <p className="text-sm text-primary font-medium mt-1">{employee.title || 'Barber'}</p>
        </motion.div>

        {/* Bio */}
        {employee.bio && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-5 mb-6">
            <h3 className="text-xs uppercase tracking-widest text-primary font-medium mb-3">À propos</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{employee.bio}</p>
          </motion.div>
        )}

        {/* Working hours */}
        {employee.working_hours && Object.keys(employee.working_hours).length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl bg-white/4 border border-white/8 backdrop-blur-xl p-5 mb-6">
            <h3 className="text-xs uppercase tracking-widest text-primary font-medium mb-3">Horaires</h3>
            <div className="space-y-2">
              {Object.entries(employee.working_hours).map(([day, hours]) => {
                const dayLabels = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };
                const label = dayLabels[day] || day;
                if (hours?.closed) {
                  return (
                    <div key={day} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-muted-foreground/50">Fermé</span>
                    </div>
                  );
                }
                return (
                  <div key={day} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium">{hours?.open || '09:00'} - {hours?.close || '19:00'}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Link to="/booking">
            <Button className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90">
              <Calendar className="w-4 h-4 mr-2" />
              Prendre rendez-vous avec {employee.name}
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
