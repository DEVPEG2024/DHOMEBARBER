import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { CalendarDays, Plus, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const LEAVE_TYPES = [
  { value: 'vacation', label: 'Vacances' },
  { value: 'sick', label: 'Maladie' },
  { value: 'personal', label: 'Personnel' },
];

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Clock },
  approved: { label: 'Approuvé', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
  declined: { label: 'Refusé', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle },
};

export default function BarberLeave() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', type: 'vacation', reason: '' });

  const employeeId = user?.employee_id;

  // Fetch employee info to get name
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  const myEmployee = employees.find(e => e.id === employeeId);

  // Fetch my leave requests
  const { data: allTimeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });

  const myLeaves = allTimeOffs.filter(t => t.employee_id === employeeId);

  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date) {
      toast.error('Les dates de début et fin sont obligatoires');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('La date de fin doit être après la date de début');
      return;
    }
    setSaving(true);
    try {
      await api.entities.TimeOff.create({
        employee_id: employeeId,
        employee_name: myEmployee?.name || user?.full_name || '',
        start_date: form.start_date,
        end_date: form.end_date,
        type: form.type,
        reason: form.reason,
        status: 'pending',
      });
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      toast.success('Demande de congé envoyée');
      setForm({ start_date: '', end_date: '', type: 'vacation', reason: '' });
      setShowForm(false);
    } catch (err) {
      toast.error('Erreur lors de l\'envoi de la demande');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr + 'T00:00:00'), 'd MMM yyyy', { locale: fr });
    } catch { return dateStr; }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Mes congés</p>
          <h1 className="font-display text-2xl font-bold">Demandes de congés</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {myLeaves.filter(l => l.status === 'pending').length} en attente
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Nouvelle demande
        </Button>
      </div>

      {/* New request form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> Nouvelle demande de congé
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Date de début *</Label>
              <Input type="date" value={form.start_date}
                onChange={e => setForm(prev => ({ ...prev, start_date: e.target.value }))}
                className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date de fin *</Label>
              <Input type="date" value={form.end_date}
                onChange={e => setForm(prev => ({ ...prev, end_date: e.target.value }))}
                className="bg-background border-border" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <select
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
              >
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motif (optionnel)</Label>
              <Input value={form.reason} placeholder="Ex: Vacances familiales"
                onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                className="bg-background border-border" />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleSubmit} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
              {saving ? 'Envoi...' : 'Envoyer la demande'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Leave list */}
      {myLeaves.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Aucune demande de congé
        </div>
      ) : (
        <div className="space-y-3">
          {myLeaves.map((leave, i) => {
            const cfg = STATUS_CONFIG[leave.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const typeLabel = LEAVE_TYPES.find(t => t.value === leave.type)?.label || leave.type || 'Congé';

            return (
              <motion.div key={leave.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{typeLabel}</p>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Du {formatDate(leave.start_date)} au {formatDate(leave.end_date)}
                    </p>
                    {leave.reason && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{leave.reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Demandé le {formatDate(leave.requested_at?.split('T')[0] || leave.created_at?.split('T')[0])}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
