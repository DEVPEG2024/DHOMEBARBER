import React, { useState } from 'react';
import { BOT_LEVELS } from './coupeFormat';
import { BotIcon, SharedPhoneIcon } from './icons';

/**
 * Les deux modes sans réseau ni points (maquette « Accueil de la Coupe ») : « Contre le salon »
 * (l'ordinateur : Apprenti, Barber, Boss, choisis juste en dessous) et « À deux sur ce téléphone ».
 */
const CARD = 'flex flex-col items-start gap-2 rounded-2xl border border-white/8 bg-[#12171a] p-3.5 text-left text-[#eef3ef] transition-colors hover:bg-[#161c20] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ebc15e]';

export default function PlayModes({ onBot, onLocal }) {
  const [levelsOpen, setLevelsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className={`${CARD} ${levelsOpen ? 'border-[#86adff]/50' : ''}`}
          aria-expanded={levelsOpen}
          aria-controls="coupe-niveaux"
          onClick={() => setLevelsOpen((open) => !open)}
        >
          <BotIcon className="text-[#86adff]" />
          <span className="font-fut text-[17px] font-bold uppercase leading-[1.05] tracking-[0.03em]">Contre le salon</span>
          <span className="text-xs leading-[1.35] text-[#9db0a6]">Apprenti, Barber, Boss · entraînement sans points</span>
        </button>
        <button type="button" className={CARD} onClick={onLocal}>
          <SharedPhoneIcon className="text-[#ebc15e]" />
          <span className="font-fut text-[17px] font-bold uppercase leading-[1.05] tracking-[0.03em]">À deux sur ce téléphone</span>
          <span className="text-xs leading-[1.35] text-[#9db0a6]">Posé à plat, chacun son bout · amical</span>
        </button>
      </div>

      {levelsOpen && (
        <div id="coupe-niveaux" role="group" aria-label="Niveau du salon" className="grid grid-cols-3 gap-2">
          {BOT_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => onBot(level.value)}
              className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl border border-[#86adff]/30 bg-[#12171a] px-1 text-center text-[#eef3ef] transition-colors hover:bg-[#161c20] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ebc15e]"
            >
              <span className="font-fut text-base font-extrabold uppercase leading-none tracking-[0.06em]">{level.label}</span>
              <span className="text-[11px] leading-tight text-[#9db0a6]">{level.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
