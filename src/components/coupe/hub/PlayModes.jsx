import React, { useState } from 'react';
import { BOT_LEVELS } from './coupeFormat';
import { BotIcon, SharedPhoneIcon } from './icons';

/**
 * Les deux modes sans réseau ni points (maquettes « Accueil de la Coupe » et « CoupeAccueilRouge ») :
 * « Contre le salon » (l'ordinateur : Apprenti, Barber, Boss, choisis juste en dessous) et « À deux
 * sur ce téléphone ». Thème stade : icône du salon en blanc, téléphone en rouge ; niveaux ouverts
 * bordés de rouge.
 */
const CARD = 'flex flex-col items-start gap-2 rounded-2xl border bg-[color:var(--coupe-noir2)] p-3.5 text-left text-white hover:bg-[color:var(--coupe-noir3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white';

export default function PlayModes({ onBot, onLocal }) {
  const [levelsOpen, setLevelsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className={`${CARD} ${levelsOpen ? 'border-[color:var(--coupe-rouge-trait)]' : 'border-white/10'}`}
          aria-expanded={levelsOpen}
          aria-controls="coupe-niveaux"
          onClick={() => setLevelsOpen((open) => !open)}
        >
          <BotIcon className="text-white" />
          <span className="font-fut text-[17px] font-bold uppercase leading-[1.05] tracking-[0.03em]">Contre le salon</span>
          <span className="text-xs leading-[1.35] text-[color:var(--coupe-gris)]">Apprenti, Barber, Boss · entraînement sans points</span>
        </button>
        <button type="button" className={`${CARD} border-white/10`} onClick={onLocal}>
          <SharedPhoneIcon className="text-[color:var(--coupe-rouge-vif)]" />
          <span className="font-fut text-[17px] font-bold uppercase leading-[1.05] tracking-[0.03em]">À deux sur ce téléphone</span>
          <span className="text-xs leading-[1.35] text-[color:var(--coupe-gris)]">Posé à plat, chacun son bout · amical</span>
        </button>
      </div>

      {levelsOpen && (
        <div id="coupe-niveaux" role="group" aria-label="Niveau du salon" className="grid grid-cols-3 gap-2">
          {BOT_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => onBot(level.value)}
              className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-[color:var(--coupe-rouge-trait)] bg-[color:var(--coupe-noir2)] px-1 text-center text-white hover:bg-[color:var(--coupe-noir3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="font-fut text-base font-extrabold uppercase leading-none tracking-[0.06em]">{level.label}</span>
              <span className="text-[11px] leading-tight text-[color:var(--coupe-gris)]">{level.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
