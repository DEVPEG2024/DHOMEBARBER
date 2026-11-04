import React, { useState } from 'react';
import { Ban, Bell, Check, Eye, Loader2, Share2 } from 'lucide-react';
import { HERO_BUTTON } from '../hub/CoupeShell';
import { num } from '../hub/coupeFormat';
import { BTN_RED, CARD, FitTitle, LABEL, LINK_QUIET, TPawn, TournamentShell } from './ui';
import UnregisterConfirm from './UnregisterConfirm';
import { clockOf, dateLine, durationMin, msOf, playerName } from './tournoiFormat';
import { TOURNAMENT_CHECKIN_MS } from '@/lib/coupe/coupeApi';

/**
 * Page d'un tournoi avant la présence (planche validée le 3 nov. 2026, écran 2) : le stade et le
 * logo, le nom et la date, le format, le déroulé de la soirée, les inscrits (places vides en
 * pointillés) et la liste d'attente ; en bas, collé, « S'inscrire » (ou la liste d'attente quand
 * c'est complet). Inscrit : ce qui est noté sous la date, « Me désinscrire » en lien discret en
 * bas de page (avec confirmation), sans pied collé (rien ne recouvre les inscrits, même à 320 ×
 * 568). Retiré par le salon : il le lit, sans bouton.
 * Spectateurs (`spectatorsOn` : `features.coupeSpectators`) : s'inscrire, c'est accepter d'être
 * regardé ; la page le dit (contrat docs/fonctions/coupe-spectateurs-contrat.md, section 0.2).
 */
function Info({ title, children, gold = false }) {
  return (
    <div className={`${CARD} flex flex-col gap-1 rounded-[14px] px-3 py-2.5`}>
      <span className="text-[11px] text-[color:var(--coupe-gris)]">{title}</span>
      <span className={`text-[13px] font-semibold leading-snug ${gold ? 'text-[color:var(--coupe-or)]' : ''}`}>{children}</span>
    </div>
  );
}

function Step({ time, children }) {
  return (
    <li className="flex items-center gap-3 text-[13px]">
      <b className="w-[46px] shrink-0 font-fut text-base font-bold text-[color:var(--coupe-or)]">{time}</b>
      <span>{children}</span>
    </li>
  );
}

/** Joueurs inscrits (hors liste d'attente) et en attente, dans l'ordre d'inscription. */
export function splitPlayers(t) {
  const players = Array.isArray(t?.players) ? t.players.filter(Boolean) : [];
  return { inPlayers: players.filter((p) => !p.waiting), waitingPlayers: players.filter((p) => p.waiting) };
}

/** Retiré du tournoi par le salon : il ne peut plus s'y inscrire (le serveur répond 403 `removed`). */
export const isRemoved = (t) => t?.me?.status === 'removed';

/** « S'inscrire » (ou « Rejoindre la liste d'attente » quand c'est complet). */
export function RegisterButton({ t, busy, onRegister }) {
  const size = num(t.size) || 16;
  const { inPlayers } = splitPlayers(t);
  const full = inPlayers.length >= size;
  return (
    <button type="button" className={BTN_RED} onClick={onRegister} disabled={!!busy}>
      {busy === 'register' && <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />}
      {full ? 'Rejoindre la liste d’attente' : 'S’inscrire'}
    </button>
  );
}

/** « Me désinscrire » : lien discret, puis confirmation. */
export function UnregisterLink({ t, busy, onUnregister, className = '' }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button type="button" className={`${LINK_QUIET} ${className}`} onClick={() => setConfirm(true)} disabled={!!busy}>
        {busy === 'unregister' && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
        Me désinscrire
      </button>
      <UnregisterConfirm
        open={confirm}
        name={t.name}
        waiting={!!t.me?.waiting}
        onCancel={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); onUnregister(); }}
      />
    </>
  );
}

/** Mention des spectateurs à l'inscription (rien sans `features.coupeSpectators`). */
export const SPECTATORS_NOTE = 'Les matchs du tournoi sont ouverts aux spectateurs et peuvent passer sur l’écran du salon.';

