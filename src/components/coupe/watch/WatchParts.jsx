import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Eye, Loader2, Tv, Volume2, VolumeX } from 'lucide-react';
import { CHEERS } from '@/lib/coupe/watch';
import { BTN_OUTLINE, BTN_RED, CARD, LABEL } from '../tournoi/ui';
import { allMatches, msOf, playerName, scoreOf } from '../tournoi/tournoiFormat';

/*
 * Morceaux de la page « Regarder un match » (planche validée, écran 13 ; contrat
 * docs/fonctions/coupe-spectateurs-contrat.md, section 4.1) : pastille des spectateurs, réactions,
 * « Ensuite : … », fin du match et écrans d'attente ou d'erreur. Tutoiement, comme tout le jeu.
 */

/**
 * Pastille œil + nombre de spectateurs (écrans compris) ; écran du salon allumé : petite télé. Le mot
 * « spectateurs » à partir de 420 px : en dessous, l'en-tête tient sur une ligne (bouton musique à droite).
 */
export function WatchersPill({ n = 0, screen = false }) {
  const count = Math.max(0, Number(n) || 0);
  const word = count > 1 ? 'spectateurs' : 'spectateur';
  const label = `${count} ${word}${screen ? ', sur l’écran du salon' : ''}`;
  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-white/14 bg-[color:var(--coupe-noir2)] px-2.5 text-[13px] font-bold tabular-nums"
    >
      <Eye className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
      {count}
      <span className="hidden font-medium text-[color:var(--coupe-gris-clair)] min-[420px]:inline" aria-hidden="true">{word}</span>
      {screen && <Tv className="h-[14px] w-[14px] text-[color:var(--coupe-or)]" strokeWidth={2} aria-hidden="true" />}
    </span>
  );
}

/** Bouton « Son » de l'en-tête : le réglage du son de la Coupe (`cdg-sound`), bruitages du but et du sifflet. */
export function SoundButton({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? 'Couper le son' : 'Activer le son'}
      title={on ? 'Son : activé' : 'Son : coupé'}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[color:var(--coupe-noir2)] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {on ? <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" /> : <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
  );
}

const CHEER_BTN = 'h-10 min-w-0 rounded-full border border-white/14 bg-[#1e1f22] px-2 text-sm font-semibold text-white transition-transform motion-safe:active:scale-95 disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** Les 4 réactions toutes faites (une toutes les 3 s), et ce qu'elles font. */
export function CheerBar({ onCheer, disabled = false, sent = null }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Réactions" className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-4">
        {CHEERS.map((text, i) => (
          <button
            key={text}
            type="button"
            className={`${CHEER_BTN} ${sent === i ? 'border-[color:var(--coupe-rouge-trait)]' : ''}`}
            disabled={disabled}
            onClick={() => onCheer(i)}
          >
            {text}
          </button>
        ))}
      </div>
      <p className="m-0 text-xs text-[color:var(--coupe-gris-clair)]">Les joueurs voient tes réactions. Aucun message écrit.</p>
    </div>
  );
}

/**
 * Prochain match du tableau d'un tournoi (« Ensuite : Kevin – Yanis K., dans ~3 min ») : le premier
 * match prêt, pas encore commencé, avec ses deux joueurs, autre que celui qu'on regarde ; null sinon.
 */
export function nextMatchOf(t, currentId, serverNow) {
  const list = allMatches(t).filter((m) => m && m.id !== currentId && m.status === 'ready' && !m.live?.playing && m.p?.[0] && m.p?.[1]);
  const m = list[0];
  if (!m) return null;
  const at = msOf(m.ready_at);
  const min = at != null && at > serverNow ? Math.max(1, Math.round((at - serverNow) / 60000)) : null;
  return { id: m.id, text: `${playerName(m.p[0])} – ${playerName(m.p[1])}`, when: min ? `dans ~${min} min` : null };
}

