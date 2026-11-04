import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Play } from 'lucide-react';
import { TOURNAMENT_CHECKIN_MS, useCoupeTournamentsFlag, useTournament, useTournaments } from '@/lib/coupe/coupeApi';
import { COUPE_COLORS } from '../palette';
import { alpha } from '../hub/theme';
import { num } from '../hub/coupeFormat';
import { markMatchPrompted } from './MatchStartDialog';
import { BTN_RED, FitTitle, LABEL, LivePill, coupeLogoUrl, useServerClock } from './ui';
import { canJoin, dateLine, durationMin, msOf, startsIn } from './tournoiFormat';

/**
 * Carte « Prochain tournoi » ou « Tournoi en cours » de l'accueil de la Coupe, sous les Points
 * (planche validée le 3 nov. 2026, écran 1) : logo de la Coupe, nom, date, format, inscrits et
 * places restantes, vers la page du tournoi (`/coupe/tournoi/:id`).
 *
 * Rien du tout sans le drapeau des tournois (aucune lecture des tournois), sans tournoi à venir ou
 * en cours, ou si la lecture échoue (les Points juste au-dessus disent déjà « Pas de connexion »).
 * Un tournoi en cours passe avant le prochain.
 * Ce que le joueur a à faire en premier : « Confirme ta présence » pendant les 15 min de présence
 * (inscrit, pas encore présent) ; « Ton match est prêt » et « Jouer mon match » (le jeu s'ouvre,
 * sa sortie mène au tableau) quand son match est jouable : pour un inscrit d'un tournoi en cours,
 * la carte lit aussi le tournoi (`useTournament`, relu toutes les 3 s).
 */
const CARD_STYLE = {
  background: `linear-gradient(160deg, ${alpha(COUPE_COLORS.or, 0.13)} 0%, ${alpha(COUPE_COLORS.noir2, 0.96)} 38%, ${COUPE_COLORS.noir2} 100%)`,
  borderColor: COUPE_COLORS.orBord,
};
const BAR_STYLE = { background: `linear-gradient(90deg, ${COUPE_COLORS.rougeSombre}, ${COUPE_COLORS.rouge})` };

/** Le tournoi à montrer : celui en cours, sinon le prochain ouvert. */
function pick(items) {
  const list = Array.isArray(items) ? items.filter((t) => t && t.id) : [];
  const running = list.filter((t) => t.status === 'running');
  if (running.length) return running[0];
  return list
    .filter((t) => t.status === 'open' && msOf(t.starts_at) != null)
    .sort((a, b) => msOf(a.starts_at) - msOf(b.starts_at))[0] || null;
}

function cta(t) {
  if (t.status === 'running') return 'Voir le tableau';
  if (t.me?.registered) return 'Voir le tournoi';
  return num(t.registered) >= num(t.size) ? 'Voir et rejoindre la liste' : 'Voir et s’inscrire';
}

export default function TournamentCard() {
  const on = useCoupeTournamentsFlag();
  const query = useTournaments({ enabled: on });
  const t = on ? pick(query.data?.items) : null;
  const running = t?.status === 'running';
  // Inscrit d'un tournoi en cours : son match (jouable ou pas), lu dans le tournoi
  const follow = !!t && running && !!t.me?.registered;
  const detail = useTournament(t?.id, { enabled: on && follow });
  const now = useServerClock(query.data?.server_now, query.dataUpdatedAt, 15 * 1000);
  const detailNow = useServerClock(detail.data?.server_now, detail.dataUpdatedAt, follow ? 1000 : 60 * 1000);
  if (!on || !t) return null;

  const offline = query.isRefetchError || query.failureCount > 0;
  const myMatch = follow && detail.data?.id === t.id && detail.data?.me?.match && typeof detail.data.me.match === 'object'
    ? detail.data.me.match : null;
  const matchReady = !!myMatch && canJoin(myMatch, detailNow) && !(detail.isRefetchError || detail.failureCount > 0);
  const size = num(t.size) || 16;
  const registered = Math.min(num(t.registered), size);
  const left = size - registered;
  const waiting = num(t.waiting);
  const starts = msOf(t.starts_at);
  const titleId = `coupe-tournoi-carte-${t.id}`;
  const presence = !running && t.status === 'open' && starts != null && now >= starts - TOURNAMENT_CHECKIN_MS && now < starts;
  const confirmNow = presence && !!t.me?.registered && !t.me?.checked_in;
  const page = `/coupe/tournoi/${encodeURIComponent(t.id)}`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3.5 rounded-[20px] border p-4" style={CARD_STYLE}>
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>{running ? 'Tournoi en cours' : 'Prochain tournoi'}</span>
        {running ? (
          offline ? null : <LivePill />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--coupe-gris-clair)]">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {startsIn(starts, now)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3.5">
        <img
          src={coupeLogoUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="h-[76px] w-[76px] shrink-0 object-contain"
          style={{ filter: `drop-shadow(0 6px 14px ${alpha(COUPE_COLORS.or, 0.25)})` }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FitTitle as="h2" id={titleId} min={16} className="font-fut text-[28px] font-extrabold uppercase leading-none tracking-[0.03em]">
            {t.name}
          </FitTitle>
          <p className="text-sm font-semibold">{dateLine(starts)}</p>
          <p className="text-[13px] text-[color:var(--coupe-gris)]">
            {size} joueurs · élimination directe · ~{durationMin(size)} min
          </p>
        </div>
      </div>
      {!running && (
        <>
          <p className="text-[13px]">
            <b>{registered} {registered === 1 ? 'inscrit' : 'inscrits'}</b>
            <span className="text-[color:var(--coupe-gris)]">
              {' · '}
              {left > 0
                ? `plus que ${left} ${left === 1 ? 'place' : 'places'}`
                : `complet${waiting ? `, ${waiting} en liste d’attente` : ''}`}
            </span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--coupe-noir3)]" aria-hidden="true">
            <div className="h-full rounded-full" style={{ ...BAR_STYLE, width: `${Math.round((registered / size) * 100)}%` }} />
          </div>
          {t.me?.registered && (confirmNow ? (
            <p role="status" className="flex items-center gap-1.5 text-[13px] font-bold text-[color:var(--coupe-rouge-vif)]">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Confirme ta présence avant {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(starts))}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--coupe-or)]">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t.me.waiting ? 'Tu es sur la liste d’attente' : t.me.checked_in ? 'Tu es inscrit, présence confirmée' : 'Tu es inscrit'}
            </p>
          ))}
        </>
      )}
      {matchReady && (
        <p role="status" className="flex items-center gap-1.5 text-[13px] font-bold text-[color:var(--coupe-rouge-vif)]">
          <Play className="h-4 w-4" aria-hidden="true" />
          Ton match est prêt
        </p>
      )}
      {matchReady ? (
        <Link
          to={`/coupe?tmatch=${encodeURIComponent(myMatch.id)}&tournoi=${encodeURIComponent(t.id)}`}
          onClick={() => markMatchPrompted(myMatch.id)}
          className={BTN_RED}
        >
          <Play className="h-5 w-5" aria-hidden="true" />
          Jouer mon match
        </Link>
      ) : (
        <Link to={page} className={BTN_RED}>
          {confirmNow ? 'Confirmer ma présence' : cta(t)}
        </Link>
      )}
    </section>
  );
}
