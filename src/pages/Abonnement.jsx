/**
 * Abonnements au mois, côté client (planche 1 à 5, contrat : docs/fonctions/abonnements-contrat.md) :
 * choix de la formule, barber et premier RDV, les 4 RDV proposés avec « Changer », récapitulatif,
 * succès ; `?reprendre=<id>` : un seul RDV à reprendre (`RebookFlow`).
 *
 * Chaque étape est une entrée d'historique (`location.state.aboStep`) : le retour du navigateur, le
 * bouton retour et celui d'Android font la même chose, une étape en arrière. Une étape d'historique
 * sans ses données (rechargement, retour après le succès) revient à la première étape. Drapeau
 * `features.subscriptions` faux : la page n'existe pas, retour au catalogue ; illisible : « Réessayer »,
 * jamais le catalogue.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { addDays, format } from 'date-fns';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import BookingBar from '@/components/booking/BookingBar';
import PlanChoice from '@/components/abonnement/PlanChoice';
import ProposedVisits, { perVisit } from '@/components/abonnement/ProposedVisits';
import RebookFlow, { BarBackdrop } from '@/components/abonnement/RebookFlow';
import SlotPicker from '@/components/abonnement/SlotPicker';
import StepHeader, { VisitProgress } from '@/components/abonnement/StepHeader';
import SubscriptionRecap from '@/components/abonnement/SubscriptionRecap';
import SubscriptionSuccess from '@/components/abonnement/SubscriptionSuccess';
import { useSlotData } from '@/components/abonnement/useSlotData';
import { dayLabel } from '@/components/abonnement/visitLabels';
import { formatPrice } from '@/components/services/serviceUtils';
import LoadError, { friendlyError, isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { dateFromKey, lastVisitBarber, weekKeyOf } from '@/lib/availability';
import { hapticFeedback } from '@/lib/capacitor';
import { forgetBookedLastMinute } from '@/lib/lastMinute';
import {
  MAX_SPAN_DAYS, MIN_GAP_DAYS, SUBSCRIPTION_VISITS, createSubscription, fetchMySubscriptions,
  invalidateSubscriptionQueries, newRequestKey, proposeNextSlots, slotsIssue, subscriptionKeys, useSubscriptionPlans,
  useSubscriptionsFeatureState,
} from '@/lib/subscriptions';
import { useAndroidBack } from '@/lib/useAndroidBack';

const NO_WEEKS = [];
const EMPTY_LIST = [];
/** Écart maximal d'un jour proposé autour du jour visé (`proposeNextSlots`). */
const PROPOSE_DAY_SHIFT = 3;

/**
 * Le bouton de la barre arrive à la place de celui qu'on vient de toucher : inactif ce temps-là, un
 * double clic sur « Continuer » réservait sans avoir vu le récapitulatif (ms).
 */
const BAR_GUARD_MS = 600;

/** Mêmes textes que le serveur (`cleanSlots`), avant même d'envoyer. */
const ISSUE_TEXT = {
  too_close: `Laissez au moins ${MIN_GAP_DAYS} jours entre deux rendez-vous.`,
  too_far: 'Vos 4 rendez-vous doivent tenir dans les 5 semaines qui suivent le premier.',
};

