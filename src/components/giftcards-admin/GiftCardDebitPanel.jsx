import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Scissors, PenLine, CheckCircle2, AlertTriangle, Minus, Clock, ArrowRight } from 'lucide-react';
import { api } from '@/api/apiClient';
import LoadError, { isNetworkError } from '@/components/shared/LoadError';
import {
  giftCardBalance, formatEuro, round2, parisToday, giftCardState,
  debitGiftCard, friendlyGiftCardError, invalidateGiftCardQueries, patchGiftCardCache,
  fetchTodayAppointmentsToCash, giftCardTodayAppointmentsKey, closestAppointmentId, appointmentDue, appointmentGiftPaid,
  appointmentServicesLabel, closeAppointmentWithGiftCard, fetchGiftCard, newClientRef, runGiftCardUndo,
  appointmentPrice, DEBIT_NETWORK_MESSAGE,
} from '@/lib/giftCardDebit';

const lower = (v) => String(v || '').trim().toLowerCase();

/** Le RDV est-il celui du titulaire de la carte ? (même règle que l'historique) */
function makeIsOwner(card) {
  const owner = [lower(card?.recipient_email), lower(card?.sender_email), lower(card?.recipient_name), lower(card?.sender_name)].filter(Boolean);
  return (a) => owner.includes(lower(a?.client_email)) || owner.includes(lower(a?.client_name));
}

const MODES = [
  { key: 'appointments', label: 'RDV du jour', icon: CalendarClock },
  { key: 'services', label: 'Prestations', icon: Scissors },
  { key: 'free', label: 'Montant libre', icon: PenLine },
];

const agendaLink = (apt) => {
  const params = new URLSearchParams({ view: 'day', date: String(apt.date || '').slice(0, 10) });
  if (apt.employee_id != null) params.set('barber', String(apt.employee_id));
  return `/admin/agenda?${params.toString()}`;
};

