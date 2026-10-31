import React, { useRef } from 'react';
import { Info } from 'lucide-react';
import { useCoupeRulesV2 } from '@/lib/coupe/coupeApi';
import { COUPE_COLORS } from '../palette';
import { BOT_LEVELS } from './coupeFormat';
import { BotIcon, GlobeIcon, SharedPhoneIcon } from './icons';
import RulesLink from './RulesSheet';

/**
 * Accueil de la Coupe repensé (planche validée le 29 oct. 2026 au soir :
 * https://claude.ai/artifact/7SCyeV4pPNSeHtUzmZvW2m) : une question à la fois.
 *  - `StepTitle` : « 1. Comment tu joues ? », « 2. Contre qui ? » (numéro dans un rond rouge) ;
 *  - `ModePicker` : trois grandes cartes, En ligne, Contre le salon, À deux (groupe de boutons
 *    radio, flèches du clavier), puis « Règles du match » (règlement v2, RulesSheet.jsx) ;
 *  - `BotPanel` : « Ton niveau » (Apprenti, Barber, Boss) et un seul bouton Jouer ;
 *  - `LocalPanel` : le téléphone posé à plat, la règle en trois lignes et le bouton Jouer.
 * Le choix de l'adversaire en ligne : OpponentTabs.jsx.
 */
export const MODES = ['online', 'bot', 'local'];

export function StepTitle({ n, id, children }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2.5 font-fut text-[22px] font-extrabold uppercase leading-none tracking-[0.03em]">
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-[color:var(--coupe-rouge)] text-base text-white" aria-hidden="true">{n}</span>
      {children}
    </h2>
  );
}

