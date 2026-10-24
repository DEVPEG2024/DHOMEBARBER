import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Check, UserX, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { agendaClientName } from '@/lib/guest';
import { hapticFeedback } from '@/lib/capacitor';
import { parisDay } from '@/lib/slots';
import { appointmentEndParis, invalidateAppointmentQueries, agendaErrorMessage } from './agendaUtils';

/**
 * « Client venu ? » (16 oct. 2026, choix du salon) : les rendez-vous des 7 derniers jours dont
 * l'heure de fin est passée et que personne n'a confirmés (ni encaissés, ni marqués absents).
 * Un tap : « Venu » (`attended_at`, la visite compte sur la carte Gang) ou « Absent » (`no_show`,
 * elle ne compte plus, avec Annuler dans le toast). Sans cela, un client qui ne vient pas
 * gardait une visite sur sa carte. Un barber ne voit que ses rendez-vous.
 */

const DAYS = 7;
const CONFIRM_ALL_MS = 4000;
export const ATTENDANCE_QUERY_KEY = ['attendanceCheck'];

const hasClient = (a) => !!(a.client_email || (a.client_name && a.client_name.trim() && a.client_name !== 'Last Minute'));

function servicesLabel(a) {
  const list = Array.isArray(a.services) ? a.services : [];
  return list.map((s) => s?.name).filter(Boolean).join(', ');
}

/**
 * Jour de Paris courant (« AAAA-MM-JJ »), recalculé chaque minute et au retour au premier plan :
 * un agenda resté ouvert après minuit (tablette du salon, PWA) passe au nouveau jour.
 */
