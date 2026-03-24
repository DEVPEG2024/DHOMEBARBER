import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { PartyPopper, Calendar, Clock, Users, MessageSquare, Send, CheckCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const EVENT_TYPES = [
  { id: 'evjf', label: 'EVJF', emoji: '👰', desc: 'Enterrement de vie de jeune fille' },
  { id: 'evjg', label: 'EVJG', emoji: '🤵', desc: 'Enterrement de vie de jeune garçon' },
  { id: 'anniversaire', label: 'Anniversaire', emoji: '🎂', desc: 'Fête d\'anniversaire' },
  { id: 'team_building', label: 'Team Building', emoji: '🤝', desc: 'Événement d\'entreprise' },
  { id: 'autre', label: 'Autre', emoji: '🎉', desc: 'Événement personnalisé' },
];

const TIME_SLOTS = [
  { id: 'morning', label: 'Matinée (9h-14h)' },
  { id: 'afternoon', label: 'Après-midi (14h-20h)' },
  { id: 'full_day', label: 'Journée complète (9h-20h)' },
];

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  confirmed: { label: 'Confirmé', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  declined: { label: 'Refusé', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export default function Events() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    event_type: '',
    date: '',
    time_slot: 'full_day',
    guest_count: '',
    message: '',
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: myEvents = [] } = useQuery({
    queryKey: ['myEvents', user?.email],
    queryFn: () => base44.entities.Event.filter({ client_email: user?.email }, '-created_at', 20),
    enabled: !!user?.email,
  });

  const createEvent = useMutation({
    mutationFn: (data) => base44.entities.Event.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myEvents'] });
      toast.success('Demande envoyée ! Nous vous recontacterons rapidement.');
      setShowForm(false);
      setForm({ event_type: '', date: '', time_slot: 'full_day', guest_count: '', message: '' });
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.event_type || !form.date) {
      toast.error('Type d\'événement et date requis');
      return;
    }
    createEvent.mutate({
      ...form,
      guest_count: parseInt(form.guest_count) || 1,
      client_name: user?.full_name || '',
      client_email: user?.email || '',
      client_phone: user?.phone || '',
      employees: employees.map(e => ({ id: e.id, name: e.name })),
      status: 'pending',
    });
  };

  const selectedType = EVENT_TYPES.find(t => t.id === form.event_type);

  return (
    <div className="max-w-lg mx-auto px-5 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
          <PartyPopper className="w-8 h-8 text-primary" />
        </div>
        <h1 className="font-display text-2xl font-bold">Privatiser le salon</h1>
        <p className="text-sm text-muted-foreground mt-1">
          EVJG, anniversaires, team building... Réservez le salon et toute l'équipe pour votre événement.
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { icon: Users, label: 'Équipe complète', sub: `${employees.length} barbers` },
          { icon: Clock, label: 'Demi-journée', sub: 'ou journée' },
          { icon: Sparkles, label: 'Sur mesure', sub: 'Personnalisé' },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label} className="glass rounded-2xl p-3 text-center">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      {!showForm && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all mb-6"
        >
          <Send className="w-4 h-4" />
          Demander une privatisation
        </motion.button>
      )}

      {/* Form */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-2xl p-5 mb-6 space-y-4"
        >
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <PartyPopper className="w-4 h-4 text-primary" />
            Votre événement
          </h2>

          {/* Event type */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Type d'événement *</label>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, event_type: type.id }))}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    form.event_type === type.id
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <span className="text-xl block mb-1">{type.emoji}</span>
                  <span className="text-[11px] font-semibold">{type.label}</span>
                </button>
              ))}
            </div>
            {selectedType && (
              <p className="text-[11px] text-muted-foreground mt-1.5">{selectedType.desc}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              <Calendar className="w-3 h-3 inline mr-1" />
              Date souhaitée *
            </label>
            <input type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
          </div>

          {/* Time slot */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              <Clock className="w-3 h-3 inline mr-1" />
              Créneau
            </label>
            <div className="space-y-2">
              {TIME_SLOTS.map(slot => (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, time_slot: slot.id }))}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    form.time_slot === slot.id
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          </div>

          {/* Guest count */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              <Users className="w-3 h-3 inline mr-1" />
              Nombre de personnes
            </label>
            <input type="number" min="1" max="30" placeholder="Ex: 8"
              value={form.guest_count}
              onChange={e => setForm(f => ({ ...f, guest_count: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm" />
          </div>

          {/* Message */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              <MessageSquare className="w-3 h-3 inline mr-1" />
              Message / demandes spéciales
            </label>
            <textarea rows={3} placeholder="Décrivez votre événement, vos envies..."
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm resize-none" />
          </div>

          {/* Submit */}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="flex-1 py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-all">
              Annuler
            </button>
            <button type="submit" disabled={createEvent.isPending}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {createEvent.isPending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Envoyer
                </>
              )}
            </button>
          </div>
        </motion.form>
      )}

      {/* My events */}
      {myEvents.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-primary" />
            Mes demandes
          </h2>
          <div className="space-y-3">
            {myEvents.map((event, i) => {
              const type = EVENT_TYPES.find(t => t.id === event.event_type);
              const status = STATUS_CONFIG[event.status] || STATUS_CONFIG.pending;
              const slot = TIME_SLOTS.find(s => s.id === event.time_slot);
              return (
                <motion.div key={event.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{type?.emoji || '🎉'}</span>
                      <div>
                        <p className="text-sm font-semibold">{type?.label || event.event_type}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {event.date && format(new Date(event.date + 'T12:00:00'), 'd MMMM yyyy', { locale: fr })}
                          {slot && ` · ${slot.label}`}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  {event.guest_count > 0 && (
                    <p className="text-xs text-muted-foreground">{event.guest_count} personne(s)</p>
                  )}
                  {event.price && (
                    <p className="text-sm font-bold text-primary mt-1">Devis : {event.price}€</p>
                  )}
                  {event.admin_notes && (
                    <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs text-muted-foreground">{event.admin_notes}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
