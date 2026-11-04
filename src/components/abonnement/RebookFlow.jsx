/**
 * `/abonnement?reprendre=<id>` : un seul RDV à choisir après une annulation ou une absence (barber,
 * jour, heure), `rebookVisit`, succès puis retour à la carte. Le serveur revérifie tout.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import BookingBar from '@/components/booking/BookingBar';
import LoadError, { friendlyError, isNetworkError, queryFailed } from '@/components/shared/LoadError';
import { formatDuration } from '@/components/services/serviceUtils';
import { hapticFeedback } from '@/lib/capacitor';
import { fetchMySubscriptions, invalidateSubscriptionQueries, rebookVisit, subscriptionKeys, visitsWord } from '@/lib/subscriptions';
import { forgetBookedLastMinute } from '@/lib/lastMinute';
import { useAndroidBack } from '@/lib/useAndroidBack';
import SlotPicker from './SlotPicker';
import StepHeader from './StepHeader';
import { SuccessHeading, VisitCalendar } from './SubscriptionSuccess';
import { dayLabel, dayName, visitLabel } from './visitLabels';

/** Fond plein sous la barre et la barre du bas (le contenu ne transparaît pas entre les deux). */
export function BarBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="booking-bar fixed inset-x-0 bottom-0 z-30 pointer-events-none h-[calc(12rem+env(safe-area-inset-bottom,0px))]"
      style={{ background: 'linear-gradient(to top, hsl(var(--background)) 72%, hsl(var(--background) / 0))' }}
    />
  );
}

/** Pourquoi aucun RDV ne peut être repris, selon l'abonnement relu au serveur ; null : on peut. */
function blockOf(subscription) {
  if (!subscription) return { title: 'Abonnement introuvable', text: 'Cet abonnement n\'est pas sur votre compte.' };
  if (subscription.status === 'cancelled') return { title: 'Cet abonnement est fermé', text: 'Il n\'y a plus de coupe à reprendre dessus.', renew: true };
  if (subscription.outdated) {
    return {
      title: 'Vos coupes ne sont plus valables',
      text: subscription.valid_until ? `Elles l'étaient jusqu'au ${dayName(subscription.valid_until)}.` : 'Leur date de validité est dépassée.',
      renew: true,
    };
  }
  if (subscription.visits_left <= 0) return { title: 'Cet abonnement est terminé', text: 'Toutes ses coupes ont été utilisées.', renew: true };
  if (subscription.to_rebook <= 0) return { title: 'Tous vos rendez-vous sont déjà réservés', text: 'Aucune coupe à reprogrammer pour le moment.', appointments: true };
  return null;
}

function Blocked({ block, subscription }) {
  return (
    <div role="status" className="rounded-2xl border border-border bg-card p-6 text-center">
      <p className="text-sm font-semibold text-foreground">{block.title}</p>
      <p className="mt-2 text-[13px] text-muted-foreground">{block.text}</p>
      {block.renew && (
        <Link
          to={`/abonnement?service=${encodeURIComponent(subscription.service_id)}`}
          className="mt-4 min-h-[44px] flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Reprendre un abonnement
        </Link>
      )}
      <Link
        to={block.appointments ? '/appointments' : '/gift-cards'}
        className="mt-1 min-h-[44px] flex items-center justify-center text-[13px] font-semibold text-primary underline underline-offset-2"
      >
        {block.appointments ? 'Voir mes rendez-vous' : 'Voir mes cartes'}
      </Link>
    </div>
  );
}