function AppointmentRow({ apt, selected, highlighted, onSelect }) {
  const services = appointmentServicesLabel(apt);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="gc-apt-row"
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
        selected
          ? 'bg-primary/15 border-primary/50'
          : highlighted
            ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15'
            : 'bg-white/5 border-white/10 hover:bg-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
            <span className="font-mono">{String(apt.start_time || '').slice(0, 5)}</span>
            <span className="truncate">{apt.client_name || 'Client'}</span>
            {highlighted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold">
                <Clock className="w-3 h-3" /> Maintenant
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {apt.employee_name || 'Barber'}{services ? ` · ${services}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          {appointmentPrice(apt) > 0
            ? <p className="text-sm font-bold text-foreground whitespace-nowrap">{formatEuro(appointmentDue(apt))}</p>
            : <p className="text-[11px] font-semibold text-amber-300 whitespace-nowrap">sans prestation</p>}
        </div>
      </div>
      {appointmentGiftPaid(apt) > 0 && (
        <p className="mt-1 text-[10px] text-amber-300">
          {formatEuro(appointmentGiftPaid(apt))} déjà payés par carte · reste {formatEuro(appointmentDue(apt))}
        </p>
      )}
    </button>
  );
}

/**
 * Débit d'une carte validée : ce que la carte paie (RDV du jour à encaisser, prestations du
 * catalogue, montant libre), confirmation en deux taps, toast « Annuler », écran de succès.
 * `onCardChange(card)` reçoit la carte à jour après un débit ou une annulation ;
 * `onResultChange(bool)` dit au parent qu'un écran de succès est affiché (à garder même si la
 * carte n'est plus débitable).
 */
export default function GiftCardDebitPanel({ card, onCardChange, onResultChange, onDone }) {
  const queryClient = useQueryClient();
  const today = parisToday();
  const [mode, setMode] = useState('appointments');
  const [selectedAptId, setSelectedAptId] = useState(null);
  // « Prestations » / « Montant libre » : RDV du jour auquel rattacher le débit. Sans rattachement,
  // la somme compterait deux fois si le RDV était ensuite encaissé en CB / espèces. Trois états :
  // `undefined` = pas encore choisi (débit bloqué s'il y a des RDV du jour), `null` = « Pas de RDV
  // aujourd'hui » choisi volontairement, un id = ce RDV.
  const [attachAptId, setAttachAptId] = useState(undefined);
  const [selectedServiceIds, setSelectedServiceIds] = useState(() => new Set());
  const [freeAmount, setFreeAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [closeApt, setCloseApt] = useState(true);
  const [result, setResult] = useState(null);
  // « Annuler ce débit » de l'écran de succès : deux taps, un seul envoi à la fois
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const undoingRef = useRef(false);
  // Référence du débit (`client_ref`) : la même tant que l'admin retente le même débit (même
  // montant, même RDV, mêmes prestations, même mode) et qu'aucun débit n'a réussi
  const clientRefRef = useRef({ key: null, ref: null });
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => { onResultChange?.(!!result); }, [result, onResultChange]);

  const balance = giftCardBalance(card);

  const aptQuery = useQuery({
    queryKey: giftCardTodayAppointmentsKey(today),
    queryFn: () => fetchTodayAppointmentsToCash(today),
    staleTime: 30 * 1000,
  });
  const appointments = useMemo(() => aptQuery.data || [], [aptQuery.data]);
  const highlightedId = useMemo(() => closestAppointmentId(appointments), [appointments]);

  const servicesQuery = useQuery({
    queryKey: ['services'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.entities.Service.filter({ is_active: true }, 'sort_order', 100),
    enabled: mode === 'services',
  });
  const services = useMemo(() => servicesQuery.data || [], [servicesQuery.data]);

  const selectedApt = mode === 'appointments'
    ? appointments.find((a) => String(a.id) === String(selectedAptId)) || null
    : null;
  const selectedServices = mode === 'services' ? services.filter((s) => selectedServiceIds.has(String(s.id))) : [];

  let requested = 0;
  // RDV : le reste dû seulement (une part a pu être payée par une autre carte)
  const aptGiftPaid = selectedApt ? appointmentGiftPaid(selectedApt) : 0;
  if (mode === 'appointments') requested = selectedApt ? appointmentDue(selectedApt) : 0;
  else if (mode === 'services') requested = round2(selectedServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0));
  else requested = round2(Number(String(freeAmount).replace(',', '.')) || 0);

  const debit = round2(Math.min(requested, balance));
  const rest = round2(Math.max(0, requested - balance));
  const fullyCovered = requested > 0 && rest <= 0;

  const resetConfirm = () => setConfirming(false);

  const pickMode = (key) => { setMode(key); setAttachAptId(undefined); resetConfirm(); };
  const attachedApt = mode !== 'appointments' && attachAptId
    ? appointments.find((a) => String(a.id) === String(attachAptId)) || null
    : null;

  const isOwner = useMemo(() => makeIsOwner(card), [card]);
  const attachMode = mode === 'services' || mode === 'free';
  // Le titulaire de la carte a un seul RDV aujourd'hui : présélectionné (l'admin peut changer)
  useEffect(() => {
    if (!attachMode) return;
    // RDV choisi disparu de la liste relue (encaissé entre-temps) : le choix est à refaire
    if (attachAptId && !aptQuery.isPending && !appointments.some((a) => String(a.id) === String(attachAptId))) {
      setAttachAptId(undefined);
      return;
    }
    if (attachAptId !== undefined) return;
    const mine = appointments.filter(isOwner);
    if (mine.length === 1) setAttachAptId(mine[0].id);
  }, [attachMode, attachAptId, appointments, isOwner, aptQuery.isPending]);
  // Choix obligatoire tant que des RDV du jour existent ; liste encore en chargement : on attend
  const attachRequired = attachMode && appointments.length > 0 && attachAptId === undefined;
  const attachPending = attachMode && aptQuery.isPending;
  const attachNoPrice = !!attachedApt && appointmentPrice(attachedApt) <= 0;
  const attachOver = !!attachedApt && (attachNoPrice || debit > appointmentDue(attachedApt) + 0.005);
  const selectedNoPrice = !!selectedApt && appointmentPrice(selectedApt) <= 0;
  const blockReason = !(debit > 0) ? null
    : attachPending ? 'Chargement des RDV du jour…'
      : attachRequired ? 'Rattachez ce débit à un RDV ou choisissez “Pas de RDV aujourd\'hui”'
        : attachNoPrice ? 'Ce RDV n\'a pas encore de prestation'
          : attachOver ? 'Le débit dépasse le reste dû du RDV'
            : null;
  // Un blocage apparu pendant la confirmation (liste relue, RDV encaissé ailleurs) la referme
  useEffect(() => { if (blockReason) setConfirming(false); }, [blockReason]);

  const toggleService = (id) => {
    resetConfirm();
    setSelectedServiceIds((prev) => {
      const next = new Set(prev);
      const k = String(id);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const buildNote = () => {
    if (selectedApt) {
      const svc = appointmentServicesLabel(selectedApt);
      return `RDV de ${selectedApt.client_name || 'client'} à ${String(selectedApt.start_time || '').slice(0, 5)}`
        + `${selectedApt.employee_name ? ` (${selectedApt.employee_name})` : ''}${svc ? ` : ${svc}` : ''}`;
    }
    if (selectedServices.length) return selectedServices.map((s) => s.name).join(' + ');
    return 'Montant libre';
  };

  const runUndo = async (snapshot) => {
    if (undoingRef.current) return;
    undoingRef.current = true;
    if (mountedRef.current) setUndoing(true);
    try {
      const ok = await runGiftCardUndo({
        card: snapshot.card,
        transaction: snapshot.transaction,
        previousApt: snapshot.previousApt,
        queryClient,
        onCardChange,
      });
      if (ok && mountedRef.current) setResult((r) => (r ? { ...r, undone: true } : r));
    } finally {
      undoingRef.current = false;
      if (mountedRef.current) { setUndoing(false); setConfirmUndo(false); }
    }
  };

  const handleConfirm = async () => {
    if (sendingRef.current || !(debit > 0) || blockReason) return;
    sendingRef.current = true;
    setSending(true);
    const apt = selectedApt;
    const shouldClose = !!apt && fullyCovered && closeApt;
    // Montant demandé (et non débité) : relu après une réponse perdue, le solde baisse et le débit
    // recalculé changerait ; la même référence fait alors refuser un second débit (ref_mismatch)
    const refKey = [mode, requested, apt?.id ?? '', [...selectedServiceIds].sort().join(','), attachedApt?.id ?? ''].join('|');
    if (clientRefRef.current.key !== refKey || !clientRefRef.current.ref) {
      clientRefRef.current = { key: refKey, ref: newClientRef() };
    }
    try {
      const { card: fresh, transaction } = await debitGiftCard(card, {
        amount: debit,
        appointmentId: apt?.id ?? attachedApt?.id ?? null,
        services: selectedServices.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) || 0 })),
        note: buildNote(),
        clientRef: clientRefRef.current.ref,
      });
      // Débit fait : le prochain sera un autre débit (nouvelle référence)
      clientRefRef.current = { key: null, ref: null };
      // Avant la carte à jour : une carte épuisée n'est plus « débitable », le parent doit garder
      // ce panneau monté pour l'écran de succès (même lot de rendu)
      onResultChange?.(true);
      patchGiftCardCache(queryClient, fresh);
      onCardChange?.(fresh);
      invalidateGiftCardQueries(queryClient, card.id);

      let previousApt = null;
      let closeFailed = false;
      if (shouldClose) {
        try {
          previousApt = await closeAppointmentWithGiftCard(apt, card, debit, queryClient);
        } catch (err) {
          closeFailed = true;
          toast.warning(`Carte débitée, mais le RDV n'a pas pu être clôturé : ${friendlyGiftCardError(err)}. Faites-le dans l'agenda.`);
        }
      }
      queryClient.invalidateQueries({ queryKey: giftCardTodayAppointmentsKey(today) });

      const newBalance = giftCardBalance(fresh);
      const snapshot = { card: fresh, transaction, previousApt };
      toast.success(`${formatEuro(debit)} débités`, {
        description: newBalance > 0 ? `Nouveau solde : ${formatEuro(newBalance)}` : 'La carte est entièrement utilisée',
        duration: 10000,
        action: { label: 'Annuler', onClick: () => runUndo(snapshot) },
      });
      setResult({
        amount: debit,
        balance: newBalance,
        rest,
        apt: apt || attachedApt,
        // Débit hors RDV rattaché à un RDV du jour (reste dû du RDV après ce débit)
        attached: !apt && !!attachedApt,
        aptRest: !apt && attachedApt ? round2(Math.max(0, appointmentDue(attachedApt) - debit)) : 0,
        // Débit hors RDV alors que des RDV du jour existaient : rappel du rattachement après coup
        unattached: !apt && !attachedApt && attachMode && appointments.length > 0,
        closed: !!previousApt,
        closeFailed,
        snapshot,
      });
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      // Pas de réponse (réseau) : le débit est peut-être passé. Jamais « réessayez » ; la carte est
      // relue pour que le solde affiché et le montant recalculé partent du solde réel. Un nouvel
      // essai garde la même référence : le serveur ne débite pas deux fois.
      const noAnswer = isNetworkError(err) || (!err?.status && err?.name === 'TypeError');
      if (noAnswer) toast.error('Débit incertain', { description: DEBIT_NETWORK_MESSAGE, duration: 12000 });
      else toast.error('Débit impossible', { description: friendlyGiftCardError(err) });
      // RDV déjà encaissé ou déjà réglé par une autre carte : la liste du jour est relue, le RDV
      // désélectionné (son reste dû a changé)
      if (['appointment_already_paid', 'appointment_closed', 'appointment_no_price'].includes(err?.data?.code)) {
        queryClient.invalidateQueries({ queryKey: giftCardTodayAppointmentsKey(today) });
        setSelectedAptId(null);
        setAttachAptId(undefined);
      }
      // Refus (solde changé, carte annulée ou épuisée ailleurs) ou réponse perdue : carte relue
      if (noAnswer || err?.status === 409 || err?.local) {
        invalidateGiftCardQueries(queryClient, card.id);
        try {
          const fresh = await fetchGiftCard(card.id);
          if (fresh) {
            patchGiftCardCache(queryClient, fresh);
            onCardChange?.(fresh);
          }
        } catch { /* relecture au mieux : le toast suffit */ }
      }
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  const startOver = () => {
    setResult(null);
    setConfirmUndo(false);
    clientRefRef.current = { key: null, ref: null };
    setSelectedAptId(null);
    setAttachAptId(undefined);
    setSelectedServiceIds(new Set());
    setFreeAmount('');
    setCloseApt(true);
  };

  // ─── Écran de succès ───
  if (result) {
    const canContinue = giftCardState(card) === 'debitable' && !result.undone;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-green-500/25 bg-green-500/10 p-4 text-center"
        data-testid="gc-success"
      >
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          className="w-12 h-12 rounded-full bg-green-500 mx-auto flex items-center justify-center mb-2"
        >
          <CheckCircle2 className="w-6 h-6 text-white" />
        </motion.div>
        {result.undone ? (
          <p className="text-base font-bold text-foreground">Débit annulé</p>
        ) : (
          <>
            <p className="text-lg font-black text-foreground">{formatEuro(result.amount)} débités</p>
            <p className="text-sm text-muted-foreground">
              Nouveau solde : <span className="font-semibold text-foreground">{formatEuro(result.balance)}</span>
              {result.balance <= 0 && ' · carte entièrement utilisée'}
            </p>
            {result.rest > 0 && (
              <p className="mt-2 text-sm font-semibold text-amber-300" data-testid="gc-success-rest">
                Reste {formatEuro(result.rest)} à régler au comptoir
              </p>
            )}
            {result.apt && result.closed && (
              <p className="mt-2 text-xs text-green-300">RDV de {result.apt.client_name || 'ce client'} clôturé (payé par carte cadeau).</p>
            )}
            {result.apt && result.attached && (
              <div className="mt-2 text-xs text-muted-foreground" data-testid="gc-success-attached">
                Débit rattaché au RDV de {result.apt.client_name || 'ce client'}
                {result.apt.start_time ? ` (${String(result.apt.start_time).slice(0, 5)})` : ''}.{' '}
                {result.aptRest > 0
                  ? <>Clôturez-le dans l'agenda : seuls les {formatEuro(result.aptRest)} restants compteront en CB / espèces.</>
                  : <>Il est entièrement payé par carte : clôturez-le dans l'agenda avec « Carte cadeau ».</>}
                <Link to={agendaLink(result.apt)} className="mt-1 flex items-center justify-center gap-1 font-semibold text-primary">
                  Ouvrir l'agenda <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
            {result.unattached && (
              <p className="mt-2 text-xs text-amber-300" data-testid="gc-success-unattached">
                Débit non rattaché : historique de la carte → « Rattacher à un RDV » si ce client est encaissé dans l'agenda.
              </p>
            )}
            {result.apt && !result.attached && !result.closed && (
              <div className="mt-2 text-xs text-muted-foreground">
                {result.rest > 0
                  ? <>Reste {formatEuro(result.rest)} : clôturez le RDV dans l'agenda avec le moyen de paiement du reste ; seuls ces {formatEuro(result.rest)} compteront en CB / espèces.</>
                  : <>Le RDV n'a pas été clôturé : faites-le dans l'agenda.</>}
                <Link to={agendaLink(result.apt)} className="mt-1 flex items-center justify-center gap-1 font-semibold text-primary">
                  Ouvrir l'agenda <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </>
        )}
        {/* Débit erroné : annulable ici (le serveur l'accepte 24 h, l'historique aussi) */}
        {!result.undone && result.snapshot?.transaction?.id && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {!confirmUndo ? (
              <button type="button" onClick={() => setConfirmUndo(true)} disabled={undoing}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 disabled:opacity-50">
                Annuler ce débit
              </button>
            ) : (
              <>
                <button type="button" onClick={() => runUndo(result.snapshot)} disabled={undoing}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60">
                  {undoing ? 'Annulation…' : "Confirmer l'annulation"}
                </button>
                <button type="button" onClick={() => setConfirmUndo(false)} disabled={undoing}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50">
                  Non
                </button>
              </>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {canContinue && (
            <button type="button" onClick={startOver} className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10">
              Autre débit
            </button>
          )}
          <button type="button" onClick={onDone} className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground">
            Terminer
          </button>
        </div>
      </motion.div>
    );
  }

  // ─── Choix du montant ───
  return (
    <div className="space-y-3" data-testid="gc-debit-panel">
      <p className="text-xs font-semibold text-foreground">Que paie-t-on ?</p>
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white/5 border border-white/10 p-1">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => pickMode(key)}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-semibold transition-colors ${
              mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'appointments' && (
        <div className="space-y-1.5">
          {aptQuery.isPending ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : aptQuery.isError && !aptQuery.data ? (
            <LoadError compact what="les rendez-vous du jour" error={aptQuery.error} onRetry={aptQuery.refetch} retrying={aptQuery.isFetching} />
          ) : appointments.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-xl bg-white/5 border border-white/10 px-3 py-3">
              Aucun rendez-vous à encaisser aujourd'hui. Choisissez les prestations ou un montant libre.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">Rendez-vous d'aujourd'hui pas encore encaissés</p>
              {appointments.map((apt) => (
                <AppointmentRow
                  key={apt.id}
                  apt={apt}
                  selected={String(apt.id) === String(selectedAptId)}
                  highlighted={String(apt.id) === String(highlightedId)}
                  onSelect={() => { setSelectedAptId(apt.id); resetConfirm(); }}
                />
              ))}
              {selectedNoPrice && (
                <p className="text-[11px] text-amber-300 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2" data-testid="gc-apt-noprice">
                  Ce RDV n'a pas encore de prestation : choisissez-la dans l'agenda (Modifier) avant de le payer par carte.{' '}
                  <Link to={agendaLink(selectedApt)} className="font-semibold text-primary whitespace-nowrap">Ouvrir l'agenda</Link>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Débit hors RDV alors que des clients ont rendez-vous aujourd'hui : choix obligatoire
          (la part carte est portée sur le RDV ; sans lui, le tableau de bord la compterait deux fois) */}
      {attachMode && appointments.length > 0 && (
        <div className={`rounded-xl border p-2.5 space-y-1.5 min-w-0 ${attachRequired ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10 bg-white/5'}`} data-testid="gc-attach-today">
          <p className="text-[11px] font-semibold text-foreground">Ce débit paie-t-il un RDV du jour ?</p>
          <div className="flex flex-wrap gap-1.5">
            {appointments.map((a) => {
              const mine = isOwner(a);
              const noPrice = appointmentPrice(a) <= 0;
              return (
                <button key={a.id} type="button" onClick={() => { setAttachAptId(a.id); resetConfirm(); }}
                  data-testid="gc-attach-apt"
                  aria-pressed={String(attachAptId) === String(a.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] border text-left break-words max-w-full ${String(attachAptId) === String(a.id) ? 'bg-primary/15 border-primary/50 text-foreground' : 'bg-white/5 border-white/10 text-muted-foreground'}`}>
                  {String(a.start_time || '').slice(0, 5)} · {a.client_name || 'Client'} · {noPrice ? 'sans prestation' : `reste ${formatEuro(appointmentDue(a))}`}
                  {mine && <span className="ml-1 font-semibold text-primary">· titulaire de la carte</span>}
                </button>
              );
            })}
            <button type="button" onClick={() => { setAttachAptId(null); resetConfirm(); }}
              data-testid="gc-attach-none"
              aria-pressed={attachAptId === null}
              className={`px-2.5 py-1 rounded-lg text-[11px] border ${attachAptId === null ? 'bg-primary/15 border-primary/50 text-foreground' : 'bg-white/5 border-white/10 text-muted-foreground'}`}>
              Pas de RDV aujourd'hui
            </button>
          </div>
          {attachNoPrice && (
            <p className="text-[11px] text-amber-300" data-testid="gc-attach-noprice">
              Ce RDV n'a pas encore de prestation : choisissez-la dans l'agenda (Modifier) avant de le payer par carte.{' '}
              <Link to={agendaLink(attachedApt)} className="font-semibold text-primary whitespace-nowrap">Ouvrir l'agenda</Link>
            </p>
          )}
          {attachedApt && !attachNoPrice && debit > appointmentDue(attachedApt) + 0.005 && (
            <p className="text-[11px] text-amber-300">Le débit dépasse le reste dû de ce RDV ({formatEuro(appointmentDue(attachedApt))}) : le serveur le refuserait. Réduisez le montant ou choisissez un autre RDV.</p>
          )}
          {attachAptId === null && (
            <p className="text-[11px] text-amber-300" data-testid="gc-attach-warning">
              Sans rattachement, si ce client est ensuite encaissé en CB ou en espèces pour son RDV, le tableau de bord comptera {debit > 0 ? `ces ${formatEuro(debit)}` : 'cette somme'} deux fois.
            </p>
          )}
        </div>
      )}

      {mode === 'services' && (
        servicesQuery.isPending ? (
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-24 rounded-full bg-white/5 animate-pulse" />)}
          </div>
        ) : servicesQuery.isError && !servicesQuery.data ? (
          <LoadError compact what="les prestations" error={servicesQuery.error} onRetry={servicesQuery.refetch} retrying={servicesQuery.isFetching} />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {services.map((s) => {
              const on = selectedServiceIds.has(String(s.id));
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    on ? 'bg-primary text-primary-foreground border-primary' : 'bg-white/5 border-white/10 text-foreground hover:bg-white/10'
                  }`}
                >
                  {s.name} · {formatEuro(s.price)}
                </button>
              );
            })}
            {services.length === 0 && <p className="text-xs text-muted-foreground">Aucune prestation active.</p>}
          </div>
        )
      )}

      {mode === 'free' && (
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={freeAmount}
            onChange={(e) => { setFreeAmount(e.target.value); resetConfirm(); }}
            placeholder="Montant à débiter..."
            min="0.01"
            step="0.01"
            className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="button"
            onClick={() => { setFreeAmount(String(balance)); resetConfirm(); }}
            className="shrink-0 px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:bg-white/10"
          >
            Tout
          </button>
        </div>
      )}

      {/* Récapitulatif */}
      {requested > 0 && (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-sm" data-testid="gc-recap">
          {aptGiftPaid > 0 && (
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Déjà payé par carte</span><span className="text-amber-300">{formatEuro(aptGiftPaid)}</span></div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">{aptGiftPaid > 0 ? 'Reste à payer' : 'À payer'}</span><span className="font-semibold">{formatEuro(requested)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Débité de la carte</span><span className="font-bold text-primary">{formatEuro(debit)}</span></div>
          {rest > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300 pt-1" data-testid="gc-rest">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>La carte couvre {formatEuro(debit)}, reste {formatEuro(rest)} à régler au comptoir.</span>
            </p>
          )}
          {selectedApt && fullyCovered && (
            <label className="flex items-start gap-2 pt-1 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={closeApt}
                onChange={(e) => setCloseApt(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[hsl(var(--primary))]"
                data-testid="gc-close-apt"
              />
              <span>Clôturer le RDV de {selectedApt.client_name || 'ce client'} (payé par carte cadeau)</span>
            </label>
          )}
          {selectedApt && rest > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Reste {formatEuro(rest)} : clôturez le RDV dans l'agenda avec le moyen de paiement du reste ; seuls ces {formatEuro(rest)} compteront en CB / espèces.{' '}
              <Link to={agendaLink(selectedApt)} className="font-semibold text-primary whitespace-nowrap">Ouvrir l'agenda</Link>
            </p>
          )}
        </div>
      )}

      {/* Débit en deux taps */}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!(debit > 0) || !!blockReason}
          data-testid="gc-debit"
          className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Minus className="w-4 h-4 shrink-0" />
          {blockReason
            ? <span className="min-w-0 text-center text-xs leading-snug">{blockReason}</span>
            : (
              <span className="truncate">
                {debit > 0 ? `Débiter ${formatEuro(debit)} de la carte ${card.code}`
                  : selectedNoPrice ? 'Ajoutez d\'abord une prestation au RDV' : 'Choisissez ce que paie la carte'}
              </span>
            )}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={sending}
            className="flex-1 py-3 rounded-2xl text-sm font-medium text-muted-foreground bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={sending}
            data-testid="gc-confirm"
            className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            {sending ? 'Débit…' : `Confirmer ${formatEuro(debit)}`}
          </button>
        </div>
      )}
    </div>
  );
}
