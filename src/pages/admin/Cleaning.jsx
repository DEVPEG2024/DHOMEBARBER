import React, { useState, useMemo } from 'react';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Pencil, Trash2, Sparkles, ChevronLeft, ChevronRight, Bell, Check, RefreshCw, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format, startOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';


const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function Cleaning() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [editTask, setEditTask] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();

  const mondayDate = useMemo(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(d, weekOffset * 7);
  }, [weekOffset]);
  const weekStart = format(mondayDate, 'yyyy-MM-dd');

  // Queries
  const { data: tasks = [] } = useQuery({
    queryKey: ['cleaningTasks'],
    queryFn: () => api.entities.CleaningTask.list('sort_order', 50),
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ['cleaningSchedule', weekStart],
    queryFn: () => api.entities.CleaningSchedule.filter({ week_start: weekStart }, 'date', 500),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.entities.Employee.filter({ is_active: true }),
  });

  const { data: history = [] } = useQuery({
    queryKey: ['cleaningHistory'],
    queryFn: () => apiRequest('GET', apiUrl('/cleaning/history')),
    enabled: showHistory,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (data.id) {
        const { id, ...rest } = data;
        return api.entities.CleaningTask.update(id, rest);
      }
      return api.entities.CleaningTask.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks'] });
      setShowDialog(false);
      toast.success('Tâche sauvegardée');
    },
    onError: () => toast.error('Erreur'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.CleaningTask.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks'] });
      toast.success('Tâche supprimée');
    },
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }) => apiRequest('PATCH', apiUrl(`/cleaning/schedule/${id}/toggle`), { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaningSchedule'] });
      queryClient.invalidateQueries({ queryKey: ['cleaningHistory'] });
    },
  });

  // Generate schedule
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const data = await apiRequest('POST', apiUrl('/cleaning/generate-schedule'), { weekStart });
      queryClient.invalidateQueries({ queryKey: ['cleaningSchedule'] });
      toast.success(`Planning généré : ${data.count || 0} affectations`);
    } catch {
      toast.error('Erreur lors de la génération');
    }
    setGenerating(false);
  };

  // Notify today
  const handleNotify = async () => {
    setNotifying(true);
    try {
      const data = await apiRequest('POST', apiUrl('/cleaning/notify-today'));
      toast.success(`Notifications envoyées à ${data.employees || 0} barber(s)`);
    } catch {
      toast.error('Erreur lors de l\'envoi');
    }
    setNotifying(false);
  };

  // Build schedule grid: { [taskName]: { [dateStr]: scheduleItem } }
  const weekDates = Array.from({ length: 6 }, (_, i) => format(addDays(mondayDate, i), 'yyyy-MM-dd'));

  const scheduleGrid = useMemo(() => {
    const grid = {};
    const taskNames = [...new Set(schedule.map(s => s.task_name))];
    // Also include tasks not yet in schedule
    tasks.filter(t => t.is_active).forEach(t => {
      if (!taskNames.includes(t.name)) taskNames.push(t.name);
    });

    taskNames.forEach(name => {
      grid[name] = {};
      weekDates.forEach(date => {
        grid[name][date] = schedule.find(s => s.task_name === name && s.date === date) || null;
      });
    });
    return grid;
  }, [schedule, tasks, weekDates]);

  const getEmpColor = (empId) => employees.find(e => e.id === empId)?.color || '#3fcf8e';

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div className="shrink-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Organisation</p>
          <h1 className="font-display text-2xl font-bold">Entretien du salon</h1>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="outline" className="border-border gap-1.5"
            onClick={() => { setEditTask({ name: '', description: '', frequency: 'daily', is_active: true }); setShowDialog(true); }}>
            <Plus className="w-3.5 h-3.5" /> Tâche
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleGenerate} disabled={generating}>
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Génération...' : 'Générer planning'}
          </Button>
        </div>
      </div>

      {/* Task list */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3">Tâches ménagères</h2>
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">Aucune tâche. Ajoutez des tâches pour commencer.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.map(task => (
              <div key={task.id} className={`flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 ${!task.is_active ? 'opacity-50' : ''}`}>
                <div>
                  <p className="text-sm font-semibold">{task.name}</p>
                  {task.description && <p className="text-[11px] text-muted-foreground">{task.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => { setEditTask({ ...task }); setShowDialog(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => { if (window.confirm('Supprimer cette tâche ?')) deleteMutation.mutate(task.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="text-sm font-semibold">
          Semaine du {format(mondayDate, 'd MMM', { locale: fr })} au {format(addDays(mondayDate, 5), 'd MMM yyyy', { locale: fr })}
        </p>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Schedule grid */}
      {Object.keys(scheduleGrid).length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Sparkles className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">Aucun planning cette semaine</p>
          <p className="text-xs text-muted-foreground">Ajoutez des tâches puis cliquez sur "Générer planning"</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold px-3 py-2.5 min-w-[120px]">Tâche</th>
                  {weekDates.map((date, i) => (
                    <th key={date} className="text-center font-semibold px-2 py-2.5 min-w-[70px]">
                      <p>{DAY_LABELS[i]}</p>
                      <p className="text-[10px] text-muted-foreground font-normal">{format(addDays(mondayDate, i), 'd/MM')}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(scheduleGrid).map(([taskName, days]) => (
                  <tr key={taskName} className="border-b border-border/50">
                    <td className="px-3 py-2.5 font-medium text-foreground">{taskName}</td>
                    {weekDates.map(date => {
                      const item = days[date];
                      if (!item) return <td key={date} className="text-center px-2 py-2.5 text-muted-foreground/30">—</td>;

                      const isDone = item.status === 'done';
                      return (
                        <td key={date} className="text-center px-2 py-2.5">
                          <button
                            onClick={() => toggleDone.mutate({ id: item.id, status: isDone ? 'pending' : 'done' })}
                            className={`inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all ${
                              isDone
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-secondary hover:bg-secondary/80 text-foreground'
                            }`}
                          >
                            <span className="flex items-center gap-1">
                              {isDone && <Check className="w-3 h-3" />}
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getEmpColor(item.employee_id) }} />
                            </span>
                            <span className="text-[10px] font-medium truncate max-w-[60px]">{item.employee_name}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notify button */}
      {schedule.length > 0 && (
        <Button onClick={handleNotify} disabled={notifying} className="w-full gap-2 mb-6">
          <Bell className="w-4 h-4" />
          {notifying ? 'Envoi...' : 'Envoyer les tâches du jour aux barbers'}
        </Button>
      )}

      {/* History section */}
      <div className="mb-6">
        <button
          onClick={() => setShowHistory(h => !h)}
          className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <History className="w-4 h-4 text-primary" />
            Historique des tâches effectuées
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showHistory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mt-2 bg-card border border-border rounded-xl overflow-hidden">
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Aucune tâche effectuée</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left font-semibold px-3 py-2.5">Date</th>
                      <th className="text-left font-semibold px-3 py-2.5">Tâche</th>
                      <th className="text-left font-semibold px-3 py-2.5">Barber</th>
                      <th className="text-left font-semibold px-3 py-2.5">Validé à</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(item => (
                      <tr key={item.id} className="border-b border-border/50">
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {item.date ? format(new Date(item.date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{item.task_name}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getEmpColor(item.employee_id) }} />
                            {item.employee_name}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {item.completed_at
                            ? format(new Date(item.completed_at), 'HH:mm', { locale: fr })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Task Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">{editTask?.id ? 'Modifier' : 'Nouvelle'} tâche</DialogTitle>
          </DialogHeader>
          {editTask && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nom</Label>
                <Input value={editTask.name} onChange={e => setEditTask({ ...editTask, name: e.target.value })}
                  placeholder="Ex: Nettoyer les sols" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description (optionnel)</Label>
                <Textarea value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })}
                  placeholder="Détails de la tâche..." className="bg-secondary border-border mt-1" rows={2} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Active</Label>
                <Switch checked={editTask.is_active} onCheckedChange={v => setEditTask({ ...editTask, is_active: v })} />
              </div>
              <Button className="w-full" onClick={() => saveMutation.mutate(editTask)}
                disabled={!editTask.name}>
                Sauvegarder
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
