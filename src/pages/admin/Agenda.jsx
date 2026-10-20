import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiRequest, apiUrl } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { exportToCSV } from '@/utils/exportCSV';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { RefreshCw } from 'lucide-react';
import { LAST_MINUTE_EXPIRED_REASON } from '@/lib/cancellation';
import { useAppointmentOrders } from '@/lib/appointmentProducts';
import { generateTimeSlots, isOnLeave, parisDay, privateWindow, workingHoursOf } from '@/lib/slots';
import { parisInstant } from '@/lib/calendarLinks';
import { isNetworkError } from '@/components/shared/LoadError';

import AgendaToolbar from '@/components/agenda/AgendaToolbar';
import DayView from '@/components/agenda/DayView';
import WeekView from '@/components/agenda/WeekView';
import MonthView from '@/components/agenda/MonthView';
import BreakModal from '@/components/agenda/BreakModal';
import AppointmentDetailModal from '@/components/agenda/AppointmentDetailModal';
import MoveDialog, { buildMoveFields, saveMove } from '@/components/agenda/MoveDialog';
import WalkInDialog from '@/components/agenda/WalkInDialog';
import AttendanceCheck, { useParisTodayKey } from '@/components/agenda/AttendanceCheck';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BARBER_COLORS, timeToMinutes, toDateStr, parseDateParam, visibleRange, datesBetween,
  fetchAppointmentsForDates, agendaQueryKey, invalidateAppointmentQueries,
  isBreak, isLastMinuteSlot, slotIssues, aptDuration, isUnclaimedLastMinute,
  isCancelledLike, minutesToTime, agendaErrorMessage, appointmentEndParis, isClientPlaceholder, shortDayLabel,
} from '@/components/agenda/agendaUtils';

const VIEWS = ['day', 'week', 'month'];
const VIEW_STORAGE_KEY = 'dhb-agenda-view';

