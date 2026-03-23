import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Brain, TrendingDown, Coffee, Moon, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function SmartAgenda() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showTimeOffDialog, setShowTimeOffDialog] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [newTimeOff, setNewTimeOff] = useState({ employee_id: '', start_date: '', end_date: '', reason: '', type: 'vacation' });
  const queryClient = useQueryClient();

  const baseDate = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
  const weekDays = eachDayOfInterval({ start: baseDate, end: endOfWeek(baseDate, { weekStartsOn: 1 }) });

  const { data: appointments = [] } = useQuery({
    queryKey: ['allAppointments'],
    queryFn: () => base44.entities.Appointment.list('-date', 500),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ is_active: true }),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => base44.entities.TimeOff.list('-start_date', 100),
  });

  const addTimeOff = useMutation({
    mutationFn: (data) => {
      const emp = employees.find(e => e.id === data.employee_id);
      return base44.entities.TimeOff.create({ ...data, employee_name: emp?.name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      setShowTimeOffDialog(false);
      setNewTimeOff({ employee_id: '', start_date: '', end_date: '', reason: '', type: 'vacation' });
      toast.success('Congé enregistré');
    },
  });

  const deleteTimeOff = useMutation({
    mutationFn: (id) => base44.entities.TimeOff.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      toast.success('Congé supprimé');
    },
  });

  // Daily appointment counts for the week
  const weekStats = useMemo(() => {
    return weekDays.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayApts = appointments.filter(a => a.date === dayStr && a.status !== 'cancelled');
      const revenue = dayApts.reduce((s, a) => s + (a.total_price || 0), 0);
      return { day, dayStr, count: dayApts.length, revenue, apts: dayApts };
    });
  }, [weekDays, appointments]);

  // Analyze slow periods and generate AI suggestions
  const handleAISuggestions = async () => {
    setAiLoading(true);
    try {
      // Count appointments per day of week over last 30 days
      const dayCounts = {};
      for (let i = 0; i < 7; i++) dayCounts[i] = { total: 0, days: 0 };
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 60);
      appointments
        .filter(a => a.status !== 'cancelled' && new Date(a.date) >= cutoff)
        .forEach(a => {
          const d = new Date(a.date).getDay();
          dayCounts[d].total++;
          dayCounts[d].days = Math.max(dayCounts[d].days, 1);
        });

      const avgPerDay = {};
      for (let i = 0; i < 7; i++) {
        const weeks = 8;
        avgPerDay[i] = (dayCounts[i].total / weeks).toFixed(1);
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Tu es un expert en gestion de planning pour un barbershop.

Voici les moyennes de rendez-vous par jour de la semaine sur les 2 derniers mois:
- Lundi: ${avgPerDay[1]} RDV/semaine
- Mardi: ${avgPerDay[2]} RDV/semaine
- Mercredi: ${avgPerDay[3]} RDV/semaine
- Jeudi: ${avgPerDay[4]} RDV/semaine
- Vendredi: ${avgPerDay[5]} RDV/semaine
- Samedi: ${avgPerDay[6]} RDV/semaine
- Dimanche: ${avgPerDay[0]} RDV/semaine

L'équipe compte ${employees.length} barbers: ${employees.map(e => e.name).join(', ')}.

Identifie les 3 périodes creuses principales et propose des recommandations de congés optimisées pour réduire les coûts tout en maintenant la couverture client. Pour chaque suggestion, indique le jour de la semaine, quel(s) barber(s) peuvent être en congé, et l'économie estimée.`,
        response_json_schema: {
          type: 'object',
          properties: {
            slow_periods: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  avg_appointments: { type: 'number' },
                  severity: { type: 'string' }
                }
              }
            },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  recommended_employees: { type: 'array', items: { type: 'string' } },
                  days: { type: 'string' },
                  savings: { type: 'string' }
                }
              }
            },
            summary: { type: 'string' }
          }
        }
      });

      setAiSuggestions(result.suggestions || []);
      toast.success('Analyse IA terminée');
    } catch (e) {
      toast.error('Erreur analyse IA');
    }
    setAiLoading(false);
  };

  const isTimeOff = (dayStr, employeeId) => {
    return timeOffs.some(t => t.employee_id === employeeId && dayStr >= t.start_date && dayStr <= t.end_date);
  };

  const upcomingTimeOffs = timeOffs.filter(t => t.end_date >= format(new Date(), 'yyyy-MM-dd')).sort((a, b) => a.start_date.localeCompare(b.start_date));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Planning</p>
          <h1 className="font-display text-2xl font-bold">Agenda Intelligent</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowTimeOffDialog(true)} variant="outline" size="sm" className="border-border">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Congé
          </Button>
          <Button onClick={handleAISuggestions} disabled={aiLoading} size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            {aiLoading ? 'Analyse...' : 'Analyser IA'}
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="text-sm font-semibold">
          {format(baseDate, 'd MMM', { locale: fr })} — {format(addDays(baseDate, 6), 'd MMM yyyy', { locale: fr })}
        </p>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-1 mb-6">
        {weekStats.map(({ day, dayStr, count, revenue }) => {
          const isToday = isSameDay(day, new Date());
          const isBusy = count >= 6;
          const isSlow = count <= 1;
          return (
            <div key={dayStr} className={`rounded-xl border p-2 text-center transition-all ${
              isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}>
              <p className="text-[9px] text-muted-foreground uppercase">{DAY_NAMES_FR[day.getDay()]}</p>
              <p className={`text-lg font-bold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</p>
              <div className={`text-[10px] font-medium mt-1 px-1.5 py-0.5 rounded-full ${
                isBusy ? 'bg-primary/20 text-primary' : isSlow ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-muted-foreground'
              }`}>
                {count} RDV
              </div>
              {revenue > 0 && <p className="text-[9px] text-muted-foreground mt-0.5">{revenue}€</p>}
              {/* Time off indicators */}
              <div className="flex justify-center gap-0.5 mt-1">
                {employees.map(emp => isTimeOff(dayStr, emp.id) && (
                  <div key={emp.id} className="w-1.5 h-1.5 rounded-full bg-destructive" title={emp.name} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Employee Schedule Grid */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3">Présence de l'équipe cette semaine</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-muted-foreground font-medium pb-2 pr-3">Barber</th>
                {weekStats.map(({ day, dayStr }) => (
                  <th key={dayStr} className="text-center text-muted-foreground font-medium pb-2 px-1 min-w-[40px]">
                    {DAY_NAMES_FR[day.getDay()]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const dayName = (d) => format(d, 'EEEE').toLowerCase();
                return (
                  <tr key={emp.id} className="border-t border-border/50">
                    <td className="py-2 pr-3 font-medium">{emp.name}</td>
                    {weekStats.map(({ day, dayStr }) => {
                      const wh = emp.working_hours?.[dayName(day)];
                      const closed = !wh || wh.closed;
                      const off = isTimeOff(dayStr, emp.id);
                      const aptCount = appointments.filter(a => a.date === dayStr && a.employee_id === emp.id && a.status !== 'cancelled').length;
                      return (
                        <td key={dayStr} className="text-center py-2 px-1">
                          {off ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-destructive/10 text-destructive text-[9px]">
                              <Moon className="w-3 h-3" />
                            </span>
                          ) : closed ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-secondary text-muted-foreground text-[9px]">—</span>
                          ) : (
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-semibold ${
                              aptCount > 0 ? 'bg-accent/20 text-accent-foreground' : 'bg-border/30 text-muted-foreground'
                            }`}>
                              {aptCount > 0 ? aptCount : '✓'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-destructive" /> Congé</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/20" /> Présent + RDV</span>
          <span>✓ = Présent, aucun RDV</span>
          <span>— = Jour fermé</span>
        </div>
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="bg-card border border-accent/30 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" /> Recommandations IA
          </h2>
          <div className="space-y-3">
            {aiSuggestions.map((s, i) => (
              <div key={i} className="border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                    {s.days && <p className="text-xs text-primary mt-1">📅 {s.days}</p>}
                    {s.recommended_employees?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">👤 {s.recommended_employees.join(', ')}</p>
                    )}
                  </div>
                  {s.savings && <Badge className="bg-accent/20 text-accent-foreground border-0 text-[10px] shrink-0">{s.savings}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Time Offs */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-primary" /> Congés à venir
        </h2>
        {upcomingTimeOffs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun congé planifié</p>
        ) : (
          <div className="space-y-2">
            {upcomingTimeOffs.map(t => (
              <div key={t.id} className="flex items-center justify-between border border-border rounded-lg p-2.5">
                <div>
                  <p className="text-sm font-medium">{t.employee_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(parseISO(t.start_date), 'd MMM', { locale: fr })} → {format(parseISO(t.end_date), 'd MMM yyyy', { locale: fr })}
                    {t.reason && ` · ${t.reason}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  onClick={() => deleteTimeOff.mutate(t.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Off Dialog */}
      <Dialog open={showTimeOffDialog} onOpenChange={setShowTimeOffDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Ajouter un congé</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Employé</Label>
              <Select value={newTimeOff.employee_id} onValueChange={v => setNewTimeOff({ ...newTimeOff, employee_id: v })}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Début</Label>
                <Input type="date" value={newTimeOff.start_date} onChange={e => setNewTimeOff({ ...newTimeOff, start_date: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Fin</Label>
                <Input type="date" value={newTimeOff.end_date} onChange={e => setNewTimeOff({ ...newTimeOff, end_date: e.target.value })}
                  className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={newTimeOff.type} onValueChange={v => setNewTimeOff({ ...newTimeOff, type: v })}>
                <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacances</SelectItem>
                  <SelectItem value="sick">Maladie</SelectItem>
                  <SelectItem value="personal">Personnel</SelectItem>
                  <SelectItem value="closure">Fermeture</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Motif (optionnel)</Label>
              <Input value={newTimeOff.reason} onChange={e => setNewTimeOff({ ...newTimeOff, reason: e.target.value })}
                placeholder="Congés d'été..." className="bg-secondary border-border mt-1" />
            </div>
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!newTimeOff.employee_id || !newTimeOff.start_date || !newTimeOff.end_date}
              onClick={() => addTimeOff.mutate(newTimeOff)}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}