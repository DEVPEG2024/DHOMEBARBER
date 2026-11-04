import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Tv } from 'lucide-react';
import { queryFailed } from '@/components/shared/LoadError';
import { COUPE_SPECTATORS_FLAG_KEY, useCoupeLive, useSpectatorsEnabled } from '@/lib/coupe/coupeApi';
import { watchPath } from '@/lib/coupe/watch';
import CoupeLoadError from '../CoupeLoadError';
import { isCoupeClosed } from '../coupeErrors';
import { LiveDot, PlayerLabel, TPawn } from '../tournoi/ui';
import { ROLE_SALON, num } from './coupeFormat';

/**
 * « En direct » sur l'accueil de la Coupe (spectateurs, 4 nov. 2026 ; contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, sections 2 et 4.3) : les matchs commencés que ce
 * compte peut regarder (`GET /coupe/live` : jamais le sien, jamais un joueur bloqué, tournoi
 * d'abord), relus toutes les 15 s page visible. Pour chacun : le tournoi et le tour (ou « Match en
 * ligne »), les deux joueurs aux initiales (jamais de photo) et le score, le nombre de spectateurs
 * (et « Écran du salon » quand l'écran du salon le montre), « Regarder » vers `/coupe/regarder`.
 * Match de tournoi nommé par `tour.title` (« Quart 1 », ajouté par le serveur), sinon `tour.label`
 * (le nom du tour, « Quart de finale », serveur d'avant `title`), puis le nom du tournoi.
 * Deux cartes au plus, puis « Voir les N matchs en direct », qui déplie la suite et la replie
 * (décision A10 du contrat, section 6) : « 1. Comment tu joues ? » ne descend jamais de plus de deux
 * cartes.
 *
 * Rien sans `features.coupeSpectators` (aucune lecture), rien tant que la liste n'est pas lue ni
 * quand elle est vide. Lecture en échec sans liste déjà lue : le bloc d'erreur de la Coupe dans la
 * section (jamais à la place du reste de l'accueil) ; spectateurs coupés pendant que la page est
 * ouverte (404 `disabled`) : la section disparaît et le drapeau est relu.
 */
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
// Cartes montrées avant « Voir les N matchs en direct »
const FIRST_CARDS = 2;

/** Ligne de `/coupe/live` utilisable (identifiant lisible, deux noms), ou null. */
function rowOf(m) {
  if (!m || typeof m !== 'object' || !ID_RE.test(String(m.id ?? ''))) return null;
  const kind = m.kind === 'tour' ? 'tour' : 'room';
  const names = Array.isArray(m.names) ? m.names : [];
  const roles = Array.isArray(m.roles) ? m.roles : [];
  const player = (i) => ({
    name: String(names[i] ?? '').slice(0, 60) || 'Joueur',
    // Admin : « D'Home Barber », pion « DHB »
    role: roles[i] === 'admin' ? ROLE_SALON : String(roles[i] ?? 'user'),
  });
  const sc = Array.isArray(m.sc) ? [num(m.sc[0]), num(m.sc[1])] : [0, 0];
  const tour = kind === 'tour' && m.tour && typeof m.tour === 'object' ? {
    tid: ID_RE.test(String(m.tour.tid ?? '')) ? String(m.tour.tid) : null,
    name: String(m.tour.name ?? '').slice(0, 60),
    // « Quart 1 » (serveur du 4 nov. 2026) ; sinon le nom du tour, « Quart de finale »
    title: String(m.tour.title ?? '').slice(0, 40),
    label: String(m.tour.label ?? '').slice(0, 40),
  } : null;
  return {
    key: `${kind}:${m.id}`,
    kind,
    id: String(m.id),
    p: [player(0), player(1)],
    sc,
    watchers: Math.max(0, Math.floor(num(m.watchers))),
    screen: m.screen === true,
    tour,
  };
}

function LiveCard({ row }) {
  const title = row.tour
    ? [row.tour.title || row.tour.label, row.tour.name].filter(Boolean).join(' · ') || 'Match de tournoi'
    : 'Match en ligne';
  const vs = `${row.p[0].name} contre ${row.p[1].name}`;
  const href = row.kind === 'tour' ? watchPath({ m: row.id, tournoi: row.tour?.tid }) : watchPath({ w: row.id });
  return (
    <li>
      <article aria-label={`${title} : ${vs}`} className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-[color:var(--coupe-noir2)] px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--coupe-gris)]">
          <span className="min-w-0 truncate">{title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-2 font-semibold normal-case tracking-normal">
            <LiveDot>En direct</LiveDot>
            {row.watchers > 0 && (
              <span className="inline-flex items-center gap-1 text-[color:var(--coupe-gris-clair)]">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">{row.watchers}</span>
                <span className="sr-only">{row.watchers === 1 ? ' spectateur' : ' spectateurs'}</span>
              </span>
            )}
            {row.screen && (
              <span className="inline-flex items-center gap-1 text-[color:var(--coupe-or)]">
                <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                Écran du salon
              </span>
            )}
          </span>
        </div>
        {[0, 1].map((side) => (
          <div key={side} className="flex items-center gap-2.5 text-sm">
            <TPawn player={row.p[side]} size={26} />
            <PlayerLabel player={row.p[side]} className="font-semibold" />
            <span className="ml-auto font-fut text-[22px] font-extrabold leading-none tabular-nums">{row.sc[side]}</span>
          </div>
        ))}
        <Link
          to={href}
          aria-label={`Regarder ${vs}`}
          className="mt-1 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/[.14] bg-[color:var(--coupe-noir3)] text-sm font-semibold text-white hover:bg-white/6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Regarder
        </Link>
      </article>
    </li>
  );
}

export default function LiveSection() {
  const on = useSpectatorsEnabled();
  const queryClient = useQueryClient();
  const query = useCoupeLive({ enabled: on });
  const [all, setAll] = useState(false);
  const listId = useId();
  const closed = on && isCoupeClosed(query.error);

  // Spectateurs coupés par le serveur pendant que la page est ouverte : le drapeau est relu
  useEffect(() => {
    if (closed) queryClient.invalidateQueries({ queryKey: COUPE_SPECTATORS_FLAG_KEY });
  }, [closed, queryClient]);

  if (!on || closed) return null;
  const failed = queryFailed(query);
  const rows = Array.isArray(query.data?.matches) ? query.data.matches.map(rowOf).filter(Boolean) : [];
  if (!failed && rows.length === 0) return null;

  return (
    <section aria-labelledby="coupe-direct" className="flex flex-col gap-2.5">
      <h2 id="coupe-direct" className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.04em]">En direct</h2>
      {failed ? (
        <CoupeLoadError compact what="les matchs en direct" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : (
        <>
          <ul id={listId} className="flex flex-col gap-2.5">
            {(all ? rows : rows.slice(0, FIRST_CARDS)).map((row) => <LiveCard key={row.key} row={row} />)}
          </ul>
          {rows.length > FIRST_CARDS && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              aria-expanded={all}
              aria-controls={listId}
              className="min-h-[44px] w-full rounded-2xl border border-white/8 bg-[color:var(--coupe-noir2)] px-3 font-fut text-sm font-bold uppercase tracking-[0.06em] text-[color:var(--coupe-gris-clair)] hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {all ? 'Voir moins' : `Voir les ${rows.length} matchs en direct`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