export default function RebookFlow({ id }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ employee: null, date: null, time: null });
  const [uncertain, setUncertain] = useState(false);
  const [done, setDone] = useState(null);
  const [refusal, setRefusal] = useState(null);
  // Page quittée pendant l'envoi : un simple message (les rappels de l'envoi tournent quand même)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const subsQuery = useQuery({ queryKey: subscriptionKeys.mine, queryFn: fetchMySubscriptions });
  const subscription = useMemo(
    () => (subsQuery.data || []).find(s => String(s.id) === String(id)) || null,
    [subsQuery.data, id],
  );

  // Barber proposé d'office : celui du dernier RDV de cet abonnement
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !subscription) return;
    defaulted.current = true;
    const last = [...(subscription.appointments || [])].pop();
    if (last?.employee_id != null) setDraft(d => ({ ...d, employee: { id: last.employee_id, name: last.employee_name } }));
  }, [subscription]);

  const send = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw Object.assign(new Error('Pas de connexion internet : le rendez-vous n\'a pas été envoyé. Réessayez une fois connecté.'), { offline: true });
      }
      return rebookVisit(id, { employeeId: draft.employee.id, date: draft.date, time: draft.time });
    },
    onSuccess: (data) => {
      const view = data?.subscription || subscription;
      const visit = (view?.appointments || []).find(a => a.date === draft.date && a.start_time === draft.time) || null;
      hapticFeedback();
      setUncertain(false);
      setRefusal(null);
      if (visit) forgetBookedLastMinute(queryClient, visit);
      invalidateSubscriptionQueries(queryClient);
      if (!mountedRef.current) {
        toast.success('Votre RDV est réservé.', { action: { label: 'Voir', onClick: () => navigate('/appointments') } });
        return;
      }
      setDone({ subscription: view, visit });
    },
    onError: (err) => {
      if (err?.offline) { toast.error(err.message, { duration: 8000 }); return; }
      const lost = isNetworkError(err) || !!err?.timeout;
      if (!mountedRef.current) {
        toast.error(lost
          ? 'Connexion perdue : votre rendez-vous a peut-être été enregistré. Vérifiez Mes rendez-vous.'
          : friendlyError(err, 'Réservation impossible pour le moment. Réessayez dans un instant.'), { duration: 10000 });
        return;
      }
      // Réponse perdue : le RDV a peut-être été créé, le même créneau renvoyé est reconnu par le
      // serveur. Les créneaux ne sont pas relus ici (ils contiendraient son propre RDV).
      if (lost) {
        setUncertain(true);
        toast.error('Connexion perdue : votre rendez-vous a peut-être été enregistré. Touchez de nouveau « Réserver ce RDV » : il ne sera pas créé deux fois.', { duration: 10000 });
        return;
      }
      setUncertain(false);
      const message = friendlyError(err, 'Réservation impossible pour le moment. Réessayez dans un instant.');
      const code = err?.data?.code;
      if (code === 'slot_unavailable') {
        queryClient.resetQueries({ queryKey: ['appointments-day'] });
        queryClient.resetQueries({ queryKey: ['privateEvents'] });
        setDraft(d => ({ ...d, time: null }));
        toast.error(message);
        return;
      }
      if (code === 'disabled') {
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.feature });
      }
      if (code === 'no_visit_left' || code === 'subscription_cancelled' || code === 'subscription_not_found') {
        queryClient.invalidateQueries({ queryKey: subscriptionKeys.mine });
      }
      setRefusal(message);
    },
  });

  useAndroidBack(send.isPending, () => {});

  const goToCard = () => { hapticFeedback(); navigate('/gift-cards'); };

  if (done) {
    return (
      <>
        <div className="space-y-4">
          <SuccessHeading
            title="Votre RDV est réservé"
            subtitle={done.subscription ? `${done.subscription.service_name} · ${visitsWord(done.subscription.visits_left)} sur votre carte` : ''}
          />
          {done.visit && (
            <div className="rounded-2xl border border-border bg-card px-3.5 pt-2.5 pb-1">
              <p className="text-sm font-bold text-foreground break-words">{dayLabel(done.visit.date)} · {done.visit.start_time}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{visitLabel(done.visit.visit, done.subscription?.visits)} · {done.visit.employee_name}</p>
              <VisitCalendar appointment={done.visit} subscription={done.subscription} />
            </div>
          )}
        </div>
        <BarBackdrop />
        <BookingBar actionLabel="Retour à ma carte" onAction={goToCard} />
      </>
    );
  }

  const header = (
    <StepHeader
      title="Reprendre un RDV"
      subtitle={subscription ? `${subscription.service_name} · ${formatDuration(subscription.service_duration)}` : null}
      onBack={() => navigate('/gift-cards')}
      backDisabled={send.isPending}
    />
  );

  if (subsQuery.isPending && subsQuery.fetchStatus !== 'paused') {
    return <div className="space-y-4">{header}<div className="h-40 rounded-2xl bg-card border border-border animate-pulse" aria-busy="true" /></div>;
  }
  if (queryFailed(subsQuery)) {
    return (
      <div className="space-y-4">
        {header}
        <LoadError what="votre abonnement" error={subsQuery.error} onRetry={subsQuery.refetch} retrying={subsQuery.isFetching} />
      </div>
    );
  }
  const block = blockOf(subscription);
  if (block) {
    return (
      <div className="space-y-4">
        {header}
        <Blocked block={block} subscription={subscription} />
      </div>
    );
  }

  const ready = !!draft.employee && !!draft.date && !!draft.time;
  return (
    <>
      <div className="space-y-5">
        {header}
        <p className="text-sm leading-relaxed text-foreground/85">
          {subscription.to_rebook > 1
            ? `${subscription.to_rebook} coupes de votre abonnement n'ont plus de rendez-vous : choisissez-en un, vous pourrez reprendre les autres ensuite.`
            : 'Une coupe de votre abonnement n\'a plus de rendez-vous : choisissez-en un autre.'}
        </p>
        {refusal && (
          <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-relaxed text-amber-200 break-words">
            {refusal}
          </div>
        )}
        <SlotPicker
          duration={subscription.service_duration}
          value={draft}
          onChange={(next) => { setDraft(next); setRefusal(null); }}
          maxKey={subscription.valid_until}
          holdTime={uncertain}
        />
      </div>
      <BarBackdrop />
      <BookingBar
        stacked
        title={ready ? `${dayLabel(draft.date)} à ${draft.time} avec ${draft.employee.name}` : 'Choisissez une heure'}
        actionLabel={send.isPending ? 'Réservation…' : 'Réserver ce RDV'}
        onAction={() => send.mutate()}
        disabled={!ready || send.isPending}
      />
    </>
  );
}
