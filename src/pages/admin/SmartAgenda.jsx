import React, { useState, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { format, addDays, addWeeks, startOfWeek, isSameDay, parseISO, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Brain, Coffee, Moon, Plus, Trash2, CalendarDays, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  toDateStr, parseDateParam, datesBetween, fetchAppointmentsForDates, isOnLeave,
} from '@/components/agenda/agendaUtils';

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const EMPTY_TIME_OFF = { employee_id: '', start_date: '', end_date: '', reason: '', type: 'vacation' };
const TYPE_LABELS = { vacation: 'Vacances', sick: 'Maladie', personal: 'Personnel', closure: 'Fermeture' };

// Ce qui compte dans le planning : les vrais rendez-vous, pas les pauses, créneaux last minute, annulés ni absents
const counts = (a) => !['cancelled', 'no_show', 'break', 'last_minute'].includes(a.status);

const agendaLink = (dateStr, barberId) =>
  `/admin/agenda?view=day&date=${dateStr}${barberId ? `&barber=${encodeURIComponent(barberId)}` : ''}`;

export default function SmartAgenda() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const pickerRef = useRef(null);

  // Semaine affichée dans l'adresse (?week=lundi) : un retour depuis l'agenda ramène à la même semaine
  const weekParam = searchParams.get('week');
  const baseDate = useMemo(
    () => startOfWeek(parseDateParam(weekParam) || new Date(), { weekStartsOn: 1 }),
    [weekParam],
  );
  const weekKey = toDateStr(baseDate);
  const weekDates = useMemo(() => datesBetween(baseDate, addDays(baseDate, 6)), [baseDate]);
  const weekDays = weekDates.map((d) => parseISO(d));
  const isThisWeek = weekKey === toDateStr(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const goToWeek = (d) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('week', toDateStr(startOfWeek(d, { weekStartsOn: 1 })));
    return next;
  }, { replace: true });

  const [timeOffDialog, setTimeOffDialog] = useState(null); // null | { id?, ...champs }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);

  const { data: appointments = [], isFetching } = useQuery({
    queryKey: ['planningAppointments', weekKey],
    queryFn: () => fetchAppointmentsForDates(weekDates),
    placeholderData: keepPreviousData,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
  });
  const approvedTimeOffs = useMemo(() => timeOffs.filter((t) => t.status === 'approved' || !t.status), [timeOffs]);

  const saveTimeOff = useMutation({
    mutationFn: ({ id, ...data }) => {
      const emp = employees.find((e) => String(e.id) === String(data.employee_id));
      const payload = { ...data, employee_name: emp?.name };
      return id
        ? api.entities.TimeOff.update(id, payload)
        : api.entities.TimeOff.create({ ...payload, status: 'approved' });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      setTimeOffDialog(null);
      toast.success(vars.id ? 'Congé modifié' : 'Congé enregistré');
    },
    onError: (e) => toast.error(e?.message || 'Erreur lors de l\'enregistrement'),
  });

  const deleteTimeOff = useMutation({
    mutationFn: (id) => api.entities.TimeOff.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeOffs'] });
      toast.success('Congé supprimé');
    },
    onError: (e) => toast.error(e?.message || 'Erreur lors de la suppression'),
  });

  const weekStats = useMemo(() => weekDates.map((dayStr, i) => {
    const dayApts = appointments.filter((a) => a.date === dayStr && counts(a));
    const revenue = dayApts.reduce((s, a) => s + (Number(a.grand_total || a.total_price) || 0), 0);
    return { day: weekDays[i], dayStr, count: dayApts.length, revenue };
  }), [weekDates, appointments]);

  // Analyse des 8 dernières semaines (chargées à la demande, plus les 500 derniers RDV de la base)
  const handleAISuggestions = async () => {
    setAiLoading(true);
    try {
      const end = subDays(new Date(), 1);
      const history = await queryClient.fetchQuery({
        queryKey: ['planningAppointments', 'history', toDateStr(end)],
        queryFn: () => fetchAppointmentsForDates(datesBetween(subDays(end, 55), end)),
        staleTime: 10 * 60 * 1000,
      });
      const recentApts = history.filter(counts);
      const weeks = 8;
      const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const dayCounts = Array.from({ length: 7 }, () => ({ total: 0, revenue: 0 }));
      recentApts.forEach((a) => {
        const d = parseISO(String(a.date).slice(0, 10)).getDay();
        dayCounts[d].total++;
        dayCounts[d].revenue += Number(a.total_price) || 0;
      });
      const dayAvgs = dayCounts.map((c, i) => ({ day: i, name: dayNames[i], avg: c.total / weeks, revenue: c.revenue / weeks }));
      const sorted = [...dayAvgs].filter((d) => d.avg > 0).sort((a, b) => a.avg - b.avg);
      const overallAvg = dayAvgs.reduce((s, d) => s + d.avg, 0) / 7;
      const suggestions = [];

      const slowDays = sorted.filter((d) => d.avg < overallAvg * 0.7);
      if (slowDays.length > 0) {
        const slowNames = slowDays.map((d) => d.name).join(', ');
        const maxOff = Math.max(1, Math.floor(employees.length / 2));
        suggestions.push({
          title: `Jours creux : ${slowNames}`,
          description: `Ces jours ont en moyenne ${slowDays.map((d) => d.avg.toFixed(1)).join(' et ')} RDV/semaine contre ${overallAvg.toFixed(1)} en moyenne. Vous pouvez réduire l'équipe.`,
          recommended_employees: employees.slice(-maxOff).map((e) => e.name),
          days: slowNames,
          savings: `${maxOff} barber${maxOff > 1 ? 's' : ''} en moins`,
        });
      }

      const busiest = [...dayAvgs].sort((a, b) => b.avg - a.avg)[0];
      if (busiest && busiest.avg > overallAvg * 1.3) {
        suggestions.push({
          title: `Jour fort : ${busiest.name}`,
          description: `${busiest.name} est votre meilleur jour avec ${busiest.avg.toFixed(1)} RDV en moyenne et ${busiest.revenue.toFixed(0)}€ de CA/semaine. Assurez la présence complète de l'équipe.`,
          recommended_employees: employees.map((e) => e.name),
          days: busiest.name,
          savings: 'CA max',
        });
      }

      const empLoads = {};
      employees.forEach((e) => { empLoads[e.id] = { name: e.name, count: 0 }; });
      recentApts.forEach((a) => { if (empLoads[a.employee_id]) empLoads[a.employee_id].count++; });
      const loads = Object.values(empLoads).sort((a, b) => a.count - b.count);
      if (loads.length >= 2) {
        const least = loads[0];
        const most = loads[loads.length - 1];
        if (most.count > least.count * 1.5) {
          suggestions.push({
            title: 'Rééquilibrer la charge',
            description: `${most.name} a ${most.count} RDV sur 8 semaines contre ${least.count} pour ${least.name}. Pensez à mieux répartir les réservations.`,
            recommended_employees: [least.name, most.name],
            days: 'Tous les jours',
            savings: 'Meilleur équilibre',
          });
        }
      }

      if (suggestions.length === 0) {
        suggestions.push({
          title: 'Données insuffisantes',
          description: `Seulement ${recentApts.length} RDV sur les 8 dernières semaines. Continuez à utiliser l'app pour obtenir des recommandations plus précises.`,
          recommended_employees: [],
          days: '-',
          savings: '-',
        });
      }

      setAiSuggestions(suggestions);
      toast.success('Analyse terminée');
    } catch {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setAiLoading(false);
    }
  };

  const todayStr = toDateStr(new Date());
  const upcomingTimeOffs = timeOffs
    .filter((t) => String(t.end_date).slice(0, 10) >= todayStr)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  const openTimeOff = (t) => setTimeOffDialog(t
    ? {
      id: t.id,
      employee_id: String(t.employee_id || ''),
      start_date: String(t.start_date || '').slice(0, 10),
      end_date: String(t.end_date || '').slice(0, 10),
      reason: t.reason || '',
      type: t.type || 'vacation',
    }
    : { ...EMPTY_TIME_OFF });

  const openPicker = () => {
    const input = pickerRef.current;
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };

  const form = timeOffDialog;
  const formInvalid = !form?.employee_id || !form?.start_date || !form?.end_date || form.end_date < form.start_date;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Planning</p>
          <h1 className="font-display text-2xl font-bold">Agenda Intelligent</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openTimeOff(null)} variant="outline" size="sm" className="border-border">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Congé
          </Button>
          <Button onClick={handleAISuggestions} disabled={aiLoading} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Brain className="w-3.5 h-3.5 mr-1.5" />
            {aiLoading ? 'Analyse...' : 'Analyser IA'}
          </Button>
        </div>
      </div>

      {/* Navigation de semaine : précédente / suivante, date au choix, retour à cette semaine */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1.5 mb-4">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => goToWeek(addWeeks(baseDate, -1))} aria-label="Semaine précédente">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <button type="button" onClick={openPicker} title="Choisir une date"
          className="relative flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-semibold hover:bg-foreground/5 transition-colors">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          {format(baseDate, 'd MMM', { locale: fr })} — {format(addDays(baseDate, 6), 'd MMM yyyy', { locale: fr })}
          {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden="true" value={weekKey}
            onChange={(e) => { const d = parseDateParam(e.target.value); if (d) goToWeek(d); }}
            className="absolute inset-0 opacity-0 pointer-events-none" />
        </button>
        {!isThisWeek && (
          <Button variant="outline" size="sm" className="h-8 text-xs border-border shrink-0" onClick={() => goToWeek(new Date())}>
            Cette semaine
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => goToWeek(addWeeks(baseDate, 1))} aria-label="Semaine suivante">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Jours de la semaine : un tap ouvre la journée dans l'agenda */}
      <div className="grid grid-cols-7 gap-1 mb-6">
        {weekStats.map(({ day, dayStr, count, revenue }) => {
          const isToday = isSameDay(day, new Date());
          const isBusy = count >= 6;
          const isSlow = count <= 1;
          return (
            <Link key={dayStr} to={agendaLink(dayStr)} title="Ouvrir la journée dans l'agenda"
              className={`rounded-xl border p-1.5 sm:p-2 text-center transition-all hover:border-primary/60 hover:bg-primary/5 min-w-0 ${isToday ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
              <p className="text-[9px] text-muted-foreground uppercase">{DAY_NAMES_FR[day.getDay()]}</p>
              <p className={`text-lg font-bold ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</p>
              <div className={`text-[10px] font-medium mt-1 px-1 py-0.5 rounded-full truncate ${isBusy ? 'bg-primary/20 text-primary' : isSlow ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>
                {count}<span className="hidden sm:inline"> RDV</span>
              </div>
              {revenue > 0 && <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{Math.round(revenue)}€</p>}
              <div className="flex justify-center gap-0.5 mt-1 min-h-[6px]">
                {employees.map((emp) => isOnLeave(approvedTimeOffs, emp.id, dayStr) && (
                  <div key={emp.id} className="w-1.5 h-1.5 rounded-full bg-destructive" title={`${emp.name} en congé`} />
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Présence de l'équipe : chaque case ouvre la journée du barber */}
      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 mb-6">
        <h2 className="text-sm font-semibold mb-3">Présence de l'équipe cette semaine</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-muted-foreground font-medium pb-2 pr-3">Barber</th>
                {weekStats.map(({ day, dayStr }) => (
                  <th key={dayStr} className="text-center text-muted-foreground font-medium pb-2 px-0.5 min-w-[36px]">
                    {DAY_NAMES_FR[day.getDay()]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t border-border/50">
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{emp.name}</td>
                  {weekStats.map(({ day, dayStr }) => {
                    const wh = emp.working_hours?.[format(day, 'EEEE').toLowerCase()];
                    const closed = !wh || wh.closed;
                    const off = isOnLeave(approvedTimeOffs, emp.id, dayStr);
                    const aptCount = appointments.filter((a) => a.date === dayStr && String(a.employee_id) === String(emp.id) && counts(a)).length;
                    const cls = off
                      ? 'bg-destructive/10 text-destructive'
                      : closed
                        ? 'bg-secondary text-muted-foreground'
                        : aptCount > 0 ? 'bg-accent/20 text-accent-foreground' : 'bg-border/30 text-muted-foreground';
                    return (
                      <td key={dayStr} className="text-center py-1.5 px-0.5">
                        <Link to={agendaLink(dayStr, emp.id)} title={`${emp.name} · ${format(day, 'EEEE d MMMM', { locale: fr })}`}
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-semibold hover:ring-2 hover:ring-primary/50 transition-all ${cls}`}>
                          {off ? <Moon className="w-3 h-3" /> : closed ? '—' : (aptCount > 0 ? aptCount : '✓')}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-destructive" /> Congé</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent/20" /> Présent + RDV</span>
          <span>✓ = Présent, aucun RDV</span>
          <span>— = Jour non travaillé</span>
          <span>Touchez une case pour ouvrir la journée</span>
        </div>
      </div>

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

      {/* Congés à venir : modifiables et supprimables */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-primary" /> Congés à venir
        </h2>
        {upcomingTimeOffs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun congé planifié</p>
        ) : (
          <div className="space-y-2">
            {upcomingTimeOffs.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border border-border rounded-lg p-2.5">
                <button type="button" onClick={() => openTimeOff(t)} className="min-w-0 text-left flex-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    {t.employee_name}
                    {t.status === 'pending' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-semibold">En attente</span>}
                    {t.status === 'declined' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">Refusé</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {format(parseISO(String(t.start_date).slice(0, 10)), 'd MMM', { locale: fr })} → {format(parseISO(String(t.end_date).slice(0, 10)), 'd MMM yyyy', { locale: fr })}
                    {` · ${TYPE_LABELS[t.type] || 'Congé'}`}
                    {t.reason && ` · ${t.reason}`}
                  </p>
                </button>
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTimeOff(t)} aria-label="Modifier le congé">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" aria-label="Supprimer le congé"
                    onClick={() => { if (window.confirm(`Supprimer le congé de ${t.employee_name || 'ce barber'} ?`)) deleteTimeOff.mutate(t.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Congé : ajout ou modification */}
      <Dialog open={!!form} onOpenChange={(open) => { if (!open) setTimeOffDialog(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{form?.id ? 'Modifier le congé' : 'Ajouter un congé'}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Employé</Label>
                <Select value={form.employee_id} onValueChange={(v) => setTimeOffDialog({ ...form, employee_id: v })}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Début</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setTimeOffDialog({ ...form, start_date: e.target.value })}
                    className="bg-secondary border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Fin</Label>
                  <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setTimeOffDialog({ ...form, end_date: e.target.value })}
                    className="bg-secondary border-border mt-1" />
                </div>
              </div>
              {form.start_date && form.end_date && form.end_date < form.start_date && (
                <p className="text-xs text-red-400">La fin doit être après le début.</p>
              )}
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setTimeOffDialog({ ...form, type: v })}>
                  <SelectTrigger className="bg-secondary border-border mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Motif (optionnel)</Label>
                <Input value={form.reason} onChange={(e) => setTimeOffDialog({ ...form, reason: e.target.value })}
                  placeholder="Congés d'été..." className="bg-secondary border-border mt-1" />
              </div>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={formInvalid || saveTimeOff.isPending}
                onClick={() => saveTimeOff.mutate(form)}>
                {saveTimeOff.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
