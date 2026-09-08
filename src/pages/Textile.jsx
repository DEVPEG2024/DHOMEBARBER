import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Shirt, Flame, RefreshCw, ChevronDown, ChevronUp, Bell, BellRing, Clock, Lock, Users, Sparkles, AlertTriangle } from 'lucide-react';
import { dropPhase, msUntilOpen, formatDropDate } from '@/lib/textileApi';
import { useTextileOverview, useTextileActions } from '@/components/textile/textileHooks';
import { splitOverview, useNow, needsPolling, isOpening, myActiveQuantity, EASE } from '@/components/textile/textileUtils';
import DropHero from '@/components/textile/DropHero';
import ConceptCard from '@/components/textile/ConceptCard';
import ConceptSheet from '@/components/textile/ConceptSheet';
import ReservationCard from '@/components/textile/ReservationCard';
import { CompactCountdown } from '@/components/textile/Countdown';

function SectionTitle({ eyebrow, title, hint, right }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-0.5">{eyebrow}</p>}
        <h2 className="font-fut text-2xl font-extrabold uppercase leading-none text-foreground">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

function Section({ children, className = '', reduceMotion, ...rest }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className={className}
      {...rest}
    >
      {children}
    </motion.section>
  );
}

/** Drop annoncé secondaire : vignette, nom, compte à rebours compact et alerte. */
function TeasingDropRow({ drop, nowMs, pieceCount, subscribed, pending, onToggleAlert }) {
  const remaining = msUntilOpen(drop, nowMs);
  const alertsCount = Number(drop.alerts_count) || 0;
  const opening = isOpening(drop, nowMs);
  return (
    <div className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
        {drop.cover_image_url ? (
          <img src={drop.cover_image_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <Shirt className="w-6 h-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-fut text-xl font-bold uppercase leading-none text-foreground truncate">{drop.name}</p>
        {drop.tagline && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{drop.tagline}</p>}
        <p className="mt-1.5 text-xs text-foreground/90 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {opening
            ? <span className="text-primary font-semibold">Ouverture…</span>
            : remaining != null
              ? <CompactCountdown ms={remaining} />
              : <span className="text-muted-foreground">Date bientôt annoncée</span>}
          {pieceCount > 0 && <span className="text-muted-foreground">· {pieceCount} pièce{pieceCount > 1 ? 's' : ''}</span>}
          {alertsCount > 0 && <span className="text-muted-foreground inline-flex items-center gap-1"><Users className="w-3 h-3" />{alertsCount}</span>}
        </p>
      </div>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={onToggleAlert}
        disabled={pending}
        aria-pressed={subscribed}
        aria-label={subscribed ? 'Désactiver l\'alerte' : 'Me prévenir'}
        className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:opacity-60 ${
          subscribed ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'bg-secondary text-foreground'
        }`}
      >
        {subscribed ? <BellRing className="w-[18px] h-[18px]" /> : <Bell className="w-[18px] h-[18px]" />}
      </motion.button>
    </div>
  );
}

export default function Textile() {
  const reduceMotion = useReducedMotion();
  const clientNow = useNow(1000);
  const [polling, setPolling] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useTextileOverview({
    refetchInterval: polling ? 5000 : false,
  });

  // Horloge serveur : le compte à rebours suit `data.now`, pas l'heure (parfois fausse) de l'appareil
  const offsetRef = useRef(0);
  useEffect(() => {
    if (!data?.now || !dataUpdatedAt) return;
    const t = new Date(data.now).getTime();
    if (Number.isFinite(t)) offsetRef.current = t - dataUpdatedAt;
  }, [data, dataUpdatedAt]);
  const nowMs = clientNow + offsetRef.current;

  const view = useMemo(() => splitOverview(data), [data]);
  // Compte à rebours à zéro (ou fin de drop passée) : on interroge le serveur toutes les 5 s
  useEffect(() => { setPolling(needsPolling(view.visibleDrops, nowMs)); }, [view.visibleDrops, nowMs]);

  const actions = useTextileActions();
  const [openId, setOpenId] = useState(null);
  const [showEnded, setShowEnded] = useState(false);
  const [scrollToReservations, setScrollToReservations] = useState(false);
  const reservationsRef = useRef(null);

  const openConcept = openId ? view.concepts.find(c => String(c.id) === String(openId)) : null;
  useEffect(() => {
    if (openId && data && !openConcept) setOpenId(null); // pièce retirée entre-temps
  }, [openId, data, openConcept]);

  useEffect(() => {
    if (!scrollToReservations || view.reservations.length === 0) return;
    const el = reservationsRef.current;
    if (el) {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setScrollToReservations(false);
    }
  }, [scrollToReservations, view.reservations.length, reduceMotion]);

  const myVotes = view.me?.votes || {};
  const myAlerts = new Set((view.me?.alerts || []).map(String));

  // Callbacks stables pour les cartes mémoïsées (la page se re-rend chaque seconde)
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const votesRef = useRef(myVotes);
  votesRef.current = myVotes;
  const voteFromCard = useCallback((concept, voted) => {
    actionsRef.current.toggleVote(concept.id, { voted, size: votesRef.current[concept.id]?.size ?? null });
  }, []);
  const openSheet = useCallback((concept) => setOpenId(concept.id), []);

  const featured = view.featured;
  const featuredPhase = featured ? dropPhase(featured, nowMs) : null;
  const featuredOpening = featured ? isOpening(featured, nowMs) : false;
  const openDrop = openConcept?.drop_id ? view.dropById.get(String(openConcept.drop_id)) || null : null;
  const openPhase = openDrop ? dropPhase(openDrop, nowMs) : null;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-32">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary font-medium mb-1">DHB Textile</p>
        <h1 className="font-fut text-[2.75rem] leading-[0.9] font-extrabold uppercase tracking-tight text-foreground">
          Le vestiaire<br />du Gang
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-xs">
          Des pièces en série limitée. Tu votes, tu réserves, tu retires au salon.
        </p>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : isError ? (
        <div className="text-center py-16 px-4">
          <div className="w-14 h-14 rounded-3xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">Le vestiaire ne répond pas</p>
          <p className="text-xs text-muted-foreground mb-5">{error?.message && !/^HTTP \d+$/.test(error.message) ? error.message : 'Vérifie ta connexion et réessaie.'}</p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Réessayer
          </motion.button>
        </div>
      ) : view.isEmpty ? (
        <div className="text-center py-16 px-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Shirt className="w-10 h-10 text-primary" strokeWidth={1.5} />
          </div>
          <p className="font-fut text-2xl font-extrabold uppercase text-foreground mb-1">Le vestiaire se prépare…</p>
          <p className="text-sm text-muted-foreground">Les premières pièces du Gang arrivent bientôt. Reviens vite.</p>
        </div>
      ) : (
        <div className="space-y-9">
          {/* Drop en vedette + ses pièces */}
          {featured && (
            <Section reduceMotion={reduceMotion} className="space-y-5">
              <DropHero
                drop={featured}
                phase={featuredPhase}
                opening={featuredOpening}
                nowMs={nowMs}
                pieceCount={view.featuredConcepts.length}
                subscribed={myAlerts.has(String(featured.id))}
                alertPending={actions.pending.alert}
                onToggleAlert={() => actions.toggleAlert(featured.id, { subscribed: myAlerts.has(String(featured.id)) })}
                reduceMotion={reduceMotion}
              />

              <div>
                <SectionTitle
                  eyebrow={featuredPhase === 'live' ? 'À réserver maintenant' : 'Au programme'}
                  title="Les pièces du drop"
                  hint={featuredPhase === 'live'
                    ? 'Tap sur une pièce pour choisir ta taille et la réserver.'
                    : 'Vote pour dire ce que tu attends, réservation à l\'ouverture.'}
                />
                {view.featuredConcepts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
                    Les pièces de ce drop arrivent bientôt.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {view.featuredConcepts.map((concept, i) => (
                      <ConceptCard
                        key={concept.id}
                        concept={concept}
                        index={i}
                        voted={Boolean(myVotes[concept.id])}
                        canVote={featuredPhase !== 'ended'}
                        live={featuredPhase === 'live'}
                        onVote={voteFromCard}
                        onOpen={openSheet}
                        reduceMotion={reduceMotion}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Mes réservations */}
          {view.reservations.length > 0 && (
            <Section reduceMotion={reduceMotion}>
              <div ref={reservationsRef} className="scroll-mt-24">
                <SectionTitle
                  eyebrow="Précommandes"
                  title="Mes réservations"
                  hint="À payer au salon dans le délai, sinon la pièce est remise en vente. Fabrication à la fin du drop, retrait dès qu'elle est prête."
                />
                <div className="space-y-3">
                  {view.reservations.map(r => (
                    <ReservationCard
                      key={r.id}
                      reservation={r}
                      concept={view.concepts.find(c => String(c.id) === String(r.concept_id)) || null}
                      nowMs={nowMs}
                      onCancel={(id) => actions.cancel(id).catch(() => {})}
                      cancelling={actions.pending.cancelId === r.id}
                    />
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* Le Labo */}
          {view.labConcepts.length > 0 && (
            <Section reduceMotion={reduceMotion}>
              <SectionTitle
                eyebrow="Le Labo"
                title="Vote pour les prochaines pièces"
                hint="Les concepts les plus plébiscités passent en drop."
                right={(
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground/80 shrink-0 pb-0.5">
                    <Flame className="w-3.5 h-3.5 text-orange-400" />
                    {view.labTotal} vote{view.labTotal > 1 ? 's' : ''}
                  </span>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                {view.labConcepts.map((concept, i) => (
                  <ConceptCard
                    key={concept.id}
                    concept={concept}
                    index={i}
                    voted={Boolean(myVotes[concept.id])}
                    hype={view.hypeById.get(String(concept.id)) || { pct: 0, rank: null }}
                    onVote={voteFromCard}
                    onOpen={openSheet}
                    reduceMotion={reduceMotion}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Autres drops annoncés */}
          {view.otherTeasing.length > 0 && (
            <Section reduceMotion={reduceMotion}>
              <SectionTitle eyebrow="Bientôt" title="Prochains drops" />
              <div className="space-y-3">
                {view.otherTeasing.map(drop => (
                  <TeasingDropRow
                    key={drop.id}
                    drop={drop}
                    nowMs={nowMs}
                    pieceCount={(view.conceptsByDrop.get(String(drop.id)) || []).length}
                    subscribed={myAlerts.has(String(drop.id))}
                    pending={actions.pending.alert}
                    onToggleAlert={() => actions.toggleAlert(drop.id, { subscribed: myAlerts.has(String(drop.id)) })}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Drops passés (repliés) */}
          {view.endedDrops.length > 0 && (
            <Section reduceMotion={reduceMotion}>
              <button
                type="button"
                onClick={() => setShowEnded(v => !v)}
                aria-expanded={showEnded}
                className="w-full flex items-center justify-between gap-3 rounded-2xl bg-card border border-border px-4 py-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Drops passés
                  <span className="text-xs font-medium text-muted-foreground">({view.endedDrops.length})</span>
                </span>
                {showEnded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              <AnimatePresence initial={false}>
                {showEnded && (
                  <motion.div
                    key="ended"
                    initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="mt-4 space-y-6"
                  >
                    {view.endedDrops.map(drop => {
                      const pieces = view.conceptsByDrop.get(String(drop.id)) || [];
                      return (
                        <div key={drop.id}>
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="min-w-0">
                              <p className="font-fut text-xl font-bold uppercase leading-none text-foreground truncate">{drop.name}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {drop.ends_at ? `Terminé le ${formatDropDate(drop.ends_at)}` : drop.starts_at ? `Ouvert le ${formatDropDate(drop.starts_at)}` : 'Terminé'}
                              </p>
                            </div>
                            {Number(drop.reservations_count) > 0 && (
                              <span className="text-[11px] text-muted-foreground shrink-0">{drop.reservations_count} réservation{drop.reservations_count > 1 ? 's' : ''}</span>
                            )}
                          </div>
                          {pieces.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Aucune pièce à afficher.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-3">
                              {pieces.map((concept, i) => (
                                <ConceptCard
                                  key={concept.id}
                                  concept={concept}
                                  index={i}
                                  voted={Boolean(myVotes[concept.id])}
                                  canVote={false}
                                  dim
                                  onOpen={openSheet}
                                  reduceMotion={reduceMotion}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>
          )}
        </div>
      )}

      {/* Fiche détail */}
      <AnimatePresence>
        {openConcept && (
          <ConceptSheet
            key={openConcept.id}
            concept={openConcept}
            drop={openDrop}
            phase={openPhase}
            nowMs={nowMs}
            myVote={myVotes[openConcept.id]}
            myActiveQty={myActiveQuantity(view.me, openConcept.id)}
            reserving={actions.pending.reserve}
            onClose={() => setOpenId(null)}
            onToggleVote={(concept, voted, size) => actions.toggleVote(concept.id, { voted, size: size ?? null })}
            onSetVoteSize={(conceptId, size) => actions.setVoteSize(conceptId, size)}
            onReserve={(conceptId, payload) => actions.reserve(conceptId, payload)}
            onShowReservations={() => { setOpenId(null); setScrollToReservations(true); }}
            reduceMotion={reduceMotion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