/** Lien « Ensuite : … » vers le tableau du tournoi. */
export function NextMatchLink({ next, to }) {
  if (!next) return null;
  return (
    <Link
      to={to}
      className={`${CARD} flex min-h-[48px] items-center justify-between gap-3 px-3.5 py-3 text-sm text-white no-underline hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
    >
      <span className="min-w-0">
        <span className="text-[color:var(--coupe-gris-clair)]">Ensuite :</span>{' '}
        <b className="font-bold">{next.text}</b>
        {next.when ? `, ${next.when}` : ''}
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[color:var(--coupe-gris-clair)]" aria-hidden="true" />
    </Link>
  );
}

/** Phrase de la fin d'un match regardé (`result` de SpectatorMatch). */
export function endText(result, names) {
  const r = result || {};
  const sc = Array.isArray(r.sc) ? r.sc : [0, 0];
  if (r.reason === 'private') return 'Un joueur a fermé ses matchs aux spectateurs.';
  if (r.winner !== 0 && r.winner !== 1) {
    if (r.reason === 'time_limit_draw') return `Match nul, ${sc[1]} – ${sc[0]}.`;
    return 'Le match s’est arrêté avant la fin.';
  }
  const w = r.winner;
  const name = names?.[w] || 'Le vainqueur';
  const score = `${sc[w]} – ${sc[1 - w]}`;
  if (r.forfeit) return `${name} gagne par forfait.`;
  if (Array.isArray(r.so)) return `${name} gagne aux tirs au but (${r.so[w]} – ${r.so[1 - w]}), ${score} à la fin du match.`;
  return `${name} gagne ${score}.`;
}

// Point final, sans doubler celui d'un nom qui finit déjà par un point (« Lucas M. »)
const sentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/**
 * Match fini d'après le tableau du tournoi (`done` ou `bye`), vu pendant l'attente : « Lucas M. 5 – 3
 * Dom. », « Lucas M. passe d'office. » ; null sans rien de sûr à dire.
 */
export function boardEndText(m) {
  if (!m) return null;
  const p0 = m.p?.[0] || null;
  const p1 = m.p?.[1] || null;
  if (m.status === 'bye') {
    const p = p0 || p1;
    return p ? sentence(`${playerName(p)} passe d’office`) : null;
  }
  const sc = scoreOf(m);
  if (!sc || !p0 || !p1) return null;
  return sentence(`${playerName(p0)} ${sc[0]} – ${sc[1]} ${playerName(p1)}`);
}

/** Dernier score vu d'un match fini pendant l'absence (repère du serveur : joueur 1 à gauche). */
export function lastScoreText(names, sc) {
  const n = Array.isArray(names) ? names : [];
  const s = Array.isArray(sc) ? sc : [0, 0];
  return sentence(`Dernier score vu : ${n[1] || 'Joueur du haut'} ${s[1]} – ${s[0]} ${n[0] || 'Joueur du bas'}`);
}

/**
 * Fin du match : le résultat, le retour au tableau (tournoi) ou à la Coupe. `title` et `text`
 * remplacent la phrase du résultat (match fini d'après le tableau, ou pendant l'absence).
 */
export function WatchEnd({ result, names, title = null, text = null, tourTo = null, onHome }) {
  return (
    <section aria-labelledby="regarder-fin" className={`${CARD} flex flex-col gap-3 px-4 py-4`}>
      <span className={LABEL}>Fin du match</span>
      <h2 id="regarder-fin" className="m-0 text-lg font-bold leading-snug">{title || endText(result, names)}</h2>
      {title && text && <p className="m-0 text-sm leading-snug text-[color:var(--coupe-gris-clair)]">{text}</p>}
      <div className="flex flex-col gap-2">
        {tourTo && <Link to={tourTo} className={BTN_RED}>Retour au tableau</Link>}
        <button type="button" className={tourTo ? BTN_OUTLINE : BTN_RED} onClick={onHome}>Retour à la Coupe</button>
      </div>
    </section>
  );
}

/** Carte d'un état sans match à l'écran : attente, refus, connexion perdue. */
export function WatchNotice({ title, text = null, busy = false, onRetry = null, retryLabel = 'Réessayer', onBack = null, backLabel = 'Retour', alert = false }) {
  return (
    <section className={`${CARD} mt-3 flex flex-col items-center gap-3 px-5 py-8 text-center`} role={alert ? 'alert' : 'status'}>
      {busy && <Loader2 className="h-7 w-7 animate-spin text-[color:var(--coupe-rouge-vif)] motion-reduce:animate-none" aria-hidden="true" />}
      <h2 className="m-0 text-lg font-bold leading-snug">{title}</h2>
      {text && <p className="m-0 max-w-xs text-sm leading-snug text-[color:var(--coupe-gris-clair)]">{text}</p>}
      {(onRetry || onBack) && (
        <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
          {onRetry && <button type="button" className={BTN_RED} onClick={onRetry}>{retryLabel}</button>}
          {onBack && <button type="button" className={BTN_OUTLINE} onClick={onBack}>{backLabel}</button>}
        </div>
      )}
    </section>
  );
}