/** Info en une ligne sous un choix (icône « i » grise). */
export function Hint({ children }) {
  return (
    <p className="mt-2.5 flex items-start gap-2 px-0.5 text-[12.5px] leading-snug text-[color:var(--coupe-gris)]">
      <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// Groupe de boutons radio : un seul arrêt de tabulation, les flèches changent le choix
function useRadioKeys(values, value, onChange) {
  const refs = useRef([]);
  const onKeyDown = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = Math.max(0, values.indexOf(value));
    const next = (i + step + values.length) % values.length;
    onChange(values[next]);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

// Choisi : trait rouge de 2 px (bordure + anneau intérieur), sans changer la taille de la carte
const SELECTED = 'border border-[color:var(--coupe-rouge)] ring-1 ring-inset ring-[color:var(--coupe-rouge)] bg-[color:var(--coupe-rouge-voile)]';
const IDLE = 'border border-white/12 bg-[color:var(--coupe-noir2)] hover:bg-[color:var(--coupe-noir3)]';

export function ModePicker({ value, onChange, eligible = true, labelledBy }) {
  const cards = [
    { value: 'online', Icon: GlobeIcon, title: 'En ligne', text: `Chacun son téléphone · ${eligible ? 'points en jeu' : 'amical'}` },
    { value: 'bot', Icon: BotIcon, title: 'Contre le salon', text: 'Entraînement · 3 niveaux' },
    { value: 'local', Icon: SharedPhoneIcon, title: 'À deux', text: 'Sur ce téléphone · amical' },
  ];
  const { refs, onKeyDown } = useRadioKeys(MODES, value, onChange);
  return (
    <>
      <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2" onKeyDown={onKeyDown}>
        {cards.map((c, i) => {
          const on = value === c.value;
          return (
            <button
              key={c.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(c.value)}
              className={`flex min-h-[112px] min-w-0 flex-col items-start gap-2 rounded-2xl p-3 text-left text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${on ? SELECTED : IDLE}`}
            >
              <c.Icon size={24} strokeWidth={2} className={on ? 'text-[color:var(--coupe-rouge-vif)]' : 'text-[color:var(--coupe-gris-clair)]'} />
              <span className="font-fut text-[19px] font-extrabold uppercase leading-none tracking-[0.03em] [overflow-wrap:anywhere]">{c.title}</span>
              <span className={`text-xs leading-[1.3] ${on ? 'text-[color:var(--coupe-gris-clair)]' : 'text-[color:var(--coupe-gris)]'}`}>{c.text}</span>
            </button>
          );
        })}
      </div>
      {/* Règlement v2 annoncé par le serveur : le résumé des règles, dans un volet */}
      <RulesLink className="mt-1.5" />
    </>
  );
}

const PLAY = 'mt-3.5 min-h-[54px] w-full rounded-[14px] bg-[color:var(--coupe-rouge)] font-fut text-xl font-extrabold uppercase leading-none tracking-[0.06em] text-white transition-transform motion-safe:active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** Jauge de difficulté : 1 à 3 barres rouges sur 3. */
function Bars({ n }) {
  return (
    <span className="flex h-[22px] w-[26px] shrink-0 items-end gap-[3px]" aria-hidden="true">
      {[8, 14, 22].map((h, i) => (
        <span key={h} className="w-1.5 rounded-sm" style={{ height: h, background: i < n ? COUPE_COLORS.rougeVif : COUPE_COLORS.grisSombre }} />
      ))}
    </span>
  );
}

export function BotPanel({ level, onLevel, onPlay, labelledBy }) {
  const values = BOT_LEVELS.map((l) => l.value);
  const { refs, onKeyDown } = useRadioKeys(values, level, onLevel);
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-2" onKeyDown={onKeyDown}>
        {BOT_LEVELS.map((l, i) => {
          const on = level === l.value;
          return (
            <button
              key={l.value}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onLevel(l.value)}
              className={`flex min-h-[64px] w-full items-center gap-3.5 rounded-[14px] px-3.5 py-3 text-left text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${on ? SELECTED : IDLE}`}
            >
              <Bars n={l.bars} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-fut text-xl font-extrabold uppercase leading-none tracking-[0.03em]">{l.label}</span>
                <span className={`text-[12.5px] leading-snug ${on ? 'text-[color:var(--coupe-gris-clair)]' : 'text-[color:var(--coupe-gris)]'}`}>{l.hint}</span>
              </span>
              <span
                className="h-[22px] w-[22px] shrink-0 rounded-full border-solid"
                style={{ borderWidth: on ? 7 : 2, borderColor: on ? COUPE_COLORS.rouge : COUPE_COLORS.grisSombre }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <button type="button" className={PLAY} onClick={() => onPlay(level)}>Jouer contre le salon</button>
      <Hint>Sans réseau et sans points : pour t’entraîner avant les vrais matchs.</Hint>
    </div>
  );
}

/** Le téléphone posé à plat, vu du dessus : terrain, ligne médiane, les deux pions. */
function FlatPhone() {
  return (
    <svg width="96" height="171" viewBox="0 0 96 171" className="shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="94" height="169" rx="13" fill={COUPE_COLORS.noir3} stroke="rgba(255,255,255,.15)" />
      <rect x="7" y="7" width="82" height="157" rx="8" fill="#1f4a2a" />
      <g fill="none" stroke="rgba(236,248,240,.7)" strokeWidth="1.2">
        <rect x="11" y="11" width="74" height="149" rx="1" />
        <path d="M11 85.5h28M57 85.5h28" />
        <circle cx="48" cy="85.5" r="9" />
      </g>
      <circle cx="48" cy="28" r="8" fill={COUPE_COLORS.blancCasse} stroke="#b9bcc2" strokeWidth="3" />
      <circle cx="48" cy="143" r="8" fill={COUPE_COLORS.rouge} stroke={COUPE_COLORS.rougeSombre} strokeWidth="3" />
    </svg>
  );
}

export function LocalPanel({ onPlay }) {
  // Règlement v2 annoncé par le serveur : premier à 5 buts (à deux aussi)
  const rulesV2 = useCoupeRulesV2();
  const steps = [
    ['Téléphone à plat', 'Posé sur la table, entre vous deux.'],
    ['Chacun son bout', 'Ton doigt sur ton pion, dans ta moitié.'],
    [`Premier à ${rulesV2 ? 5 : 3} buts`, 'Match amical, sans points.'],
  ];
  return (
    <div>
      <div className="flex items-center gap-[18px] rounded-2xl border border-white/10 bg-[color:var(--coupe-noir2)] p-4">
        <FlatPhone />
        <ol className="flex min-w-0 flex-col gap-3 text-[13.5px] leading-snug text-[color:var(--coupe-gris-clair)]">
          {steps.map(([t, d]) => (
            <li key={t}>
              <span className="block font-fut text-[17px] font-extrabold uppercase leading-tight text-white">{t}</span>
              {d}
            </li>
          ))}
        </ol>
      </div>
      <button type="button" className={PLAY} onClick={onPlay}>Jouer à deux</button>
    </div>
  );
}
