import React, { useState, useMemo } from 'react';
import { base44, apiRequest, apiUrl } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Sparkles, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';


const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export default function BarberCleaning() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const queryClient = useQueryClient();

  const mondayDate = useMemo(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(d, weekOffset * 7);
  }, [weekOffset]);
  const weekStart = format(mondayDate, 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: allSchedule = [] } = useQuery({
    queryKey: ['cleaningSchedule', weekStart],
    queryFn: () => base44.entities.CleaningSchedule.filter({ week_start: weekStart }, 'date', 500),
  });

  // Filter only this barber's tasks
  const mySchedule = useMemo(() => {
    if (!user?.employee_id) return allSchedule;
    return allSchedule.filter(s => s.employee_id === user.employee_id);
  }, [allSchedule, user]);

  const toggleDone = useMutation({
    mutationFn: ({ id, status }) => apiRequest('PATCH', apiUrl(`/cleaning/schedule/${id}/toggle`), { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cleaningSchedule'] }),
  });

  // Group by date
  const byDate = useMemo(() => {
    const grouped = {};
    for (let i = 0; i < 6; i++) {
      const dateStr = format(addDays(mondayDate, i), 'yyyy-MM-dd');
      grouped[dateStr] = {
        label: DAY_LABELS[i],
        date: dateStr,
        fullLabel: format(addDays(mondayDate, i), 'EEEE d MMMM', { locale: fr }),
        tasks: mySchedule.filter(s => s.date === dateStr),
      };
    }
    return grouped;
  }, [mySchedule, mondayDate]);

  const todayTasks = byDate[today]?.tasks || [];
  const todayDone = todayTasks.filter(t => t.status === 'done').length;

  return (
    <div>
      <div className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">Ménage</p>
        <h1 className="font-display text-2xl font-bold">Mes Tâches</h1>
      </div>

      {/* Today summary */}
      {todayTasks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Aujourd'hui
            </h2>
            <span className="text-xs font-bold text-primary">{todayDone}/{todayTasks.length} fait</span>
          </div>
          <div className="space-y-2">
            {todayTasks.map(task => {
              const isDone = task.status === 'done';
              return (
                <button key={task.id}
                  onClick={() => toggleDone.mutate({ id: task.id, status: isDone ? 'pending' : 'done' })}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                    isDone
                      ? 'bg-green-500/10 border border-green-500/20'
                      : 'bg-card border border-border'
                  }`}>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                    isDone ? 'bg-green-500 text-white' : 'bg-secondary'
                  }`}>
                    {isDone && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <span className={`text-sm font-medium ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.task_name}
                  </span>
                </button>
              );
            })}
          </div>
          {todayDone === todayTasks.length && todayTasks.length > 0 && (
            <p className="text-xs text-green-400 font-semibold text-center mt-3">Bravo, tout est fait !</p>
          )}
        </motion.div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl p-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <p className="text-sm font-semibold">
          Semaine du {format(mondayDate, 'd MMM', { locale: fr })}
        </p>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(w => w + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week tasks */}
      <div className="space-y-3">
        {Object.values(byDate).map(({ label, date, fullLabel, tasks }) => {
          if (tasks.length === 0) return null;
          const isToday = date === today;
          const done = tasks.filter(t => t.status === 'done').length;
          return (
            <motion.div key={date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-4 ${isToday ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold capitalize">{fullLabel}</p>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  done === tasks.length ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground'
                }`}>
                  {done}/{tasks.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {tasks.map(task => {
                  const isDone = task.status === 'done';
                  return (
                    <button key={task.id}
                      onClick={() => toggleDone.mutate({ id: task.id, status: isDone ? 'pending' : 'done' })}
                      className="w-full flex items-center gap-2.5 py-1.5 text-left active:scale-[0.99] transition-all">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                        isDone ? 'bg-green-500 text-white' : 'border border-border'
                      }`}>
                        {isDone && <Check className="w-3 h-3" />}
                      </div>
                      <span className={`text-sm ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {task.task_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          );
        })}

        {mySchedule.length === 0 && (
          <div className="text-center py-16">
            <Sparkles className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aucune tâche cette semaine</p>
            <p className="text-xs text-muted-foreground mt-1">Le planning sera généré par l'admin</p>
          </div>
        )}
      </div>
    </div>
  );
}
