import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CalendarClock, Scissors, PenLine, CheckCircle2, AlertTriangle, Minus, Clock, ArrowRight } from 'lucide-react';
import { api } from '@/api/apiClient';
import LoadError from '@/components/shared/LoadError';
import {
  giftCardBalance, formatEuro, round2, parisToday, giftCardState,
  debitGiftCard, undoGiftCardDebit, friendlyGiftCardError, invalidateGiftCardQueries, patchGiftCardCache,
  fetchTodayAppointmentsToCash, giftCardTodayAppointmentsKey, closestAppointmentId, appointmentPrice,
  appointmentServicesLabel, closeAppointmentWithGiftCard, reopenAppointment,
} from '@/lib/giftCardDebit';

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
        <p className="text-sm font-bold text-foreground shrink-0">{formatEuro(appointmentPrice(apt))}</p>
      </div>
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
  const [selectedServiceIds, setSelectedServiceIds] = useState(() => new Set());
  const [freeAmount, setFreeAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [closeApt, setCloseApt] = useState(true);
  const [result, setResult] = useState(null);
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
  if (mode === 'appointments') requested = selectedApt ? appointmentPrice(selectedApt) : 0;
  else if (mode === 'services') requested = round2(selectedServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0));
  else requested = round2(Number(String(freeAmount).replace(',', '.')) || 0);

  const debit = round2(Math.min(requested, balance));
  const rest = round2(Math.max(0, requested - balance));
  const fullyCovered = requested > 0 && rest <= 0;

  const resetConfirm = () => setConfirming(false);

  const pickMode = (key) => { setMode(key); resetConfirm(); };

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
    try {
      const fresh = await undoGiftCardDebit(snapshot.card, snapshot.transaction);
      if (snapshot.previousApt) {
        try {
          await reopenAppointment(snapshot.previousApt, queryClient);
        } catch (err) {
          toast.warning(`Solde remis, mais le RDV n'a pas pu être rouvert : ${friendlyGiftCardError(err)}`);
        }
      }
      if (fresh) {
        patchGiftCardCache(queryClient, fresh);
        onCardChange?.(fresh);
      }
      invalidateGiftCardQueries(queryClient, snapshot.card.id);
      queryClient.invalidateQueries({ queryKey: giftCardTodayAppointmentsKey(today) });
      toast.success('Débit annulé', { description: fresh ? `Solde remis à ${formatEuro(giftCardBalance(fresh))}` : undefined });
      if (mountedRef.current) setResult((r) => (r ? { ...r, undone: true } : r));
    } catch (err) {
      toast.error("Impossible d'annuler le débit", { description: friendlyGiftCardError(err) });
    }
  };

  const handleConfirm = async () => {
    if (sendingRef.current || !(debit > 0)) return;
    sendingRef.current = true;
    setSending(true);
    const apt = selectedApt;
    const shouldClose = !!apt && fullyCovered && closeApt;
    try {
      const { card: fresh, transaction } = await debitGiftCard(card, {
        amount: debit,
        appointmentId: apt?.id ?? null,
        services: selectedServices.map((s) => ({ id: s.id, name: s.name, price: Number(s.price) || 0 })),
        note: buildNote(),
      });
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
        apt,
        closed: !!previousApt,
        closeFailed,
      });
      setConfirming(false);
    } catch (err) {
      toast.error('Débit impossible', { description: friendlyGiftCardError(err) });
      setConfirming(false);
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  const startOver = () => {
    setResult(null);
    setSelectedAptId(null);
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
            {result.apt && !result.closed && (
              <div className="mt-2 text-xs text-muted-foreground">
                {result.rest > 0
                  ? <>Reste {formatEuro(result.rest)} : clôturez le RDV dans l'agenda avec le moyen de paiement du reste.</>
                  : <>Le RDV n'a pas été clôturé : faites-le dans l'agenda.</>}
                <Link to={agendaLink(result.apt)} className="mt-1 flex items-center justify-center gap-1 font-semibold text-primary">
                  Ouvrir l'agenda <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </>
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
            </>
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
          <div className="flex justify-between"><span className="text-muted-foreground">À payer</span><span className="font-semibold">{formatEuro(requested)}</span></div>
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
              Reste {formatEuro(rest)} : clôturez le RDV dans l'agenda avec le moyen de paiement du reste.{' '}
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
          disabled={!(debit > 0)}
          data-testid="gc-debit"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Minus className="w-4 h-4 shrink-0" />
          <span className="truncate">{debit > 0 ? `Débiter ${formatEuro(debit)} de la carte ${card.code}` : 'Choisissez ce que paie la carte'}</span>
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