export function SpectatorsNote({ className = '' }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-snug text-[color:var(--coupe-gris-clair)] ${className}`}>
      <Eye className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--coupe-gris)]" aria-hidden="true" />
      <span>{SPECTATORS_NOTE}</span>
    </p>
  );
}

/** Retiré par le salon (à la place de « S'inscrire »). */
export function RemovedNote() {
  return (
    <p role="status" className="flex items-center justify-center gap-2 rounded-[14px] border border-white/12 bg-white/4 px-3 py-3 text-center text-sm font-semibold text-[color:var(--coupe-gris-clair)]">
      <Ban className="h-4 w-4 shrink-0 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
      Le salon t’a retiré de ce tournoi.
    </p>
  );
}

export default function RegistrationView({ t, busy, offline = false, spectatorsOn = false, onBack, onShare, onRegister, onUnregister }) {
  const size = num(t.size) || 16;
  const starts = msOf(t.starts_at);
  const from = msOf(t.checkin_from) ?? (starts == null ? null : starts - TOURNAMENT_CHECKIN_MS);
  const minutes = durationMin(size);
  const { inPlayers, waitingPlayers } = splitPlayers(t);
  const full = inPlayers.length >= size;
  const empty = Math.max(0, size - inPlayers.length);
  const me = t.me || {};
  const removed = isRemoved(t);
  const reminder = (
    <p className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--coupe-gris)]">
      <Bell className="h-3.5 w-3.5" aria-hidden="true" />
      Rappel 30 min avant le début
    </p>
  );

  return (
    <TournamentShell
      hero
      onBack={onBack}
      offline={offline}
      action={(
        <button type="button" onClick={onShare} aria-label="Partager le tournoi" className={`${HERO_BUTTON} border border-white/[.18] text-white`}>
          <Share2 className="h-[19px] w-[19px]" aria-hidden="true" />
        </button>
      )}
      footer={me.registered || removed ? null : (
        // Seul « S'inscrire » reste collé en bas (un bouton et le rappel : ~100 px, même à 320 × 568)
        <div className="sticky bottom-0 z-10 flex flex-col items-center gap-2.5 px-4 pt-3.5" style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(180deg, rgba(11,11,12,0), #0b0b0c 30%)' }}>
          <RegisterButton t={t} busy={busy} onRegister={onRegister} />
          {reminder}
        </div>
      )}
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className={LABEL}>{full ? 'Tournoi · complet, liste d’attente ouverte' : 'Tournoi · inscriptions ouvertes'}</span>
          <FitTitle className="font-fut text-[38px] font-extrabold uppercase leading-none tracking-[0.03em] [text-wrap:balance]">
            {t.name}
          </FitTitle>
          <p className="font-semibold">{dateLine(starts)}</p>
        </div>

        {removed && <RemovedNote />}
        {me.registered && (
          <div className="flex flex-col gap-2">
            <p role="status" className="flex items-center justify-center gap-2 rounded-[14px] border border-[color:var(--coupe-or-bord)] bg-[rgba(235,193,94,.08)] px-3 py-2.5 text-center text-sm font-semibold text-[color:var(--coupe-or)]">
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              {me.waiting
                ? 'Tu es sur la liste d’attente : tu passes si un inscrit ne confirme pas sa présence.'
                : `Tu es inscrit : confirme ta présence à partir de ${clockOf(from)}.`}
            </p>
            {reminder}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Info title="Format">{size} joueurs, élimination directe</Info>
          <Info title="Durée">~{minutes} min, fini vers {clockOf(starts + minutes * 60_000)}</Info>
          <Info title="Chaque match">Premier à 5, tirs au but si égalité</Info>
          <Info title="Au bout" gold>Trophée et palmarès</Info>
        </div>
        {spectatorsOn && <SpectatorsNote className="px-1" />}

        <ol aria-label="Déroulé" className="flex flex-col gap-2 px-1 py-0.5">
          <Step time={clockOf(from)}>Tu confirmes ta présence dans l’app</Step>
          <Step time={clockOf(starts)}>Tirage au sort en direct</Step>
          <Step time={clockOf(starts + 60_000)}>Les matchs s’enchaînent, le tien t’attend ici</Step>
          <Step time={`~${clockOf(starts + minutes * 60_000)}`}>Finale et remise du trophée</Step>
        </ol>

        <section aria-labelledby="coupe-tournoi-inscrits" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 id="coupe-tournoi-inscrits" className="text-[15px] font-bold">Inscrits</h2>
            <span className="text-[13px] text-[color:var(--coupe-gris)]"><b className="text-white">{inPlayers.length}</b> / {size}</span>
          </div>
          <ul aria-label="Joueurs inscrits" className="flex flex-wrap gap-1.5">
            {inPlayers.map((p) => (
              <li key={p.key_hash}>
                <TPawn player={p} size={34} />
                <span className="sr-only">{playerName(p)}</span>
              </li>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <li key={`vide-${i}`} aria-hidden="true"><TPawn empty size={34} /></li>
            ))}
          </ul>
          {waitingPlayers.length > 0 && (
            <p className="text-xs text-[color:var(--coupe-gris)]">
              Liste d’attente : <span className="text-white">{waitingPlayers.map((p) => playerName(p)).join(', ')}</span>
            </p>
          )}
        </section>

        {me.registered && <UnregisterLink t={t} busy={busy} onUnregister={onUnregister} className="mt-2" />}
      </div>
    </TournamentShell>
  );
}