function readStoredView() {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function stepDate(view, date, dir) {
  if (view === 'day') return addDays(date, dir);
  if (view === 'week') return addWeeks(date, dir);
  return addMonths(date, dir);
}

const SWIPE_MIN_PX = 70;
const SWIPE_MAX_MS = 600;

// Produits réservés avec un RDV : ids passés dans l'adresse de la requête (`q=JSON`), donc bornés
// pour rester sous la limite de longueur d'URL du routeur Heroku (~8 Ko) ; les plus proches
// d'aujourd'hui d'abord, la fiche ouverte toujours comprise.
const LINKED_ORDERS_MAX_IDS = 100;
const NO_LINKED_ORDERS = new Map();

// Privatisations (mêmes libellés que la page Privatisations de l'admin)
const PRIVATE_TYPES = { evjg: 'EVJG', anniversaire: 'Anniversaire', team_building: 'Team Building', autre: 'Événement privé' };
const PRIVATE_SLOTS = { morning: 'matinée 9h-14h', afternoon: 'après-midi 14h-20h', full_day: 'journée 9h-20h' };

export default function Agenda() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Position dans l'agenda : dans l'adresse (rechargement, retour arrière, lien depuis le planning) ───
  const view = VIEWS.includes(searchParams.get('view')) ? searchParams.get('view') : (readStoredView() || 'week');
  const dateParam = searchParams.get('date');
  // Sans ?date=, l'agenda resté ouvert après minuit passe de lui-même au nouveau jour ; avec une
  // date explicite, il reste où l'utilisateur l'a mis
  const parisTodayKey = useParisTodayKey();
  const currentDate = useMemo(() => parseDateParam(dateParam) || new Date(), [dateParam, parisTodayKey]);
  const dateKey = toDateStr(currentDate);
  const ownEmployeeId = user?.role === 'barber' && user?.employee_id ? String(user.employee_id) : null;
  const employeeFilter = searchParams.get('barber') || ownEmployeeId || 'all';

  const updateParams = useCallback((patch) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) next.delete(k); else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Passage de minuit : si l'adresse montrait le jour qui vient de finir (« Aujourd'hui », retour
  // depuis demain, lien du planning), elle suit le nouveau jour ; une date choisie volontairement
  // dans le passé ou le futur reste inchangée. Vue et barber conservés, historique intact (replace).
  const prevTodayKeyRef = useRef(parisTodayKey);
  useEffect(() => {
    const prev = prevTodayKeyRef.current;
    prevTodayKeyRef.current = parisTodayKey;
    if (prev !== parisTodayKey && dateParam === prev) updateParams({ date: parisTodayKey });
  }, [parisTodayKey, dateParam, updateParams]);

  const setView = useCallback((v) => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* navigation privée */ }
    updateParams({ view: v });
  }, [updateParams]);
  const setDate = useCallback((d) => updateParams({ date: toDateStr(d) }), [updateParams]);
  const step = useCallback((dir) => setDate(stepDate(view, currentDate, dir)), [view, currentDate, setDate]);
  const setEmployeeFilter = (id) => updateParams({ barber: String(id) });

  const [showCancelled, setShowCancelled] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pendingMove, setPendingMove] = useState(null); // carte client posée ailleurs : { apt, date, start_time, employee_id }
  const [selectedBreak, setSelectedBreak] = useState(null);
  const [pendingBreak, setPendingBreak] = useState(null); // { start_time, end_time, date } en attente du choix du barber
  // Fenêtre Last Minute : `key` remonte le formulaire à chaque ouverture (valeurs par défaut fraîches)
  const [lastMinute, setLastMinute] = useState({ open: false, key: 0 });
  const [walkInOpen, setWalkInOpen] = useState(false);

  // ─── Données : uniquement les jours affichés ───
  const dates = useMemo(() => {
    const r = visibleRange(view, currentDate);
    return datesBetween(r.start, r.end);
  }, [view, dateKey]);
  const dateSet = useMemo(() => new Set(dates), [dates]);

  const { data: appointments = [], isFetching, isError, isPending, isPlaceholderData, fetchStatus, error: agendaError, refetch } = useQuery({
    queryKey: agendaQueryKey(dates),
    queryFn: () => fetchAppointmentsForDates(dates),
    placeholderData: keepPreviousData, // la grille ne clignote pas à vide pendant le chargement
    refetchInterval: 60000, // une réservation client apparaît sans recharger la page
  });
  // Hors connexion, une période pas encore chargée met la requête en pause (ni erreur ni chargement) :
  // la grille montrerait la période précédente filtrée, donc vide. C'est un échec, pas une journée libre.
  const agendaPaused = fetchStatus === 'paused' && (isPending || isPlaceholderData);
  const agendaFailed = isError || agendaPaused;

  // Privatisations confirmées de la période : le salon est réservé (le serveur refuse les RDV
  // clients sur leur fenêtre) ; l'équipe le voit d'un coup d'œil, sans blocage pour elle
  const { data: privateEvents = [] } = useQuery({
    queryKey: ['agendaPrivateEvents', dates[0], dates[dates.length - 1]],
    queryFn: () => api.entities.Event.filter({ date: dates, status: 'confirmed' }, 'date', 100),
    staleTime: 60000,
  });
  const privateInView = useMemo(
    () => (Array.isArray(privateEvents) ? privateEvents : []).filter((ev) => dateSet.has(String(ev.date || '').slice(0, 10))),
    [privateEvents, dateSet],
  );

  // Période précédente et suivante préchargées : les flèches et le glissé répondent tout de suite
  useEffect(() => {
    for (const dir of [-1, 1]) {
      const r = visibleRange(view, stepDate(view, currentDate, dir));
      const ds = datesBetween(r.start, r.end);
      queryClient.prefetchQuery({ queryKey: agendaQueryKey(ds), queryFn: () => fetchAppointmentsForDates(ds), staleTime: 60000 });
    }
  }, [view, dateKey, queryClient]);

  const { data: rawEmployees = [] } = useQuery({
    queryKey: ['employees'],
    // Même requête que l'accueil (clé partagée ['employees'] : ordre sort_order)
    queryFn: () => api.entities.Employee.filter({ is_active: true }, 'sort_order', 50),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ['timeOffs'],
    queryFn: () => api.entities.TimeOff.list('-start_date', 200),
    refetchOnMount: 'always',
    refetchInterval: 30000,
  });

  // Seuls les congés approuvés bloquent l'agenda
  const approvedTimeOffs = useMemo(() => timeOffs.filter((t) => t.status === 'approved' || !t.status), [timeOffs]);

  const employees = useMemo(() =>
    [...rawEmployees]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((emp, idx) => ({ ...emp, color: emp.color || BARBER_COLORS[idx % BARBER_COLORS.length] })),
  [rawEmployees]);

  // Rendez-vous de la période (la donnée précédente reste affichée pendant le chargement :
  // on ne garde que les jours visibles pour ne jamais montrer l'ancienne période au mauvais endroit)
  const inRange = useMemo(
    () => appointments.filter((a) => dateSet.has(String(a.date).slice(0, 10))),
    [appointments, dateSet],
  );
  // Fiches créées par Clients → Ajouter / Importer (faux RDV annulé à 09:00) : jamais dans l'agenda
  const forBarber = useMemo(
    () => (employeeFilter === 'all' ? inRange : inRange.filter((a) => String(a.employee_id) === String(employeeFilter)))
      .filter((a) => !isClientPlaceholder(a)),
    [inRange, employeeFilter],
  );
  const cancelledCount = forBarber.filter((a) => a.status === 'cancelled').length;
  const visible = useMemo(
    () => (showCancelled ? forBarber : forBarber.filter((a) => a.status !== 'cancelled')),
    [forBarber, showCancelled],
  );

  // ─── Produits à remettre : commandes rattachées aux RDV de la période (une seule requête) ───
  // Seul un client connecté peut ajouter un produit à sa réservation : RDV avec email, non annulés.
  const selectedId = selected ? String(selected.id) : null;
  const linkedOrderIds = useMemo(() => {
    const today = Date.parse(toDateStr(new Date()));
    const candidates = inRange
      .filter((a) => a.client_email && a.status !== 'cancelled' && !isBreak(a))
      .map((a) => ({ id: String(a.id), gap: Math.abs(Date.parse(String(a.date).slice(0, 10)) - today) || 0 }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, LINKED_ORDERS_MAX_IDS)
      .map((a) => a.id);
    if (selectedId && !candidates.includes(selectedId)) candidates.push(selectedId);
    return candidates;
  }, [inRange, selectedId]);
  const linkedOrdersQuery = useAppointmentOrders(linkedOrderIds);
  // Pendant le rechargement (nouvelle clé) on garde la dernière carte connue : les pastilles ne clignotent pas.
  // En cas d'échec : rien d'affiché, l'agenda reste identique.
  const [lastLinkedOrders, setLastLinkedOrders] = useState(NO_LINKED_ORDERS);
  useEffect(() => {
    if (linkedOrdersQuery.data instanceof Map) setLastLinkedOrders(linkedOrdersQuery.data);
  }, [linkedOrdersQuery.data]);
  const linkedOrders = linkedOrdersQuery.isError || linkedOrderIds.length === 0
    ? NO_LINKED_ORDERS
    : (linkedOrdersQuery.data instanceof Map ? linkedOrdersQuery.data : lastLinkedOrders);

  const refreshAll = () => invalidateAppointmentQueries(queryClient);

  // ─── Pauses ───
  const createBreak = useMutation({
    mutationFn: (breakData) => api.entities.Appointment.create(breakData),
    onSuccess: refreshAll,
    onError: (e) => toast.error(agendaErrorMessage(e, 'Erreur lors de la création de la pause')),
  });

  const deleteBreak = useMutation({
    mutationFn: (id) => api.entities.Appointment.delete(id),
    onSuccess: () => { refreshAll(); toast.success('Pause supprimée'); },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const buildBreakPayload = (start_time, end_time, employee_id, breakDate) => ({
    date: breakDate,
    start_time,
    end_time,
    status: 'break',
    client_name: 'Pause',
    client_email: '',
    employee_id: employee_id || '',
    employee_name: employees.find((e) => String(e.id) === String(employee_id))?.name || 'Salon',
    services: [],
    total_duration: timeToMinutes(end_time) - timeToMinutes(start_time),
    total_price: 0,
    notes: 'Pause',
  });

  const handleCreateBreak = ({ start_time, end_time, employee_id, date }) => {
    const breakDate = date || dateKey;
    const target = employee_id || (employeeFilter !== 'all' ? employeeFilter : null);
    if (target) {
      createBreak.mutate(buildBreakPayload(start_time, end_time, target, breakDate), { onSuccess: () => toast.success('Pause ajoutée') });
      return;
    }
    setPendingBreak({ start_time, end_time, date: breakDate });
  };

  const handlePendingBreakSelectEmployee = (empId) => {
    if (!pendingBreak) return;
    createBreak.mutate(
      buildBreakPayload(pendingBreak.start_time, pendingBreak.end_time, empId, pendingBreak.date),
      { onSuccess: () => toast.success('Pause ajoutée') },
    );
    setPendingBreak(null);
  };

  // « Tous les barbers » : seulement ceux qui travaillent ce jour-là (ni repos, ni congé, ni déjà un
  // créneau qui commence à cette heure ou un client pendant la pause) ; chaque refus est compté à
  // part, les pauses posées restent annoncées
  const handlePendingBreakSelectAll = async () => {
    if (!pendingBreak || employees.length === 0) return;
    const { start_time, end_time, date } = pendingBreak;
    setPendingBreak(null);
    const day = new Date(`${date}T12:00:00`);
    const s = timeToMinutes(start_time);
    const e = timeToMinutes(end_time);
    const skipped = [];
    const targets = employees.filter((emp) => {
      // Repos ce jour-là (un profil sans horaires du tout n'est pas écarté, comme côté serveur)
      const hasHours = emp.working_hours && typeof emp.working_hours === 'object' && Object.keys(emp.working_hours).length > 0;
      if (hasHours && !workingHoursOf(emp, day)) { skipped.push(`${emp.name} en repos`); return false; }
      if (isOnLeave(emp, date, approvedTimeOffs)) { skipped.push(`${emp.name} en congé`); return false; }
      const sameDay = inRange.filter((a) => String(a.date).slice(0, 10) === date
        && String(a.employee_id) === String(emp.id)
        && !['cancelled', 'last_minute', 'no_show'].includes(a.status));
      if (sameDay.some((a) => String(a.start_time).slice(0, 5) === start_time)) { skipped.push(`${emp.name} : déjà un créneau à ${start_time}`); return false; }
      if (sameDay.some((a) => a.status !== 'break' && timeToMinutes(a.start_time) < e && timeToMinutes(a.end_time || a.start_time) > s)) {
        skipped.push(`${emp.name} : un client à cette heure`); return false;
      }
      return true;
    });
    if (targets.length === 0) {
      toast.warning(skipped.length ? `Aucune pause posée · ${skipped.join(' · ')}` : 'Aucun barber ne travaille ce jour-là', { duration: 8000 });
      return;
    }
    const results = await Promise.allSettled(targets.map((emp) =>
      api.entities.Appointment.create(buildBreakPayload(start_time, end_time, emp.id, date)),
    ));
    let created = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { created++; return; }
      const name = targets[i].name;
      skipped.push(r.reason?.status === 409 ? `${name} : déjà un créneau à ${start_time}` : `${name} : ${agendaErrorMessage(r.reason, 'erreur')}`);
    });
    refreshAll();
    const head = `${created} pause${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''}`;
    if (skipped.length === 0) toast.success(head);
    else toast.warning([head, ...skipped].join(' · '), { duration: 8000 });
  };

  // Récurrence d'une pause : jamais par-dessus un client, un congé ou une pause déjà posée à la
  // même heure (l'index unique la refuserait) ; le bilan dit ce qui a été sauté et pourquoi
  const handleApplyRecurrence = async ({ start_time, end_time, employee_id, dates: recurrenceDates }) => {
    let existing;
    try {
      existing = [];
      // datesBetween / le filtre par liste de dates : par tranches de 62 jours
      for (let i = 0; i < recurrenceDates.length; i += 62) {
        existing.push(...(await fetchAppointmentsForDates(recurrenceDates.slice(i, i + 62))));
      }
    } catch (e) {
      toast.error(agendaErrorMessage(e, 'Impossible de vérifier l\'agenda de ces jours : aucune pause créée'));
      return;
    }
    const s = timeToMinutes(start_time);
    const e = timeToMinutes(end_time);
    let created = 0;
    let taken = 0;
    let withClient = 0;
    let onLeave = 0;
    let errors = 0;
    for (const date of recurrenceDates) {
      const sameDay = existing.filter((a) => String(a.date).slice(0, 10) === date
        && String(a.employee_id) === String(employee_id)
        && !['cancelled', 'last_minute', 'no_show'].includes(a.status));
      if (sameDay.some((a) => String(a.start_time).slice(0, 5) === start_time)) { taken++; continue; }
      if (sameDay.some((a) => a.status !== 'break'
        && timeToMinutes(a.start_time) < e && timeToMinutes(a.end_time || a.start_time) > s)) { withClient++; continue; }
      if (approvedTimeOffs.some((t) => String(t.employee_id) === String(employee_id)
        && date >= String(t.start_date).slice(0, 10) && date <= String(t.end_date).slice(0, 10))) { onLeave++; continue; }
      try {
        await api.entities.Appointment.create(buildBreakPayload(start_time, end_time, employee_id, date));
        created++;
      } catch (err) {
        if (err?.status === 409) taken++;
        else errors++;
      }
    }
    refreshAll();
    const parts = [`${created} pause${created > 1 ? 's' : ''} créée${created > 1 ? 's' : ''}`];
    if (taken) parts.push(`${taken} jour${taken > 1 ? 's' : ''} déjà pris`);
    if (withClient) parts.push(`${withClient} avec un client à cette heure (non posée${withClient > 1 ? 's' : ''})`);
    if (onLeave) parts.push(`${onLeave} en congé`);
    if (errors) parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`);
    if (taken + withClient + onLeave + errors === 0) toast.success(parts.join(' · '));
    else toast.warning(parts.join(' · '), { duration: 8000 });
  };

  const handleExport = () => {
    // Apps natives : enregistrement par la feuille de partage (exportCSV.js) ; un échec est dit
    Promise.resolve(exportToCSV(
      visible.filter((a) => a.status !== 'break').map((a) => ({
        date: a.date, heure_debut: a.start_time, heure_fin: a.end_time,
        client: a.client_name, email: a.client_email, telephone: a.client_phone || '',
        barber: a.employee_name, services: a.services?.map((s) => s.name).join(' + ') || '',
        duree_min: a.total_duration, prix_eur: a.total_price, statut: a.status, notes: a.notes || '',
      })),
      `agenda_${dates[0]}`,
    )).then((done) => { if (done === false) toast.info('Aucun rendez-vous à exporter sur cette période'); })
      .catch(() => toast.error('Export impossible, réessayez'));
  };

  const openDay = (day) => updateParams({ view: 'day', date: toDateStr(day) });

  // ─── Fiche RDV : modifié / déplacé / supprimé ───
  const handleChanged = (updated) => {
    refreshAll();
    setSelected(null);
    // Déplacé hors de la période affichée : l'agenda suit le rendez-vous
    const newDate = updated?.date ? String(updated.date).slice(0, 10) : null;
    if (newDate && !dateSet.has(newDate)) updateParams({ date: newDate });
  };

  const handleDeleted = () => {
    refreshAll();
    setSelected(null);
  };

  // ─── Client venu sans rendez-vous (ou rendez-vous pris par téléphone) ───
  // Jour proposé : aujourd'hui s'il est affiché (vue Semaine / Mois), sinon le jour courant de l'agenda.
  // Barber proposé : celui affiché, sinon le barber connecté.
  const todayKey = toDateStr(new Date());
  const walkInDate = view !== 'day' && dateSet.has(todayKey) ? todayKey : dateKey;
  const walkInEmployeeId = employeeFilter !== 'all'
    ? String(employeeFilter)
    : (user?.employee_id && employees.some((e) => String(e.id) === String(user.employee_id)) ? String(user.employee_id) : '');

  const handleWalkInCreated = (apt, { done }) => {
    setWalkInOpen(false);
    refreshAll();
    const newDate = apt?.date ? String(apt.date).slice(0, 10) : null;
    const params = {};
    if (newDate && !dateSet.has(newDate)) params.date = newDate;
    // Agenda filtré sur un autre barber : on passe sur celui du client saisi, sinon il serait invisible
    if (apt?.employee_id && employeeFilter !== 'all' && String(employeeFilter) !== String(apt.employee_id)) {
      params.barber = String(apt.employee_id);
    }
    if (Object.keys(params).length) updateParams(params);
    const who = apt?.client_name || 'Client';
    // Prestation déjà terminée : la fiche s'ouvre pour « Valider la prestation » (encaissement) ; pas de
    // notification par-dessus, elle cachait la croix de la fiche
    if (done && apt?.id) {
      setSelected(apt);
      return;
    }
    toast.success(`${who} ajouté à ${String(apt?.start_time || '').slice(0, 5)}${apt?.employee_name ? ` avec ${apt.employee_name}` : ''}`, {
      description: 'À la fin, ouvrez sa fiche et touchez « Valider la prestation ».',
      action: apt?.id ? { label: 'Ouvrir', onClick: () => setSelected(apt) } : undefined,
    });
  };

  // ─── Pause ou créneau sans client : enregistré tout de suite, « Annuler » dans la notification ───
  // `guard` : drapeaux du premier enregistrement seulement (jamais renvoyés par « Annuler »)
  const quickSave = (apt, fields, message, guard = {}) => {
    const before = Object.fromEntries(Object.keys(fields).map((k) => [k, apt[k] ?? null]));
    saveMove(queryClient, apt, fields, false, guard)
      .then(() => toast.success(message, {
        action: {
          label: 'Annuler',
          onClick: () => saveMove(queryClient, { ...apt, ...fields }, before, false)
            .catch((e) => toast.error(agendaErrorMessage(e, 'Retour impossible'))),
        },
      }))
      .catch((e) => toast.error(agendaErrorMessage(e, 'Modification impossible')));
  };

  // Même heure de départ qu'un autre créneau du même barber : refusé par la base, on prévient avant
  const clashFor = (apt, date, startTime, duration, employeeId) => slotIssues({
    selfId: apt.id, date, startTime, duration,
    employee: employees.find((e) => String(e.id) === String(employeeId)),
    employeeId, dayApts: inRange, timeOffs: [],
  }).clash;

  // ─── Carte glissée dans la grille ───
  // Pause ou créneau last minute sans client : déplacé tout de suite. Rendez-vous d'un client :
  // confirmation (avant / après, alertes, « Prévenir le client »).
  const handleMoveRequest = (apt, target) => {
    const freeSlot = isBreak(apt) || (isLastMinuteSlot(apt) && !apt.client_email);
    if (!freeSlot) {
      setPendingMove({ apt, ...target });
      return;
    }
    const fields = buildMoveFields(apt, target, employees);
    const clash = clashFor(apt, fields.date, fields.start_time, aptDuration(apt), target.employee_id);
    if (clash) {
      toast.error(clash);
      return;
    }
    // Last Minute encore libre d'après la carte : si un client de l'app l'a repris entre-temps, le
    // serveur refuse (409) au lieu de déplacer son rendez-vous sans confirmation (tour 7)
    const guard = !isBreak(apt) && apt.status === 'last_minute' ? { if_free_last_minute: true } : {};
    quickSave(apt, fields, `${isBreak(apt) ? 'Pause déplacée' : 'Créneau déplacé'} à ${fields.start_time}`, guard);
  };

  // ─── Pause étirée par ses poignées, ou horaires saisis dans sa fenêtre ───
  const handleResizeRequest = (apt, { start_time, end_time }) => {
    const duration = timeToMinutes(end_time) - timeToMinutes(start_time);
    if (duration < 5) {
      toast.error('La fin doit être après le début');
      return;
    }
    if (start_time !== String(apt.start_time).slice(0, 5)) {
      const clash = clashFor(apt, String(apt.date).slice(0, 10), start_time, duration, apt.employee_id);
      if (clash) {
        toast.error(clash);
        return;
      }
    }
    quickSave(apt, { start_time, end_time, total_duration: duration }, `Pause : ${start_time} – ${end_time}`);
  };

  // ─── Last Minute ───
  // Barber proposé : le barber connecté, sinon celui affiché dans l'agenda, sinon le premier barber actif
  const lastMinuteEmployeeId = (() => {
    const known = (id) => id != null && id !== '' && employees.some((e) => String(e.id) === String(id));
    if (known(user?.employee_id)) return String(user.employee_id);
    if (employeeFilter !== 'all' && known(employeeFilter)) return String(employeeFilter);
    return employees[0] ? String(employees[0].id) : '';
  })();
  // RDV d'un barber ce jour-là déjà dans le cache de l'agenda (jour affiché, données de la période
  // en cours et non celles de la précédente), sinon `null` : la fenêtre les charge elle-même.
  const lastMinuteCachedDay = (employeeId, date) => {
    if (!dateSet.has(date) || isPlaceholderData || agendaFailed) return null;
    return appointments.filter((a) => String(a.employee_id) === String(employeeId) && String(a.date).slice(0, 10) === date);
  };

  // Créneaux last minute expirés (fin + 15 min passée, heure de Paris) que personne n'a pris
  useEffect(() => {
    if (!appointments.length) return;
    const nowMs = Date.now();

    const expired = appointments.filter((a) =>
      a.status === 'last_minute'
      && !a.client_email
      && a.client_name === 'Last Minute'
      && (() => { const end = appointmentEndParis(a); return end != null && end + 15 * 60000 <= nowMs; })());

    if (expired.length === 0) return;

    // Motif « système » : le tableau de bord ne les compte ni en no-show ni en annulation
    Promise.allSettled(expired.map((a) => api.entities.Appointment.update(a.id, {
      status: 'no_show',
      cancellation_reason: LAST_MINUTE_EXPIRED_REASON,
    }))).then((results) => {
      // Rien d'écrit (hors ligne, refus) : pas de rechargement, sinon la boucle recommencerait aussitôt.
      // Sauf un 409 : le serveur dit que le créneau a été repris par un client (cache périmé). Le
      // rechargement apporte la ligne `confirmed`, qui ne passe plus ce filtre : pas de boucle.
      if (results.some((r) => r.status === 'fulfilled' || r.reason?.status === 409)) invalidateAppointmentQueries(queryClient);
    });
  }, [appointments, queryClient]);

  // ─── Navigation au clavier (← / →) et au doigt (glisser à gauche / à droite) ───
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target;
      if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const swipe = useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) { swipe.current = null; return; }
    // Sur une carte, le doigt la déplace (appui long) ou l'ouvre : jamais de changement de période
    if (e.target.closest?.('[data-block]')) { swipe.current = null; return; }
    // Grille qui défile déjà horizontalement (journée à cinq barbers sur téléphone) : pas de changement de jour
    const scroller = e.target.closest?.('[data-scroll-container]');
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 2) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || selected || selectedBreak || pendingBreak || pendingMove || walkInOpen) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // Glissé franc et rapide : un appui long (tracé d'une pause) ou un défilement vertical ne comptent pas
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.8 && Date.now() - s.t < SWIPE_MAX_MS) {
      step(dx < 0 ? 1 : -1);
    }
  };

  const realAppointmentCount = visible.filter((a) =>
    a.status !== 'break' && a.status !== 'last_minute' && a.status !== 'cancelled' && !isUnclaimedLastMinute(a)).length;

  // Fiche ouverte tenue à jour par les rechargements (client assigné à un last minute, fiche restée ouverte)
  const selectedFresh = useMemo(
    () => (selected ? appointments.find((a) => String(a.id) === String(selected.id)) || selected : null),
    [selected, appointments],
  );

  return (
    <div className="flex flex-col h-full">
      <AgendaToolbar
        view={view}
        onViewChange={setView}
        currentDate={currentDate}
        onDateChange={setDate}
        onStep={step}
        onExport={handleExport}
        onAddClient={() => setWalkInOpen(true)}
        loading={isFetching}
      />

      {/* Rendez-vous passés à confirmer : venu ou absent (carte Gang des clients) */}
      <AttendanceCheck user={user} onOpen={(apt) => setSelected(apt)} />

      {/* Barbers, annulés, Last Minute */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <button
          type="button"
          onClick={() => setEmployeeFilter('all')}
          className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${employeeFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
        >
          Tous
        </button>
        {employees.map((emp) => {
          const active = String(employeeFilter) === String(emp.id);
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => setEmployeeFilter(emp.id)}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${active ? 'text-primary-foreground border-transparent' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              style={active ? { background: emp.color, borderColor: emp.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : emp.color }} />
              {emp.name}
            </button>
          );
        })}
        <span className="shrink-0 w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-all ${showCancelled ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'border-border text-muted-foreground hover:border-red-400/40'}`}
          title={showCancelled ? 'Masquer les rendez-vous annulés' : 'Afficher les rendez-vous annulés'}
        >
          Annulés{cancelledCount ? ` (${cancelledCount})` : ''}
        </button>
        <span className="shrink-0 text-xs text-muted-foreground ml-auto pl-2">{agendaFailed ? '–' : realAppointmentCount} rdv</span>
        <button
          type="button"
          onClick={() => setLastMinute((s) => ({ open: true, key: s.key + 1 }))}
          className="shrink-0 px-3 py-1.5 text-xs rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 hover:bg-orange-500/25 transition-all font-semibold"
        >
          Last Minute
        </button>
      </div>

      {privateInView.length > 0 && (
        <div role="status" className="mb-3 space-y-1">
          {privateInView.map((ev) => (
            <p key={ev.id} className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200 break-words">
              🔒 Privatisation : {PRIVATE_TYPES[ev.event_type] || 'Privatisation'} · {PRIVATE_SLOTS[ev.time_slot] || PRIVATE_SLOTS.full_day}
              {view !== 'day' ? ` · ${shortDayLabel(ev.date)}` : ''}{ev.client_name ? ` · ${ev.client_name}` : ''}
            </p>
          ))}
        </div>
      )}

      {agendaFailed && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">
            {agendaPaused || isNetworkError(agendaError)
              ? 'Pas de connexion internet : l\'agenda de ces jours n\'a pas pu être chargé.'
              : 'Impossible de charger l\'agenda (connexion ?).'}
          </p>
          <button type="button" onClick={() => refetch()} className="text-xs font-semibold text-red-300 flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Réessayer
          </button>
        </div>
      )}

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {view === 'day' && (
          <DayView
            date={dateKey}
            appointments={visible}
            employees={employees}
            employeeFilter={employeeFilter}
            timeOffs={approvedTimeOffs}
            onSelect={setSelected}
            onBreakClick={setSelectedBreak}
            onCreateBreak={handleCreateBreak}
            onFocusBarber={setEmployeeFilter}
            onMoveRequest={handleMoveRequest}
            onResizeRequest={handleResizeRequest}
            linkedOrders={linkedOrders}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            appointments={visible}
            employees={employees}
            employeeFilter={employeeFilter}
            timeOffs={approvedTimeOffs}
            onSelect={setSelected}
            onBreakClick={setSelectedBreak}
            onCreateBreak={handleCreateBreak}
            onDayClick={openDay}
            onMoveRequest={handleMoveRequest}
            onResizeRequest={handleResizeRequest}
            linkedOrders={linkedOrders}
          />
        )}
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            appointments={visible}
            employees={employees}
            onDayClick={openDay}
            onSelect={setSelected}
          />
        )}
      </div>

      <AppointmentDetailModal
        appointment={selectedFresh}
        employees={employees}
        linkedOrders={selectedFresh ? linkedOrders.get(String(selectedFresh.id)) : undefined}
        onClose={() => setSelected(null)}
        onChanged={handleChanged}
        onDeleted={handleDeleted}
      />

      <WalkInDialog
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        employees={employees}
        defaultEmployeeId={walkInEmployeeId}
        defaultDate={walkInDate}
        onCreated={handleWalkInCreated}
      />

      <MoveDialog
        key={pendingMove ? `${pendingMove.apt.id}-${pendingMove.date}-${pendingMove.start_time}-${pendingMove.employee_id}` : 'none'}
        move={pendingMove}
        employees={employees}
        appointments={inRange}
        timeOffs={approvedTimeOffs}
        onClose={() => setPendingMove(null)}
      />

      {/* Pause : récurrence / suppression */}
      <BreakModal
        key={selectedBreak?.id || 'none'}
        breakItem={selectedBreak}
        employees={employees}
        onClose={() => setSelectedBreak(null)}
        onDelete={(id) => deleteBreak.mutate(id)}
        onApplyRecurrence={handleApplyRecurrence}
        onSaveTimes={(item, times) => { handleResizeRequest(item, times); setSelectedBreak(null); }}
      />

      {/* Choix du barber pour une pause tracée en vue « Tous » */}
      <Dialog open={!!pendingBreak} onOpenChange={(open) => !open && setPendingBreak(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Pause {pendingBreak?.start_time} – {pendingBreak?.end_time}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-3">Pour quel barber ?</p>
          <div className="space-y-2">
            {employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => handlePendingBreakSelectEmployee(emp.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: emp.color }} />
                <span className="text-sm font-medium">{emp.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={handlePendingBreakSelectAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground"
            >
              Tous les barbers
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notification Last Minute */}
      <Dialog open={lastMinute.open} onOpenChange={(open) => !open && setLastMinute((s) => ({ ...s, open: false }))}>
        <DialogContent className="sm:max-w-sm">
          {lastMinute.key > 0 && (
            <LastMinuteForm
              key={lastMinute.key}
              open={lastMinute.open}
              employees={employees}
              timeOffs={approvedTimeOffs}
              defaultEmployeeId={lastMinuteEmployeeId}
              defaultDate={dateKey}
              cachedDay={lastMinuteCachedDay}
              onCreated={refreshAll}
              onDone={() => setLastMinute((s) => ({ ...s, open: false }))}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Last Minute : créneau annoncé par push à tous les clients ───
//
// Le créneau doit être réservable tel quel par un client : la réservation (`lib/slots.js`) ne
// propose que la grille des demi-heures à partir du début des horaires du barber, dans ses horaires,
// hors congé. Un Last Minute à 15:15 ou à 20:00 était annoncé mais introuvable. Le serveur reprend
// la ligne `last_minute` qui chevauche la plage réservée : la fin doit donc être après le début
// (avant, une fin vide donnait une durée nulle).

const LAST_MINUTE_STEP = 30;

/** `yyyy-MM-dd` → Date à midi (même jour du calendrier, sans saut à l'heure d'été), comme `parisDay`. */
function lastMinuteDayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Message lisible d'une erreur d'API : réseau, quota, sinon le message du serveur. */
function lastMinuteErrorMessage(e) {
  if (isNetworkError(e)) return 'Pas de connexion internet';
  const m = e?.data?.error || e?.data?.message || e?.message;
  const serverText = m && !/^HTTP \d+$/.test(m) ? m : '';
  if (e?.status === 429) return serverText || 'Trop d\'envois Last Minute cette heure-ci (6 par heure) : réessayez plus tard';
  if (e?.status === 401 || e?.status === 403) return serverText || 'Envoi réservé à l\'équipe du salon';
  return serverText || 'Le serveur n\'a pas répondu';
}

/**
 * Erreur après laquelle on ne sait pas si le push est parti : réseau coupé pendant l'attente, ou
 * réponse 5xx sans message du serveur (503 du routeur Heroku alors que l'envoi continue). Un refus
 * net (400 / 401 / 403 / 429, ou 500 avec le message du serveur) garantit qu'il n'est pas parti.
 */
function lastMinuteUncertain(e) {
  if (isNetworkError(e) || !e?.status) return true;
  return e.status >= 500 && !(e.data?.error || e.data?.message);
}

/** Compteur numérique de la réponse du serveur (lu défensivement : les noms peuvent varier). */
function readCount(result, ...keys) {
  for (const k of keys) {
    const v = result?.[k];
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Compte rendu de `POST /last-minute` : succès seulement si au moins un appareil a été joint.
 * `sent` absent ou à 0 → avertissement (le créneau est bloqué, mais personne n'est prévenu).
 */
function lastMinuteReport(result) {
  const sent = readCount(result, 'sent') ?? 0;
  const failed = readCount(result, 'failed', 'errors');
  const total = readCount(result, 'total', 'subscribers', 'count');
  const skippedNative = readCount(result, 'skippedNative', 'skipped_native');
  const details = [];
  if (total != null) details.push(`${plural(total, 'appareil')} abonné${total > 1 ? 's' : ''}`);
  if (failed > 0) details.push(plural(failed, 'échec'));
  if (skippedNative > 0) details.push(`${plural(skippedNative, 'téléphone')} iOS / Android non joint${skippedNative > 1 ? 's' : ''} (push natif non configuré sur le serveur)`);
  const description = details.length ? details.join(' · ') : undefined;
  if (sent > 0) {
    return { level: 'success', title: `Notification envoyée à ${plural(sent, 'appareil')} · Créneau bloqué`, description };
  }
  let title = 'Créneau bloqué, mais aucun client n\'a reçu la notification : aucun téléphone client n\'a encore activé les notifications';
  if (failed > 0) title = `Créneau bloqué, mais aucune notification n'a abouti (${plural(failed, 'échec')})`;
  else if (skippedNative > 0) title = 'Créneau bloqué, mais aucun client n\'a reçu la notification : les téléphones abonnés n\'ont pas pu être joints';
  else if (total > 0) title = 'Créneau bloqué, mais aucun client n\'a reçu la notification';
  return { level: 'warning', title, description };
}

/** Lien ouvert par la notification : la réservation avec ce barber, ce jour et cette heure déjà choisis. */
function lastMinuteBookingUrl({ employee_id, date, start_time }) {
  return `/booking?barber=${encodeURIComponent(employee_id)}&date=${date}&time=${start_time}`;
}

/**
 * Annonce automatique d'un Last Minute (serveur, jobs/lastMinuteAutoPush.js, 20 oct. 2026) : tous
 * les clients sont prévenus 3 h avant le début, jamais avant 08:00. Rend `{ label, dueNow }` :
 * heure d'envoi (« 14:30 ») et vrai si elle est déjà atteinte (le créneau commence dans moins de
 * 3 h : la notification part tout de suite, depuis l'agenda).
 */
const LAST_MINUTE_AUTO_LEAD = 180;
function lastMinuteAutoAnnounce(date, start) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{2}:\d{2}$/.test(String(start || ''))) return null;
  const label = minutesToTime(Math.max(timeToMinutes(start) - LAST_MINUTE_AUTO_LEAD, 8 * 60));
  return { label, dueNow: parisInstant(date, label) <= Date.now() };
}

function LastMinuteForm({ open, employees, timeOffs, defaultEmployeeId, defaultDate, cachedDay, onCreated, onDone }) {
  const todayKey = parisDay(0).key;
  const tomorrowKey = parisDay(1).key;
  const [form, setForm] = useState(() => ({
    employee_id: defaultEmployeeId || '',
    date: defaultDate && defaultDate >= todayKey ? defaultDate : todayKey,
    start_time: '',
    end_time: '',
  }));
  const [sending, setSending] = useState(false);
  // Ligne `last_minute` déjà créée : un nouvel essai ne renvoie que la notification
  const [created, setCreated] = useState(null);
  const [pushError, setPushError] = useState(null);
  // Réponse perdue : le push est peut-être parti, un renvoi demande une confirmation en deux taps
  const [pushUncertain, setPushUncertain] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  // Créneau à plus de 3 h : prévenir aussi tout de suite (sinon seule l'annonce automatique part)
  const [notifyNow, setNotifyNow] = useState(false);

  // Barbers chargés après l'ouverture : le premier est proposé
  useEffect(() => {
    if (!form.employee_id && employees.length) setForm((f) => ({ ...f, employee_id: String(employees[0].id) }));
  }, [employees, form.employee_id]);

  const employee = employees.find((e) => String(e.id) === String(form.employee_id)) || null;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(form.date);
  const cached = employee && validDate ? cachedDay(employee.id, form.date) : null;

  // RDV et pauses du barber ce jour-là : le cache de l'agenda s'affiche tout de suite, la liste est
  // relue pour être à jour (une réservation a pu arriver depuis le dernier rafraîchissement)
  const dayQuery = useQuery({
    queryKey: ['lastMinuteDay', String(employee?.id ?? ''), form.date],
    queryFn: () => api.entities.Appointment.filter({ employee_id: employee.id, date: form.date }, 'start_time', 200),
    enabled: open && !created && !!employee && validDate && form.date >= todayKey,
    placeholderData: cached || undefined,
    staleTime: 0,
  });
  const dayApts = dayQuery.data ?? cached;
  // Last Minute déjà bloqués ce jour-là et encore à venir, pas forcément annoncés (réponse perdue,
  // push refusé puis fenêtre fermée) : on peut les annoncer sans recréer de ligne (tour 7). Le
  // serveur ignore un second envoi du même créneau dans les 15 min (anti-doublon).
  const pendingLM = (!created && employee && validDate && Array.isArray(dayApts) ? dayApts : [])
    .filter((a) => String(a.employee_id) === String(employee.id) && String(a.date).slice(0, 10) === form.date
      && a.status === 'last_minute' && !String(a.client_email || '').trim() && a.client_name === 'Last Minute'
      && a.start_time && parisInstant(form.date, String(a.end_time || a.start_time).slice(0, 5)) > Date.now())
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  // Privatisations confirmées du jour choisi (il peut sortir de la période affichée) : le salon est
  // réservé sur leur fenêtre, aucun client ne pourrait y prendre un Last Minute
  const privQuery = useQuery({
    queryKey: ['lastMinutePrivate', form.date],
    queryFn: () => api.entities.Event.filter({ date: form.date, status: 'confirmed' }, 'date', 20),
    enabled: open && !created && validDate && form.date >= todayKey,
    staleTime: 60000,
  });
  const privWindows = (Array.isArray(privQuery.data) ? privQuery.data : [])
    .filter((ev) => String(ev.date || '').slice(0, 10) === form.date && ev.status === 'confirmed')
    .map((ev) => ({ window: privateWindow(ev.time_slot), label: PRIVATE_SLOTS[ev.time_slot] || PRIVATE_SLOTS.full_day }));

  // Heures proposées : la grille de la réservation client, sans le passé (heure de Paris) ni les
  // heures où un RDV / une pause du barber commence ou chevauche
  const plan = (() => {
    if (!employee) return { state: 'no-employee' };
    if (!validDate) return { state: 'no-date' };
    if (form.date < todayKey) return { state: 'past' };
    if (isOnLeave(employee, form.date, timeOffs)) return { state: 'leave' };
    const hours = workingHoursOf(employee, lastMinuteDayDate(form.date));
    if (!hours) return { state: 'off' };
    if (!dayApts) return { state: dayQuery.isError ? 'error' : 'loading' };
    if (privQuery.isPending && privQuery.fetchStatus !== 'idle') return { state: 'loading' };
    const openAt = hours.start || '09:00';
    const closeAt = hours.end || '19:00';
    const close = timeToMinutes(closeAt);
    const busy = dayApts
      .filter((a) => String(a.employee_id) === String(employee.id) && String(a.date).slice(0, 10) === form.date
        && a.start_time && !isCancelledLike(a))
      .map((a) => {
        const s = timeToMinutes(a.start_time);
        // Ancien Last Minute sans fin (durée nulle) : il occupe au moins sa minute de départ
        return [s, Math.max(timeToMinutes(a.end_time || a.start_time), s + 1)];
      });
    busy.push(...privWindows.map((p) => p.window));
    const free = (s, e) => !busy.some(([bs, be]) => s < be && e > bs);
    const now = Date.now();
    const starts = generateTimeSlots(openAt, closeAt, LAST_MINUTE_STEP)
      .filter((t) => parisInstant(form.date, t) > now)
      .filter((t) => {
        const s = timeToMinutes(t);
        return free(s, Math.min(s + LAST_MINUTE_STEP, close));
      });
    const endsFor = (start) => {
      const s = timeToMinutes(start);
      const candidates = [];
      for (let t = s + LAST_MINUTE_STEP; t < close; t += LAST_MINUTE_STEP) candidates.push(t);
      candidates.push(close);
      const out = [];
      for (const t of candidates) {
        if (t <= s || !free(s, t)) break;
        out.push(minutesToTime(t));
      }
      return out;
    };
    if (!starts.length && privWindows.length) return { state: 'private', openAt, closeAt };
    return { state: starts.length ? 'ok' : 'full', starts, endsFor, openAt, closeAt };
  })();

  const starts = plan.starts || [];
  const startTime = created ? created.start_time : (starts.includes(form.start_time) ? form.start_time : '');
  const ends = created ? [created.end_time] : (startTime && plan.endsFor ? plan.endsFor(startTime) : []);
  // Fin par défaut : début + 30 min (première heure de la liste)
  const endTime = created ? created.end_time : (ends.includes(form.end_time) ? form.end_time : ends[0] || '');
  const dateLabel = validDate
    ? `${form.date === todayKey ? 'aujourd\'hui, ' : form.date === tomorrowKey ? 'demain, ' : ''}${format(lastMinuteDayDate(form.date), 'EEEE d MMMM', { locale: fr })}`
    : '';

  // Ligne déjà créée : plus de contrôle (le créneau apparaît désormais occupé par elle-même)
  const blocker = created ? null : {
    'no-employee': employees.length ? 'Choisissez un barber.' : 'Aucun barber actif.',
    'no-date': 'Choisissez une date.',
    past: 'Cette date est passée.',
    leave: `${employee?.name || 'Ce barber'} est en congé ce jour-là : aucun client ne pourrait réserver ce créneau.`,
    off: `${employee?.name || 'Ce barber'} ne travaille pas ce jour-là : aucun client ne pourrait réserver ce créneau.`,
    private: `Salon privatisé ce jour-là (${privWindows.map((p) => p.label).join(', ')}) : aucun client ne pourrait réserver ce créneau.`,
    full: `Plus aucune demi-heure libre ${form.date === todayKey ? 'aujourd\'hui' : 'ce jour-là'} pour ${employee?.name || 'ce barber'}${plan.openAt ? ` (horaires ${plan.openAt} – ${plan.closeAt})` : ''}.`,
  }[plan.state];

  const canSend = !sending && (created ? true : plan.state === 'ok' && !!startTime && !!endTime);
  // Annonce automatique de 3 h avant ; créneau déjà dans la fenêtre (ou ligne existante à annoncer) :
  // la notification part tout de suite depuis l'agenda
  const auto = !created && startTime ? lastMinuteAutoAnnounce(form.date, startTime) : null;
  const pushNow = created ? true : (!auto || auto.dueNow || notifyNow);
  const autoDay = form.date === todayKey ? 'aujourd\'hui' : form.date === tomorrowKey ? 'demain' : (validDate ? `le ${format(lastMinuteDayDate(form.date), 'EEEE d MMMM', { locale: fr })}` : '');

  /** Créneau bloqué sans notification immédiate : le serveur l'annoncera 3 h avant. */
  const finishWithAutoAnnounce = () => {
    toast.success(`Créneau bloqué · tous les clients seront prévenus automatiquement ${autoDay} à ${auto.label}`, {
      description: 'Notification envoyée par le serveur 3 h avant le créneau (jamais avant 8 h).',
      duration: 8000,
    });
    setSending(false);
    onDone();
  };

  const handleSendLastMinute = async () => {
    if (!canSend) return;
    // Après une réponse perdue : premier tap = demande de confirmation, second = renvoi
    if (created && pushUncertain && !confirmResend) {
      setConfirmResend(true);
      return;
    }
    setSending(true);
    setPushError(null);
    setConfirmResend(false);
    let row = created;
    if (!row) {
      const payload = {
        client_name: 'Last Minute',
        client_email: '',
        client_phone: '',
        employee_id: employee.id,
        employee_name: employee.name || '',
        date: form.date,
        start_time: startTime,
        end_time: endTime,
        total_duration: timeToMinutes(endTime) - timeToMinutes(startTime),
        status: 'last_minute',
        services: [],
        total_price: 0,
      };
      try {
        // Créneau bloqué « last_minute » sur l'agenda : un client qui le réserve le reprend (serveur)
        const res = await api.entities.Appointment.create(payload);
        row = { id: res?.id ?? null, employee_id: employee.id, employee_name: employee.name || '', date: form.date, start_time: startTime, end_time: endTime };
        onCreated?.();
        // Plus de 3 h avant : pas de notification maintenant, le serveur l'enverra à l'heure
        if (!pushNow) {
          finishWithAutoAnnounce();
          return;
        }
        setCreated(row);
      } catch (e) {
        // Réponse perdue (réseau, 503 du routeur) : la ligne a pu être créée quand même. On relit la
        // journée ; si le créneau Last Minute est là, le prochain tap n'envoie que la notification
        // (sinon un nouvel essai créerait une seconde ligne sur le même créneau)
        if (lastMinuteUncertain(e)) {
          let found = null;
          let rereadFailed = false;
          try {
            const r = await dayQuery.refetch();
            const data = r?.data;
            rereadFailed = !!r?.isError;
            found = (Array.isArray(data) ? data : []).find((a) => a.status === 'last_minute'
              && String(a.employee_id) === String(employee.id)
              && String(a.date).slice(0, 10) === form.date
              && a.start_time?.slice(0, 5) === startTime
              && !String(a.client_email || '').trim()) || null;
          } catch { found = null; rereadFailed = true; }
          // Relecture impossible : on ne sait pas si la ligne existe ; jamais « Créneau non créé »
          if (!found && rereadFailed) {
            toast.warning('Le créneau a peut-être été créé : vérifiez l\'agenda avant de réessayer (il apparaîtra dans « Déjà bloqué » au retour du réseau)', { duration: 10000 });
            onCreated?.();
            setSending(false);
            return;
          }
          if (found && !pushNow) {
            onCreated?.();
            finishWithAutoAnnounce();
            return;
          }
          if (found) {
            setCreated({
              id: found.id, employee_id: employee.id, employee_name: employee.name || '',
              date: form.date, start_time: startTime, end_time: found.end_time?.slice(0, 5) || endTime,
            });
            onCreated?.();
            toast.info('Créneau déjà bloqué : touchez Envoyer pour prévenir les clients');
            setSending(false);
            return;
          }
        }
        toast.error(`Créneau non créé : ${lastMinuteErrorMessage(e)}`);
        setSending(false);
        return;
      }
    }
    try {
      const result = await apiRequest('POST', apiUrl('/last-minute'), {
        date: row.date,
        start_time: row.start_time,
        end_time: row.end_time,
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        url: lastMinuteBookingUrl(row),
      });
      // Renvoi d'un créneau déjà notifié dans les 15 min : le serveur n'envoie rien une seconde fois
      // (pas de `force` : ce serait le double push que l'anti-doublon empêche)
      if (result?.already) {
        if (result.pending) {
          // Le premier envoi tourne encore : on ne sait pas s'il joindra quelqu'un. S'il finit sans
          // joindre personne, le serveur oublie le créneau et un nouveau tap repart normalement
          setPushUncertain(true);
          setPushError("L'envoi précédent est encore en cours");
          toast.info("L'envoi précédent est encore en cours : réessayez dans une minute pour voir le résultat");
          return; // fenêtre ouverte ; le `finally` remet `sending` à false
        }
        const sentBefore = readCount(result, 'sent');
        toast.info(sentBefore != null
          ? `Notification déjà envoyée à ${plural(sentBefore, 'appareil')} (pas de nouvel envoi)`
          : 'Notification déjà envoyée pour ce créneau (pas de nouvel envoi)');
        onDone();
        return;
      }
      const report = lastMinuteReport(result);
      toast[report.level](report.title, { description: report.description, duration: report.level === 'warning' ? 12000 : 6000 });
      onDone();
    } catch (e) {
      // La ligne existe : la fenêtre reste ouverte, « Renvoyer » ne la recrée pas
      setPushUncertain(lastMinuteUncertain(e));
      setPushError(lastMinuteErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const fieldClass = 'w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm disabled:opacity-60';

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
          Créneau Last Minute
        </DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground mb-3">
        Le créneau est bloqué dans l'agenda et apparaît sur l'accueil des clients le jour même. Tous les clients sont prévenus automatiquement 3 h avant (jamais avant 8 h). Seules les heures qu'un client peut réserver sont proposées.
      </p>
      <div className="space-y-3">
        <div>
          <label htmlFor="lm-barber" className="text-xs text-muted-foreground mb-1 block">Barber *</label>
          <select id="lm-barber" value={form.employee_id} disabled={!!created || sending}
            onChange={(e) => set({ employee_id: e.target.value, start_time: '', end_time: '' })}
            className={fieldClass}>
            {!employee && <option value="">Choisir…</option>}
            {employees.map((emp) => (
              <option key={emp.id} value={String(emp.id)}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lm-date" className="text-xs text-muted-foreground mb-1 block">Date *</label>
          <input id="lm-date" type="date" value={form.date} min={todayKey} disabled={!!created || sending}
            onChange={(e) => set({ date: e.target.value, start_time: '', end_time: '' })}
            className={fieldClass} />
          {dateLabel && <p className="mt-1 text-[11px] text-muted-foreground first-letter:uppercase">{dateLabel}</p>}
        </div>

        {pendingLM.length > 0 && !sending && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 space-y-2">
            <p className="text-xs font-semibold text-orange-300">Déjà bloqués : les clients seront prévenus automatiquement 3 h avant. « Annoncer » les prévient tout de suite (nouvelle notification à tous).</p>
            <div className="flex flex-wrap gap-2">
              {pendingLM.map((a) => {
                const st = String(a.start_time).slice(0, 5);
                const en = String(a.end_time || a.start_time).slice(0, 5);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setPushUncertain(true); setCreated({ id: a.id, employee_id: employee.id, employee_name: employee.name || '', date: form.date, start_time: st, end_time: en }); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600"
                  >
                    Annoncer {st} – {en}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {blocker ? (
          <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">{blocker}</p>
        ) : plan.state === 'loading' && !created ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            Chargement des rendez-vous du jour…
          </p>
        ) : plan.state === 'error' && !created ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs text-red-400">
              {isNetworkError(dayQuery.error) ? 'Pas de connexion internet.' : 'Impossible de charger les rendez-vous du jour.'}
            </p>
            <button type="button" onClick={() => dayQuery.refetch()} className="text-xs font-semibold text-red-300 flex items-center gap-1 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" /> Réessayer
            </button>
          </div>
        ) : null}

        {(created || plan.state === 'ok') && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="lm-start" className="text-xs text-muted-foreground mb-1 block">Début *</label>
              <select id="lm-start" value={startTime} disabled={!!created || sending}
                onChange={(e) => set({ start_time: e.target.value, end_time: '' })}
                className={`${fieldClass} appearance-none`}>
                {!startTime && <option value="">--:--</option>}
                {(created ? [created.start_time] : starts).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="lm-end" className="text-xs text-muted-foreground mb-1 block">Fin *</label>
              <select id="lm-end" value={endTime} disabled={!!created || sending || !startTime}
                onChange={(e) => set({ end_time: e.target.value })}
                className={`${fieldClass} appearance-none`}>
                {!endTime && <option value="">--:--</option>}
                {ends.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        {auto && plan.state === 'ok' && (
          auto.dueNow ? (
            <p role="status" className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs leading-relaxed text-orange-300">
              Le créneau commence dans moins de 3 h : tous les clients sont prévenus tout de suite.
            </p>
          ) : (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 space-y-2">
              <p role="status" className="text-xs leading-relaxed text-orange-300">
                Tous les clients seront prévenus automatiquement <strong className="font-semibold">{autoDay} à {auto.label}</strong> (3 h avant{auto.label === '08:00' ? ', pas avant 8 h' : ''}).
              </p>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input type="checkbox" checked={notifyNow} disabled={sending}
                  onChange={(e) => setNotifyNow(e.target.checked)}
                  className="w-4 h-4 accent-orange-500" />
                Prévenir aussi les clients tout de suite
              </label>
            </div>
          )
        )}

        {pushError && (pushUncertain ? (
          <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
            Créneau bloqué. La notification est peut-être partie (la réponse du serveur n'est pas arrivée) : vérifiez auprès d'un client avant de la renvoyer (le serveur ne bloque les doublons que pendant 15 min).
          </div>
        ) : (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
            Créneau bloqué, mais la notification n'est pas partie : {pushError}
          </div>
        ))}
        {confirmResend && !sending && (
          <p role="status" className="text-xs leading-relaxed text-amber-300">
            Si ce créneau a déjà été annoncé, tous les clients recevront la notification une seconde fois (le serveur ne bloque les doublons que pendant 15 min). Touchez encore pour envoyer.
          </p>
        )}

        <button
          type="button"
          onClick={handleSendLastMinute}
          disabled={!canSend}
          className="w-full py-3 rounded-xl bg-orange-500 text-white font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : created && pushUncertain ? (
            confirmResend ? 'Confirmer' : 'Vérifier l\'envoi / réessayer'
          ) : created ? (
            'Renvoyer la notification'
          ) : pushNow ? (
            'Bloquer et prévenir les clients'
          ) : (
            'Bloquer le créneau'
          )}
        </button>
        {created && !sending && (
          <button type="button" onClick={onDone}
            className="w-full py-2.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-all">
            Fermer (le créneau reste bloqué dans l'agenda)
          </button>
        )}
      </div>
    </>
  );
}