const byWhen = (a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`);
const addDaysKey = (key, n) => format(addDays(dateFromKey(key), n), 'yyyy-MM-dd');

export default function Abonnement() {
  const feature = useSubscriptionsFeatureState();
  const [params] = useSearchParams();
  const reprendre = params.get('reprendre');

  if (feature.disabled) return <Navigate to="/services" replace />;
  return (
    <div className="min-h-screen relative overflow-x-clip">
      {/* Halos d'ambiance */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
      </div>
      {/* `pb-56` : la barre du bas la plus haute (titre au-dessus du bouton) ne recouvre rien */}
      <div className="relative max-w-lg mx-auto px-4 pt-5 pb-56">
        {feature.enabled ? (
          reprendre ? <RebookFlow key={reprendre} id={reprendre} /> : <PlanFlow />
        ) : feature.failed ? (
          // Serveur illisible : on ne sait pas, jamais « pas d'abonnement » ni un retour au catalogue
          <LoadError what="les abonnements" error={feature.query.error} onRetry={feature.query.refetch} retrying={feature.query.isFetching} />
        ) : (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement des abonnements">
            {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-2xl bg-card border border-border animate-pulse" />)}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanFlow() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const serviceId = params.get('service');
  const barberParam = params.get('barber');

  const { plans, query: plansQuery } = useSubscriptionPlans();
  const plan = useMemo(
    () => (serviceId ? plans.find(p => String(p.service_id) === String(serviceId)) || null : null),
    [plans, serviceId],
  );
  const [chosenId, setChosenId] = useState(null);
  const chosenPlan = plans.find(p => String(p.service_id) === String(chosenId)) || plan || plans[0] || null;

  // Premier RDV : { employee, date, time } ; les 4 RDV, triés, une fois proposés
  const [first, setFirst] = useState({ employee: null, date: null, time: null });
  const [lines, setLines] = useState(null);
  const [draft, setDraft] = useState(null);
  const [created, setCreated] = useState(null);
  const [sendError, setSendError] = useState(null);
  // Refus du serveur qui ne vise aucune ligne de l'étape 2 (son message, tel quel)
  const [linesNotice, setLinesNotice] = useState(null);
  // Réponse perdue : l'abonnement a peut-être été créé, la même clé d'essai rend celui-là
  const [uncertain, setUncertain] = useState(false);
  const requestKey = useRef(null);
  if (requestKey.current === null) requestKey.current = newRequestKey();

  const editIndex = Number.isInteger(location.state?.aboEdit) ? location.state.aboEdit : -1;
  const linesComplete = !!lines && lines.every(l => !!l.time);
  const rawStep = location.state?.aboStep || 'first';
  // Étape d'historique sans ses données : la page a été rechargée, ou on y revient après le succès
  const orphanStep = rawStep !== 'first' && rawStep !== 'done' && !first.time && !lines;
  let step = rawStep;
  if (!first.time && !lines) step = 'first';
  else if (rawStep === 'recap' && !linesComplete) step = 'lines';
  else if (rawStep === 'edit' && !(lines && lines[editIndex] && draft)) step = 'lines';
  else if (rawStep === 'done') step = 'first';
  const stepRef = useRef(step);
  stepRef.current = step;

  // Page quittée pendant un envoi : ni écran de succès ni retour forcé, un simple message (comme la
  // réservation : TanStack Query exécute les rappels de l'envoi même après le démontage)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // L'adresse garde l'étape (`state`) : sans cela, l'heure touchée à la première étape sautait à
  // l'étape 2, ou laissait un écran vide après le succès
  useEffect(() => {
    if (orphanStep) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [orphanStep]);

  // Bouton de la barre inactif juste après l'arrivée à l'étape 2 et au récapitulatif
  const [armedStep, setArmedStep] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => setArmedStep(step), BAR_GUARD_MS);
    return () => clearTimeout(timer);
  }, [step]);
  const barArmed = armedStep === step;

  const go = (nextStep, extra = {}) => {
    hapticFeedback();
    navigate(`${location.pathname}${location.search}`, { state: { aboStep: nextStep, ...extra } });
  };
  const back = () => {
    hapticFeedback();
    // Entrée directe sur la page (lien, rechargement) : rien derrière elle dans l'app
    if (location.key === 'default') navigate('/services');
    else navigate(-1);
  };

  // Chaque étape s'ouvre en haut de page
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [step, serviceId, created]);

  // Autre formule : autre durée, les créneaux choisis ne valent plus
  const planIdRef = useRef(null);
  useEffect(() => {
    if (!plan) return;
    const id = String(plan.service_id);
    if (planIdRef.current && planIdRef.current !== id) {
      setLines(null);
      setFirst(prev => ({ ...prev, time: null }));
      setSendError(null);
    }
    planIdRef.current = id;
    setChosenId(id);
  }, [plan?.service_id]);

  // Semaines lues pour proposer les 3 suivants, dès que le premier RDV est choisi
  const proposalWeeks = useMemo(() => {
    if (!first.date) return NO_WEEKS;
    const keys = [];
    const last = addDaysKey(first.date, MAX_SPAN_DAYS + PROPOSE_DAY_SHIFT);
    for (let k = weekKeyOf(dateFromKey(first.date)); k <= last; k = addDaysKey(k, 7)) keys.push(k);
    return keys;
  }, [first.date]);
  const slotData = useSlotData(first.time && plan ? proposalWeeks : NO_WEEKS);
  const { employees } = slotData;

  // Mêmes clé et requête que la réservation : barber de la dernière visite proposé d'office
  const isStaffAccount = user?.role === 'admin' || user?.role === 'barber';
  const myAppointmentsQuery = useQuery({
    queryKey: ['myAppointments', user?.email],
    queryFn: () => api.entities.Appointment.filter({ client_email: user.email }, '-date', 100),
    enabled: !!user?.email && !isStaffAccount,
  });
  const myAppointments = myAppointmentsQuery.data || EMPTY_LIST;
  const usualBarber = useMemo(() => lastVisitBarber(myAppointments, employees), [myAppointments, employees]);
  // Abonnement déjà à régler : dit dès l'ouverture, pas au bout des trois étapes (le serveur refuserait,
  // `pending_exists`). Lecture en échec : on laisse passer, le serveur a le dernier mot. Réponse perdue
  // sur un envoi (`uncertain`) : c'est peut-être le sien, le même envoi doit pouvoir repartir.
  const mineQuery = useQuery({
    queryKey: subscriptionKeys.mine,
    queryFn: fetchMySubscriptions,
    enabled: !!user?.email && !isStaffAccount,
  });
  const toPay = !uncertain && !created ? (mineQuery.data || EMPTY_LIST).find(s => s.status === 'pending') || null : null;
  const barberDefaulted = useRef(false);
  useEffect(() => {
    if (barberDefaulted.current || employees.length === 0) return;
    const fromLink = barberParam ? employees.find(e => String(e.id) === String(barberParam)) : null;
    if (!fromLink && myAppointmentsQuery.isPending && myAppointmentsQuery.fetchStatus === 'fetching') return;
    barberDefaulted.current = true;
    const emp = fromLink || usualBarber;
    if (emp) setFirst(prev => (prev.employee ? prev : { ...prev, employee: emp }));
  }, [employees, barberParam, usualBarber, myAppointmentsQuery.isPending, myAppointmentsQuery.fetchStatus]);

  // Les 3 suivants, une fois toutes leurs semaines lues (jamais une journée qui paraîtrait libre)
  const proposalsReady = proposalWeeks.length > 0 && proposalWeeks.every(k => slotData.weekState(k) === 'ready');
  const proposalsFailed = step === 'lines' && !lines && proposalWeeks.some(k => slotData.weekState(k) === 'failed')
    ? proposalWeeks.map(k => slotData.failedQuery(k)).find(Boolean)
    : null;
  useEffect(() => {
    if (step !== 'lines' || lines || !first.time || !proposalsReady || !plan) return;
    const employee = employees.find(e => String(e.id) === String(first.employee.id)) || first.employee;
    const next = proposeNextSlots({
      first: { date: first.date, time: first.time },
      employee,
      rows: slotData.rows,
      timeOffs: slotData.timeOffs,
      privateEvents: slotData.privateRows,
      duration: plan.duration,
    });
    setLines([
      { employee, date: first.date, time: first.time, note: null },
      ...next.map((n, i) => ({ ...n, employee, wantedDate: addDaysKey(first.date, 7 * (i + 1)), wantedTime: first.time })),
    ]);
  }, [step, lines, first.time, proposalsReady, plan?.service_id]);

  const propose = () => {
    // Même premier RDV qu'à la proposition précédente : les changements faits sont gardés
    const same = lines && lines[0]?.date === first.date && lines[0]?.time === first.time
      && String(lines[0]?.employee?.id) === String(first.employee?.id);
    if (!same) setLines(null);
    go('lines');
  };

  const openEdit = (index) => {
    const line = lines[index];
    setDraft({ employee: line.employee, date: line.date, time: line.time });
    go('edit', { aboEdit: index });
  };

  // « Changer » : ce RDV à sa nouvelle place, écart contrôlé avant d'envoyer (`slotsIssue`)
  const others = step === 'edit' ? lines.filter((l, i) => i !== editIndex && !!l.time) : EMPTY_LIST;
  const editIssue = step === 'edit' && draft?.date ? slotsIssue([...others, { date: draft.date }]) : null;
  const applyEdit = () => {
    const next = lines
      .map((l, i) => (i === editIndex ? { employee: draft.employee, date: draft.date, time: draft.time, note: null } : l))
      .sort(byWhen);
    setLines(next);
    setLinesNotice(null);
    if (next[0].time) setFirst({ employee: next[0].employee, date: next[0].date, time: next[0].time });
    hapticFeedback();
    navigate(-1);
  };

  const linesIssue = linesComplete ? slotsIssue(lines) : null;

  const send = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      if (isStaffAccount) throw new Error('Les comptes de l\'équipe réservent depuis l\'agenda.');
      // Appareil hors connexion : rien ne part, ce n'est pas une réponse perdue
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw Object.assign(new Error('Pas de connexion internet : vos rendez-vous n\'ont pas été envoyés. Touchez de nouveau « Réserver mes 4 RDV » une fois connecté.'), { offline: true });
      }
      return createSubscription({
        serviceId: plan.service_id,
        requestKey: requestKey.current,
        slots: lines.map(l => ({ employeeId: l.employee.id, date: l.date, time: l.time })),
      });
    },
    onSuccess: (data) => {
      const subscription = data?.subscription || null;
      hapticFeedback();
      // Last Minute repris par ces rendez-vous : retirés de l'accueil avant l'invalidation
      for (const visit of subscription?.appointments || []) forgetBookedLastMinute(queryClient, visit);
      invalidateSubscriptionQueries(queryClient);
      if (!mountedRef.current) {
        toast.success('Vos 4 RDV sont réservés : il reste à régler l\'abonnement au salon.', {
          duration: 10000,
          action: { label: 'Voir', onClick: () => navigate('/appointments') },
        });
        return;
      }
      setUncertain(false);
      setSendError(null);
      setCreated(subscription);
      // L'entrée du récapitulatif est remplacée : un retour ne rouvre pas un envoi déjà fait
      navigate(`${location.pathname}${location.search}`, { replace: true, state: { aboStep: 'done' } });
    },
    onError: (err) => {
      if (err?.offline) { toast.error(err.message, { duration: 8000 }); return; }
      const lost = isNetworkError(err) || !!err?.timeout;
      // Page quittée pendant l'envoi : le message, jamais un retour forcé sur le parcours
      if (!mountedRef.current) {
        toast.error(lost
          ? 'Connexion perdue : vos rendez-vous ont peut-être été enregistrés. Vérifiez Mes rendez-vous.'
          : friendlyError(err, 'Réservation impossible pour le moment. Réessayez dans un instant.'), { duration: 10000 });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      // Réseau coupé pendant l'envoi : l'abonnement a peut-être été créé. On reste ici, la même clé
      // d'essai le rend tel quel. Les créneaux ne sont pas relus (ils contiendraient ses propres RDV).
      if (lost) {
        setUncertain(true);
        toast.error('Connexion perdue : vos rendez-vous ont peut-être été enregistrés. Touchez de nouveau « Réserver mes 4 RDV » : ils ne seront pas créés deux fois.', { duration: 10000 });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      setUncertain(false);
      const message = friendlyError(err, 'Réservation impossible pour le moment. Réessayez dans un instant.');
      const code = err?.data?.code;
      if (code === 'slot_unavailable' || code === 'slots_too_close' || code === 'slots_too_far' || code === 'invalid_slots') {
        // Refus d'un créneau, en 409 (pris) comme en 400 (passé, horaires, fermeture) : retour à
        // l'étape 2, créneaux relus. La ligne visée est signalée et à choisir de nouveau, avec le
        // message du serveur ; sans ligne visée, le message en tête de l'étape.
        queryClient.resetQueries({ queryKey: ['appointments-day'] });
        queryClient.resetQueries({ queryKey: ['privateEvents'] });
        const byValue = lines.findIndex(l => l.date === err.data.date && l.time === err.data.start_time);
        const slot = err.data.slot;
        const at = byValue >= 0 ? byValue : (code === 'slot_unavailable' && Number.isInteger(slot) ? slot : -1);
        if (at >= 0 && lines[at]) setLines(lines.map((l, i) => (i === at ? { ...l, time: null, note: 'taken', noteText: message } : l)));
        else setLinesNotice(message);
        toast.error(message);
        // Déjà revenu à l'étape 2 pendant l'envoi : ne pas reculer d'une étape de plus
        if (stepRef.current === 'recap') navigate(-1);
        return;
      }
      if (code === 'too_many_upcoming' || code === 'pending_exists') {
        setSendError({ message, link: true });
        queryClient.invalidateQueries({ queryKey: ['myAppointments'] });
        return;
      }
      if (code === 'plan_not_found') queryClient.invalidateQueries({ queryKey: subscriptionKeys.plans });
      if (code === 'disabled') queryClient.invalidateQueries({ queryKey: subscriptionKeys.feature });
      setSendError({ message, link: false });
    },
  });

  // Retour depuis l'écran de succès : Mes rendez-vous, jamais un récapitulatif déjà envoyé
  const leave = () => navigate('/appointments', { replace: true });
  useEffect(() => {
    if (created && navigationType === 'POP') leave();
  }, [location.key]);

  // Bouton retour d'Android : même chose que le retour de l'écran
  const inFlow = !!plan && step !== 'first' && !created;
  useAndroidBack(inFlow && !send.isPending, back);
  useAndroidBack(send.isPending, () => {});
  useAndroidBack(!!created, leave);

  // ─── Rendu ───
  if (created) {
    return (
      <>
        <SubscriptionSuccess subscription={created} />
        <BarBackdrop />
        <BookingBar actionLabel="Voir mes rendez-vous" onAction={() => { hapticFeedback(); navigate('/appointments', { replace: true }); }} />
      </>
    );
  }
  // Écran de succès rechargé, ou retrouvé par l'historique : l'envoi est fait, jamais un écran vide
  if (rawStep === 'done') return <Navigate to="/appointments" replace />;

  if (plansQuery.isPending && plansQuery.fetchStatus !== 'paused') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement des abonnements">
        {[0, 1, 2].map(i => <div key={i} className="h-[72px] rounded-2xl bg-card border border-border animate-pulse" />)}
      </div>
    );
  }
  if (queryFailed(plansQuery)) {
    return <LoadError what="les abonnements" error={plansQuery.error} onRetry={plansQuery.refetch} retrying={plansQuery.isFetching} />;
  }
  if (plans.length === 0) {
    return (
      <div className="space-y-4">
        <StepHeader title="Abonnements" onBack={back} />
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Aucun abonnement n'est proposé pour le moment.</p>
          <Link to="/services" className="mt-3 inline-flex items-center min-h-[44px] px-4 text-sm font-semibold text-primary">Voir les prestations</Link>
        </div>
      </div>
    );
  }

  // Abonnement déjà à régler : prévenu tout de suite, le parcours ne va pas plus loin
  const toPayNotice = toPay && (
    <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-amber-200 break-words">
      Vous avez déjà un abonnement à régler au salon ({toPay.service_name}, {formatPrice(toPay.price)}) : réglez-le avant d'en prendre un autre.{' '}
      <Link to="/appointments" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Voir mes rendez-vous</Link>
    </div>
  );

  // Sans formule dans l'adresse (ou formule retirée) : le choix de la formule
  if (!plan) {
    return (
      <>
        <PlanChoice
          plans={plans}
          selectedId={chosenPlan?.service_id}
          onSelect={(p) => setChosenId(p.service_id)}
          onBack={() => navigate('/services')}
          missing={!!serviceId}
          notice={toPayNotice}
        />
        <BarBackdrop />
        {chosenPlan && (
          <BookingBar
            title={formatPrice(chosenPlan.price)}
            subtitle={chosenPlan.name}
            actionLabel="Choisir mes 4 RDV"
            onAction={() => { hapticFeedback(); navigate(`/abonnement?service=${encodeURIComponent(chosenPlan.service_id)}`); }}
            disabled={!!toPay}
          />
        )}
      </>
    );
  }

  const appear = reduceMotion ? false : { opacity: 0, y: 6 };
  const barber = first.employee?.name;
  const chosenCount = lines ? lines.filter(l => !!l.time).length : SUBSCRIPTION_VISITS;
  const staffNotice = isStaffAccount && (
    <div role="status" className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-xs leading-relaxed text-amber-200/90 break-words">
      Les comptes de l'équipe réservent depuis l'agenda.{' '}
      <Link to="/admin/agenda" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Ouvrir l'agenda</Link>
    </div>
  );

  const draftReady = !!draft?.time && !!draft?.date && !!draft?.employee;
  const barProps = {
    first: {
      stacked: true,
      title: first.time && first.date && barber ? `${dayLabel(first.date)} à ${first.time} avec ${barber}` : 'Choisissez une heure',
      actionLabel: 'Proposer les 3 suivants',
      onAction: propose,
      disabled: !first.time || !first.date || !first.employee || !!toPay,
    },
    lines: {
      actionLabel: 'Continuer',
      onAction: () => { setLinesNotice(null); go('recap'); },
      disabled: !barArmed || !linesComplete || !!linesIssue,
    },
    edit: {
      stacked: true,
      title: draftReady ? `${dayLabel(draft.date)} à ${draft.time} avec ${draft.employee.name}` : 'Choisissez une heure',
      actionLabel: 'Garder ce créneau',
      icon: Check,
      onAction: applyEdit,
      disabled: !draftReady || !!editIssue,
    },
    recap: {
      actionLabel: send.isPending ? 'Réservation…' : 'Réserver mes 4 RDV',
      icon: Check,
      onAction: () => { hapticFeedback(); setSendError(null); send.mutate(); },
      disabled: !barArmed || send.isPending || isStaffAccount || !!toPay,
    },
  }[step];

  return (
    <>
      <motion.div key={step} initial={appear} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
        {step === 'first' && (
          <>
            <StepHeader title="Votre premier RDV" subtitle={`${plan.name} · ${formatPrice(plan.price)}`} onBack={back} />
            <VisitProgress done={1} label="Rendez-vous 1 sur 4" caption="RDV 1 sur 4" />
            {staffNotice}
            {toPayNotice}
            <SlotPicker
              duration={plan.duration}
              value={first}
              onChange={setFirst}
              usualId={usualBarber?.id}
            />
          </>
        )}

        {step === 'lines' && (
          <>
            <StepHeader
              title="Vos 4 rendez-vous"
              subtitle={lines && new Set(lines.map(l => String(l.employee?.id))).size > 1 ? plan.name : `${plan.name}${barber ? ` · avec ${barber}` : ''}`}
              onBack={back}
            />
            <VisitProgress done={chosenCount} label={`${chosenCount} rendez-vous sur 4 choisis`} />
            {lines ? (
              <ProposedVisits lines={lines} onChange={openEdit} issue={linesIssue ? ISSUE_TEXT[linesIssue] : null} notice={linesNotice} />
            ) : proposalsFailed ? (
              <LoadError what="les créneaux" error={proposalsFailed.error} onRetry={() => slotData.retry(proposalWeeks)} retrying={slotData.retrying} compact />
            ) : (
              <div className="space-y-2.5" aria-busy="true" aria-label="Recherche de vos créneaux">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-[62px] rounded-2xl bg-card border border-border animate-pulse" />)}
              </div>
            )}
          </>
        )}

        {step === 'edit' && draft && (
          <>
            <StepHeader title={`Changer le rendez-vous ${editIndex + 1}`} subtitle={`${plan.name} · ${perVisit(plan)}`} onBack={back} />
            <SlotPicker
              duration={plan.duration}
              value={draft}
              onChange={setDraft}
              usualId={usualBarber?.id}
              notice={editIssue && (
                <p role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-amber-200">
                  {ISSUE_TEXT[editIssue]}
                </p>
              )}
            />
          </>
        )}

        {step === 'recap' && (
          <>
            <StepHeader title="Votre abonnement" onBack={back} backDisabled={send.isPending} />
            {staffNotice}
            {toPayNotice}
            {uncertain && (
              <div role="status" className="rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-[13px] leading-relaxed text-foreground/90 break-words">
                Connexion perdue pendant l'envoi : touchez de nouveau « Réserver mes 4 RDV », ils ne seront pas créés deux fois. Ou vérifiez{' '}
                <Link to="/appointments" className="font-semibold text-primary underline underline-offset-2 whitespace-nowrap">Mes rendez-vous</Link>.
              </div>
            )}
            <SubscriptionRecap
              plan={plan}
              lines={lines}
              error={sendError}
              onEditPlan={() => { hapticFeedback(); navigate('/abonnement'); }}
            />
          </>
        )}
      </motion.div>

      <BarBackdrop />
      {/* Une seule barre, qui change de contenu d'une étape à l'autre, toujours en place : jamais deux
          barres à l'écran, et jamais une barre encore en train de monter sous celle de la navigation */}
      <BookingBar {...barProps} />
    </>
  );
}