export function useParisTodayKey() {
  const [key, setKey] = useState(() => parisDay(0).key);
  useEffect(() => {
    const tick = () => { const k = parisDay(0).key; setKey((prev) => (prev === k ? prev : k)); };
    const id = setInterval(tick, 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return key;
}

export default function AttendanceCheck({ user, onOpen }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState({});
  const [done, setDone] = useState({});
  const [confirmAll, setConfirmAll] = useState(false);
  const confirmTimer = useRef(null);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  // Fenêtre des 7 derniers jours, décalée au passage de minuit (nouvelle clé → nouveau chargement)
  const todayKey = useParisTodayKey();
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => parisDay(-i).key), [todayKey]);
  const { data = [] } = useQuery({
    queryKey: [...ATTENDANCE_QUERY_KEY, days[0]],
    queryFn: () => api.entities.Appointment.filter({ date: days, status: 'confirmed' }, 'start_time', 1000),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const pending = useMemo(() => {
    const now = Date.now();
    const mine = user?.role === 'barber' && user?.employee_id ? String(user.employee_id) : null;
    return (Array.isArray(data) ? data : [])
      .filter((a) => a.status === 'confirmed' && !a.attended_at && !a.payment_method && hasClient(a) && !done[a.id])
      .filter((a) => !mine || String(a.employee_id) === mine)
      .filter((a) => { const end = appointmentEndParis(a); return end != null && end <= now; })  // instant en ms
      .sort((x, y) => `${y.date} ${y.start_time}`.localeCompare(`${x.date} ${x.start_time}`));
  }, [data, done, user]);

  if (pending.length === 0) return null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ATTENDANCE_QUERY_KEY });
    invalidateAppointmentQueries(queryClient);
  };

  const mark = async (apt, kind) => {
    if (busy[apt.id]) return;
    hapticFeedback();
    setBusy((b) => ({ ...b, [apt.id]: kind }));
    const name = apt.client_name ? agendaClientName(apt) : 'Le client';
    try {
      if (kind === 'came') {
        await api.entities.Appointment.update(apt.id, { attended_at: new Date().toISOString() });
        setDone((d) => ({ ...d, [apt.id]: true }));
        toast.success(`${name} : visite confirmée`);
      } else {
        await api.entities.Appointment.update(apt.id, { status: 'no_show' });
        setDone((d) => ({ ...d, [apt.id]: true }));
        toast(`${name} marqué absent`, {
          action: {
            label: 'Annuler',
            onClick: async () => {
              try {
                await api.entities.Appointment.update(apt.id, { status: 'confirmed' });
                setDone((d) => { const next = { ...d }; delete next[apt.id]; return next; });
                refresh();
              } catch {
                toast.error('Impossible d’annuler : rétablissez le rendez-vous depuis sa fiche.');
              }
            },
          },
        });
      }
      refresh();
    } catch (e) {
      // « Pas de connexion internet » plutôt que « Load failed » / « Failed to fetch »
      toast.error(agendaErrorMessage(e, 'Modification impossible'));
    } finally {
      setBusy((b) => { const next = { ...b }; delete next[apt.id]; return next; });
    }
  };

  // « Tous venus » : deux taps (le premier arme, 4 s pour confirmer)
  const markAll = async () => {
    if (!confirmAll) {
      hapticFeedback();
      setConfirmAll(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmAll(false), CONFIRM_ALL_MS);
      return;
    }
    clearTimeout(confirmTimer.current);
    setConfirmAll(false);
    const list = [...pending];
    const at = new Date().toISOString();
    const results = await Promise.allSettled(list.map((a) => api.entities.Appointment.update(a.id, { attended_at: at })));
    const ok = list.filter((_, i) => results[i].status === 'fulfilled');
    setDone((d) => ({ ...d, ...Object.fromEntries(ok.map((a) => [a.id, true])) }));
    if (ok.length === list.length) toast.success(`${ok.length} visite${ok.length > 1 ? 's' : ''} confirmée${ok.length > 1 ? 's' : ''}`);
    else toast.error(`${list.length - ok.length} rendez-vous n’ont pas pu être confirmés : réessayez.`);
    refresh();
  };

  const n = pending.length;
  return (
    <section className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="text-lg leading-none" aria-hidden="true">🙋</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-foreground">Client venu ?</span>
          <span className="block text-[11px] text-muted-foreground">
            {n} rendez-vous passé{n > 1 ? 's' : ''} à confirmer · un absent ne compte pas sur la carte Gang
          </span>
        </span>
        <span className="shrink-0 min-w-[24px] h-6 px-1.5 rounded-full bg-amber-500 text-black text-xs font-bold grid place-items-center tabular-nums">{n}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="px-3.5 pb-3">
          <ul className="divide-y divide-border">
            {pending.map((a) => {
              const day = format(new Date(`${String(a.date).slice(0, 10)}T12:00:00`), 'EEE d MMM', { locale: fr });
              const services = servicesLabel(a);
              return (
                <li key={a.id} className="flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-2 py-2.5 min-w-0">
                  <button type="button" onClick={() => onOpen?.(a)} className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-semibold text-foreground truncate">{agendaClientName(a)}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {day} · {String(a.start_time || '').slice(0, 5)}{a.employee_name ? ` · ${a.employee_name}` : ''}{services ? ` · ${services}` : ''}
                    </span>
                  </button>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => mark(a, 'came')}
                      disabled={!!busy[a.id]}
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-60"
                    >
                      {busy[a.id] === 'came' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      Venu
                    </button>
                    <button
                      type="button"
                      onClick={() => mark(a, 'absent')}
                      disabled={!!busy[a.id]}
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-400 disabled:opacity-60"
                    >
                      {busy[a.id] === 'absent' ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <UserX className="w-3.5 h-3.5" aria-hidden="true" />}
                      Absent
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {n > 1 && (
            <button
              type="button"
              onClick={markAll}
              className={`mt-2 w-full h-9 rounded-xl text-xs font-semibold transition-colors ${confirmAll ? 'bg-amber-500 text-black' : 'border border-border text-foreground hover:bg-secondary'}`}
            >
              {confirmAll ? `Confirmer : les ${n} sont venus ?` : `Tous venus (${n})`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
