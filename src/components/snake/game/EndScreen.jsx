import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, ShieldAlert, Trophy } from 'lucide-react';
import { lcdScore, ofSeason, rankText } from '@/lib/snake/format';
import { invalidateSnake, setSnakeOptIn } from '@/lib/snake/snakeApi';
import { shareSnakeScore } from '@/lib/snake/share';
import Lcd from '../Lcd';
import { SNAKE_COLORS as C } from '../palette';
import { isSnakeClosed, snakeErrorText, SNAKE_BANNED_TEXT, SNAKE_PAUSED_TEXT } from '../snakeErrors';
import Phone from './Phone';
import { CurledSnake } from './PixelArt';
import { noMouseFocus } from './Keypad';
import { localTexts, retryTexts } from './texts';

/**
 * Fin de partie (planche `Perdu.dc.html`) : le téléphone montre PERDU, le score, le record, les
 * bouchées et le niveau ; dessous, une carte (nouveau record, place du mois, invitation au
 * classement, partie non classée, score en cours d'envoi ou pas encore envoyé) ; puis Rejouer,
 * Partager et Classement.
 *
 * Les 400 premières ms, l'écran ignore les clics : un doigt posé pendant le clignotement ne doit
 * toucher ni « Apparaître au classement » ni « Rejouer ».
 */

/** Délai pendant lequel l'écran de fin ignore les clics (ms). */
export const END_GUARD_MS = 400;

const pointsText = (n) => `${n} point${n > 1 ? 's' : ''}`;

/** Score refusé pour de bon : titre et texte selon la raison (410, 409, 422, jeu coupé). */
function rejectedTexts(finish) {
  if (isSnakeClosed(finish.error)) return { title: 'Score non enregistré', text: SNAKE_PAUSED_TEXT };
  if (finish.reason === 'expired') return { title: 'Partie trop ancienne : score non enregistré', text: 'Lance une nouvelle partie pour jouer classé.' };
  if (finish.reason === 'update') return { title: 'Score non enregistré', text: 'Mets l’app à jour pour que tes parties comptent au classement.' };
  return { title: 'Score non enregistré', text: 'Le serveur n’a pas pu vérifier cette partie.' };
}

// Boutons de l'écran de fin : survol plus clair sur ordinateur seulement, fond par variable CSS
const BTN_FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';
const BTN_BG = 'bg-[color:var(--snake-btn)] [@media(hover:hover)]:hover:bg-[color:var(--snake-btn-survol)]';
const greenBtn = { '--snake-btn': C.vert, '--snake-btn-survol': C.vertBord };
const darkBtn = { '--snake-btn': C.corps, '--snake-btn-survol': C.toucheSurvol, borderColor: C.toucheBord };

/** « Encore 65 points pour battre ton record. » (il faut faire strictement mieux). */
function gapText(record, score) {
  if (!Number.isFinite(record)) return '';
  if (score > record) return '';
  return `Encore ${pointsText(record - score + 1)} pour battre ton record.`;
}

function Badge({ children, tone = 'vert' }) {
  const bg = tone === 'or' ? 'rgba(235, 193, 94, 0.14)' : tone === 'gris' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(61, 190, 126, 0.14)';
  const fg = tone === 'or' ? C.or : tone === 'gris' ? C.grisClair : C.vertTexte;
  return (
    <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[14px] font-fut text-[26px] font-extrabold leading-none" style={{ background: bg, color: fg }}>
      {children}
    </div>
  );
}

function Card({ badge, title, text, children, live = false }) {
  return (
    <div
      role={live ? 'status' : undefined}
      className="flex w-full max-w-[362px] items-center gap-3.5 rounded-[18px] border px-4 py-3.5"
      style={{ background: C.carte, borderColor: 'rgba(255, 255, 255, 0.08)' }}
    >
      {badge}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-semibold text-white">{title}</span>
        {text && <span className="text-[13px] leading-snug" style={{ color: C.gris }}>{text}</span>}
      </div>
      {children}
    </div>
  );
}

/** Interrupteur « Apparaître au classement » (52 × 32, zone de 44 px de haut). */
function OptInSwitch({ checked, busy, onChange, labelId, armed }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      disabled={busy}
      onClick={() => { if (armed()) onChange(!checked); }}
      className="flex h-11 shrink-0 items-center rounded-full disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]"
    >
      <span className="flex h-8 w-[52px] rounded-full p-[3px]" style={{ background: checked ? C.vert : C.piste, justifyContent: checked ? 'flex-end' : 'flex-start' }}>
        <span aria-hidden="true" className="h-[26px] w-[26px] rounded-full bg-white" />
      </span>
    </button>
  );
}

