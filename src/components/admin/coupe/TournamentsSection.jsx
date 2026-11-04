/**
 * Section « Tournois » d'Admin → La Coupe du Gang (contrat : docs/fonctions/coupe-tournois-contrat.md,
 * sections 3.4 et 6) : en cours, à venir, puis terminés et annulés, avec inscrits et présents ;
 * « Nouveau tournoi » (TournamentForm) ; un tournoi s'ouvre dans son suivi en direct
 * (TournamentFollow, `?tournoi=<id>`). Montée seulement avec `features.coupeTournaments`.
 * Données : `GET /coupe/admin/tournaments` (tournoisAdminApi.js).
 */
import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LoadError, { queryFailed } from '@/components/shared/LoadError';
import { TOURNAMENT_CHECKIN_MS } from '@/lib/coupe/coupeApi';
import { useAdminTournaments } from './tournoisAdminApi';
import TournamentForm from './TournamentForm';
import { dateLine, msOf } from './tournoisAdminFormat';

const OLD_SHOWN = 5;
const count = (v) => Math.max(0, Math.round(Number(v) || 0));

function badgeOf(t, now) {
  if (t.status === 'running') return { label: 'En cours', className: 'border-red-500/40 bg-red-500/15 text-red-500', dot: true };
  if (t.status === 'finished') return { label: 'Fini', className: 'border-border bg-secondary text-muted-foreground' };
  if (t.status === 'cancelled') return { label: 'Annulé', className: 'border-red-500/30 bg-red-500/10 text-red-500' };
  const starts = msOf(t.starts_at);
  if (starts != null && now >= starts) return { label: 'Tirage…', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' };
  if (starts != null && now >= starts - TOURNAMENT_CHECKIN_MS) return { label: 'Présence', className: 'border-amber-500/30 bg-amber-500/10 text-amber-500' };
  return { label: 'Inscriptions', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' };
}

/** « 7/8 inscrits · 2 en attente · 5 présents » (présents seulement une fois la présence ouverte). */
function countsLine(t, now) {
  const size = count(t.size) || 8;
  const registered = count(t.registered);
  const waiting = count(t.waiting);
  const present = count(t.present_count);
  const starts = msOf(t.starts_at);
  const presenceOpen = t.status !== 'open' || (starts != null && now >= starts - TOURNAMENT_CHECKIN_MS);
  const parts = [`${registered}/${size} inscrits`];
  if (waiting) parts.push(`${waiting} en attente`);
  if (presenceOpen) parts.push(`${present} ${present <= 1 ? 'présent' : 'présents'}`);
  return parts.join(' · ');
}

function TournamentItem({ t, now, onOpen }) {
  const badge = badgeOf(t, now);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(t.id)}
        className="w-full text-left rounded-xl border border-border bg-secondary/30 hover:bg-secondary/60 px-3 py-2.5 flex items-center gap-3 min-w-0 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm text-foreground truncate">{t.name}</span>
            <span className={`inline-flex shrink-0 items-center gap-1 h-5 px-2 rounded-full border text-[10px] font-bold ${badge.className}`}>
              {badge.dot && <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />}
              {badge.label}
            </span>
          </span>
          <span className="block text-[11px] text-muted-foreground truncate">
            {dateLine(t.starts_at)} · {count(t.size) || 8} joueurs
          </span>
          {t.status !== 'cancelled' && (
            <span className="block text-[11px] text-muted-foreground">{countsLine(t, now)}</span>
          )}
        </span>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function Group({ title, items, now, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <h3 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((t) => <TournamentItem key={t.id} t={t} now={now} onOpen={onOpen} />)}
      </ul>
    </div>
  );
}

/** `onOpen(id)` : ouvre le suivi d'un tournoi. */
export default function TournamentsSection({ onOpen }) {
  const query = useAdminTournaments();
  const { data, error, refetch, isFetching, isPending } = query;
  const [creating, setCreating] = useState(false);
  const [showOld, setShowOld] = useState(false);

  const now = Date.now();
  const items = Array.isArray(data?.items) ? data.items.filter((t) => t && typeof t === 'object' && t.id) : [];
  const byStart = (a, b) => (msOf(a.starts_at) ?? 0) - (msOf(b.starts_at) ?? 0);
  const running = items.filter((t) => t.status === 'running').sort(byStart);
  const upcoming = items.filter((t) => t.status === 'open').sort(byStart);
  const past = items.filter((t) => t.status === 'finished' || t.status === 'cancelled').sort((a, b) => byStart(b, a));
  const pastShown = showOld ? past : past.slice(0, OLD_SHOWN);
  // 404 { code: 'disabled' } : tournois coupés entre la lecture du drapeau et celle de la liste
  const switchedOff = error?.status === 404 && !data;
  const failed = !switchedOff && queryFailed(query);

  return (
    <section aria-labelledby="coupe-tournois-titre" className="rounded-2xl border border-border bg-card p-4 min-w-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 id="coupe-tournois-titre" className="flex items-start gap-2 text-sm font-bold leading-snug text-foreground min-w-0">
          <Trophy className="w-4 h-4 mt-0.5 shrink-0 text-[#ebc15e]" aria-hidden="true" />
          <span className="min-w-0">Tournois</span>
        </h2>
        <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 bg-[#e01f26] text-white hover:bg-[#c81a20]">
          <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Nouveau tournoi
        </Button>
      </div>

      {switchedOff && (
        <p role="status" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
          {error?.data?.code === 'disabled'
            ? 'Les tournois sont coupés (variable Heroku COUPE_TOURNOIS=off).'
            : 'Le serveur ne connaît pas encore les tournois.'}
        </p>
      )}

      {failed && <LoadError compact what="les tournois" error={error} onRetry={refetch} retrying={isFetching} />}

      {isPending && !failed && !switchedOff && (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-[60px] rounded-xl border border-border bg-secondary/30 animate-pulse" />)}
        </div>
      )}

      {data && items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          Aucun tournoi pour le moment. Jour et heure libres : début entre 08:00 et 20:00, 8 ou 16 joueurs, ouvert à tout le monde.
        </p>
      )}

      {data && items.length > 0 && (
        <div className="flex flex-col gap-3">
          <Group title="En cours" items={running} now={now} onOpen={onOpen} />
          <Group title="À venir" items={upcoming} now={now} onOpen={onOpen} />
          <Group title="Terminés et annulés" items={pastShown} now={now} onOpen={onOpen} />
          {past.length > OLD_SHOWN && (
            <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setShowOld((v) => !v)}>
              {showOld ? 'Voir moins' : `Voir les ${past.length - OLD_SHOWN} plus anciens`}
            </Button>
          )}
        </div>
      )}

      <TournamentForm
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false);
          if (t?.id) onOpen(t.id);
        }}
      />
    </section>
  );
}