function ResultCard({ result, finish, local, me, prevRank, onRetry, armed }) {
  const queryClient = useQueryClient();
  const [optBusy, setOptBusy] = useState(false);
  const [optOn, setOptOn] = useState(false);
  const data = me?.data || null;
  const season = ofSeason(data?.season) || 'du mois';
  const score = result.score;

  if (local) {
    const { Icon, card } = localTexts(local);
    return (
      <Card
        badge={<Badge tone="gris"><Icon className="h-6 w-6" aria-hidden="true" /></Badge>}
        title="Partie non classée"
        text={card}
      />
    );
  }
  if (finish.state === 'sending' || finish.state === 'idle') {
    return (
      <Card
        live
        badge={<Badge><Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" /></Badge>}
        title="Envoi du score…"
        text="Le serveur vérifie ta partie."
      />
    );
  }
  if (finish.state === 'retry') {
    // Fin gardée sur l'appareil (src/lib/snake/pending.js) : renvoyée seule dès que possible
    const { Icon, text } = retryTexts(finish.reason);
    return (
      <Card
        live
        badge={<Badge tone="gris"><Icon className="h-6 w-6" aria-hidden="true" /></Badge>}
        title="Score pas encore envoyé"
        text={text}
      >
        <button
          type="button"
          onClick={() => { if (armed()) onRetry(); }}
          className={`min-h-[44px] shrink-0 rounded-xl px-3 text-sm font-semibold text-white ${BTN_BG} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
          style={greenBtn}
        >
          Réessayer
        </button>
      </Card>
    );
  }
  if (finish.state === 'rejected') {
    const { title, text } = rejectedTexts(finish);
    return (
      <Card
        live
        badge={<Badge tone="gris"><ShieldAlert className="h-6 w-6" aria-hidden="true" /></Badge>}
        title={title}
        text={text}
      />
    );
  }

  // Score accepté
  const res = finish.data || {};
  const rank = res.rank ?? (optOn ? data?.rank : null) ?? null;
  const ranked = !!res.ranked || (optOn && !!data?.opt_in);
  const previous = Number.isFinite(res.previous_record) ? res.previous_record : null;
  const record = res.record ? score : previous;

  // Pas encore volontaire mais classable : l'invitation passe avant le reste (record compris)
  const invite = !!data && data.rankable && !data.opt_in && !data.banned && !optOn;

  if (res.record && !invite) {
    let text = previous !== null ? `Ton ancien record : ${pointsText(previous)}.` : 'Ton premier record est enregistré.';
    if (ranked && rank) text = `${rankText(rank)} ${season}. ${text}`;
    return <Card live badge={<Badge tone="or"><Trophy className="h-6 w-6" aria-hidden="true" /></Badge>} title="Nouveau record !" text={text} />;
  }

  if (ranked && rank) {
    let verb = 'es';
    if (prevRank && rank === prevRank) verb = 'restes';
    else if (prevRank && rank < prevRank) verb = 'passes';
    return (
      <Card live badge={<Badge>{rankText(rank)}</Badge>} title={`Tu ${verb} ${rankText(rank)} ${season}`} text={gapText(record, score)} />
    );
  }

  if (invite) {
    const turnOn = async (next) => {
      if (!next || optBusy) return;
      setOptBusy(true);
      try {
        await setSnakeOptIn(true);
        setOptOn(true);
        await invalidateSnake(queryClient);
      } catch (err) {
        toast.error(snakeErrorText(err));
      } finally {
        setOptBusy(false);
      }
    };
    const lead = res.record ? `Nouveau record : ${pointsText(score)} !` : gapText(record, score);
    return (
      <Card
        badge={<Badge tone={res.record ? 'or' : 'vert'}><Trophy className="h-6 w-6" aria-hidden="true" /></Badge>}
        title={<span id="snake-fin-optin">Apparaître au classement</span>}
        text={`${lead} Prénom et initiale seulement.`.trim()}
      >
        <OptInSwitch checked={optBusy} busy={optBusy} onChange={turnOn} labelId="snake-fin-optin" armed={armed} />
      </Card>
    );
  }

  if (optOn) {
    return <Card live badge={<Badge><Trophy className="h-6 w-6" aria-hidden="true" /></Badge>} title={`Tu figures au classement ${season}`} text={gapText(record, score)} />;
  }

  return (
    <Card
      badge={<Badge tone="gris"><Trophy className="h-6 w-6" aria-hidden="true" /></Badge>}
      title="Score enregistré"
      text={data?.banned ? SNAKE_BANNED_TEXT : gapText(record, score) || 'Le salon ne figure pas au classement : ton record reste à toi.'}
    />
  );
}

export default function EndScreen({ result, finish, local, me, prevRank, onReplay, onRetry }) {
  const replayRef = useRef(null);
  const [armedState, setArmed] = useState(false);
  const armedRef = useRef(false);
  const armed = () => armedRef.current;
  useEffect(() => {
    try { replayRef.current?.focus({ preventScroll: true }); } catch { /* focus refusé */ }
    const id = setTimeout(() => {
      armedRef.current = true;
      setArmed(true);
    }, END_GUARD_MS);
    return () => clearTimeout(id);
  }, []);
  if (!result) return null;

  const meRecord = me?.data?.record?.score;
  const res = finish.state === 'done' ? finish.data || {} : null;
  let shownRecord;
  if (res) shownRecord = res.record ? result.score : (Number.isFinite(res.previous_record) ? res.previous_record : result.score);
  else if (!local && finish.state !== 'rejected' && finish.state !== 'retry') shownRecord = Math.max(Number.isFinite(meRecord) ? meRecord : 0, result.score);
  else shownRecord = Number.isFinite(meRecord) ? meRecord : 0;
  const won = result.end === 'full';

  const statRow = (label, value, big) => (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm">{label}</span>
      <span className={big ? 'text-[34px] font-bold leading-none' : 'text-xl leading-none'}>{value}</span>
    </div>
  );

  return (
    // Les 400 premières ms, aucun clic (le doigt posé pendant le clignotement passe à travers)
    <div className="contents" data-snake-fin={armedState ? 'prete' : 'attente'} style={{ pointerEvents: armedState ? 'auto' : 'none' }}>
      <Phone label="Écran du téléphone">
        <Lcd className="w-full" frame={8} radius={20} grid={14} innerClassName="flex flex-col gap-2.5 px-[18px] py-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 font-pixel text-[30px] font-bold leading-[34px] min-[360px]:text-4xl">{won ? 'BRAVO' : 'PERDU'}</h2>
            <CurledSnake className="h-10 w-16 shrink-0" />
          </div>
          <div className="h-0.5" style={{ background: C.encre }} />
          {statRow('SCORE', lcdScore(result.score), true)}
          {statRow('RECORD', lcdScore(shownRecord))}
          {statRow('BOUCHÉES', String(result.eaten))}
          <div className="h-0.5" style={{ background: C.encre }} />
          <div className="text-xs">NIVEAU {result.level}</div>
        </Lcd>
      </Phone>

      <ResultCard result={result} finish={finish} local={local} me={me} prevRank={prevRank} onRetry={onRetry} armed={armed} />

      <div className="flex w-full max-w-[362px] flex-col gap-2.5">
        <button
          ref={replayRef}
          type="button"
          onMouseDown={noMouseFocus}
          onClick={() => { if (armed()) onReplay(); }}
          className={`flex h-[52px] items-center justify-center gap-2 rounded-[14px] font-fut text-[21px] font-extrabold uppercase tracking-[0.06em] text-white ${BTN_BG} ${BTN_FOCUS}`}
          style={greenBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
          Rejouer
        </button>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => { if (armed()) shareSnakeScore(result.score); }}
            className={`flex h-12 items-center justify-center gap-2 rounded-[14px] border text-[15px] font-semibold text-white ${BTN_BG} ${BTN_FOCUS}`}
            style={darkBtn}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></svg>
            Partager
          </button>
          <Link
            to="/snake/classement"
            onClick={(e) => { if (!armed()) e.preventDefault(); }}
            className={`flex h-12 items-center justify-center gap-2 rounded-[14px] border text-[15px] font-semibold text-white ${BTN_BG} ${BTN_FOCUS}`}
            style={darkBtn}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
            Classement
          </Link>
        </div>
        <p className="mt-0.5 text-center text-xs" style={{ color: C.gris }}>Partager envoie ton score avec le lien du jeu.</p>
      </div>
    </div>
  );
}
