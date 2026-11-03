/**
 * Snake du Gang : « Vitesse et options » (/snake/reglages, planche du 2 nov. 2026, `Reglages.dc.html`).
 * Contrat : docs/fonctions/snake-du-gang-contrat.md, sections 0 et 5.
 *
 *  - Vitesse : écran vert (NIVEAU N, allure, points par bouchée) et 9 boutons à barres ; le niveau
 *    est gardé sur l'appareil (`useSnakePrefs`) ;
 *  - Options : « Bips du jeu », « Vibrations » et « Touches 2 4 6 8 » (sur l'appareil ; éteinte, on
 *    tourne en glissant sur le téléphone), « Figurer au classement » (sur le
 *    serveur, `PATCH /snake/settings`, mise à jour optimiste ; grisé avec une phrase pour l'admin,
 *    une fiche barber cachée ou un compte retiré du classement) ;
 *  - « Jouer » ouvre directement la partie (`/snake?jouer=1`, lien `replace`).
 */
import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import SnakeShell from '@/components/snake/SnakeShell';
import Lcd from '@/components/snake/Lcd';
import { SNAKE_COLORS as C } from '@/components/snake/palette';
import { SNAKE_BANNED_TEXT, isSnakeClosed, SNAKE_PAUSED_TEXT } from '@/components/snake/snakeErrors';
import SnakeSwitch from '@/components/snake/pages/SnakeSwitch';
import { rankBlockedText, useSnakeOptIn } from '@/components/snake/pages/useSnakeOptIn';
import { queryFailed } from '@/components/shared/LoadError';
import { useAuth } from '@/lib/AuthContext';
import { LEVEL_MAX, LEVEL_MIN, foodPoints } from '@/lib/snake/engine';
import { useSnakePrefs } from '@/lib/snake/prefs';
import { useSnakeMe } from '@/lib/snake/snakeApi';

const LEVELS = Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, i) => LEVEL_MIN + i);

/** Allure d'un niveau, sur l'écran vert. */
function paceOf(level) {
  if (level <= 3) return 'TRANQUILLE';
  if (level <= 6) return 'CLASSIQUE';
  return 'RAPIDE';
}

const SECTION_TITLE = 'm-0 text-[13px] font-bold uppercase tracking-[0.08em]';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';

/** Une option : libellé, aide et interrupteur (ligne de 56 px au moins). */
function OptionRow({ label, help, children }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <div className="flex min-h-14 items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className="text-[15px] font-semibold">{label}</span>
        <span id={helpId} className="text-xs leading-snug" style={{ color: C.gris }}>{help}</span>
      </div>
      {children({ labelId, helpId })}
    </div>
  );
}

export default function SnakeReglages() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useSnakePrefs();
  const meQuery = useSnakeMe({ enabled: !!user });
  const optIn = useSnakeOptIn();
  const level = prefs.level;

  const me = meQuery.data || null;
  const meFailed = queryFailed(meQuery);
  const blocked = rankBlockedText(me, user?.role, SNAKE_BANNED_TEXT);
  let rankHelp = 'Prénom et initiale seulement.';
  if (blocked) rankHelp = blocked;
  else if (meFailed) rankHelp = isSnakeClosed(meQuery.error) ? SNAKE_PAUSED_TEXT : 'Choix indisponible pour le moment.';

  return (
    <SnakeShell title="Vitesse et options" backTo="/snake" backLabel="Retour au menu du jeu" mainClassName="flex flex-1 flex-col gap-[22px] px-4 pb-5 pt-1.5">
      <section aria-labelledby="snake-vitesse" className="flex flex-col gap-2.5">
        <h2 id="snake-vitesse" className={SECTION_TITLE} style={{ color: C.gris }}>Vitesse</h2>

        <Lcd innerClassName="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: C.encreDouce }}>NIVEAU</span>
            <span className="text-[40px] font-bold leading-9" data-testid="snake-niveau">{level}</span>
          </div>
          <div className="flex flex-col gap-1 text-right">
            <span className="text-sm">{paceOf(level)}</span>
            <span className="text-xs" style={{ color: C.encreDouce }}>{foodPoints(level)} PTS / BOUCHÉE</span>
          </div>
        </Lcd>

        <div className="grid grid-cols-9 gap-1">
          {LEVELS.map((n) => {
            const selected = n === level;
            return (
              <button
                key={n}
                type="button"
                aria-label={`Niveau ${n}`}
                aria-pressed={selected ? 'true' : 'false'}
                onClick={() => setPrefs({ level: n })}
                className={`flex h-16 min-w-0 flex-col items-center justify-end gap-1 rounded-[10px] border-2 pb-1.5 text-white ${FOCUS}`}
                style={{ background: C.carte, borderColor: selected ? C.vertTexte : 'transparent' }}
              >
                <span aria-hidden="true" className="w-2.5 rounded-[2px]" style={{ height: 8 + n * 4, background: n <= level ? C.vertTexte : C.piste }} />
                <span aria-hidden="true" className="font-pixel text-xs leading-none">{n}</span>
              </button>
            );
          })}
        </div>
        <p className="m-0 text-[13px] leading-[1.4]" style={{ color: C.gris }}>
          Plus c’est rapide, plus chaque bouchée rapporte. Pas de murs : le serpent ressort de l’autre côté de l’écran.
        </p>
      </section>

      <section aria-labelledby="snake-options" className="flex flex-col gap-1">
        <h2 id="snake-options" className={`${SECTION_TITLE} mb-1`} style={{ color: C.gris }}>Options</h2>
        <OptionRow label="Bips du jeu" help="Un bip rétro à chaque bouchée.">
          {({ labelId, helpId }) => (
            <SnakeSwitch checked={prefs.bips} onChange={(v) => setPrefs({ bips: v })} labelledBy={labelId} describedBy={helpId} />
          )}
        </OptionRow>
        <OptionRow label="Vibrations" help="Une petite secousse quand tu manges ou perds.">
          {({ labelId, helpId }) => (
            <SnakeSwitch checked={prefs.vibrations} onChange={(v) => setPrefs({ vibrations: v })} labelledBy={labelId} describedBy={helpId} />
          )}
        </OptionRow>
        <OptionRow label="Touches 2 4 6 8" help="Des touches sous l’écran pour tourner, en plus du glisser.">
          {({ labelId, helpId }) => (
            <SnakeSwitch checked={prefs.touches} onChange={(v) => setPrefs({ touches: v })} labelledBy={labelId} describedBy={helpId} />
          )}
        </OptionRow>
        <OptionRow label="Figurer au classement" help={rankHelp}>
          {({ labelId, helpId }) => (
            <SnakeSwitch
              checked={!blocked && me?.opt_in === true}
              onChange={(v) => optIn.mutate(v)}
              disabled={!me || !!blocked || optIn.isPending}
              labelledBy={labelId}
              describedBy={helpId}
            />
          )}
        </OptionRow>
        {meFailed && !isSnakeClosed(meQuery.error) && (
          <button
            type="button"
            onClick={() => meQuery.refetch()}
            className={`self-start min-h-[44px] rounded-lg text-left text-xs font-semibold underline underline-offset-2 ${FOCUS}`}
            style={{ color: C.vertTexte }}
          >
            Réessayer
          </button>
        )}
      </section>

      <Link
        to="/snake?jouer=1"
        replace
        className={`mt-auto flex h-[52px] shrink-0 items-center justify-center rounded-[14px] font-fut text-[21px] font-extrabold uppercase tracking-[0.06em] text-white hover:brightness-110 ${FOCUS}`}
        style={{ background: C.vert }}
      >
        Jouer
      </Link>
    </SnakeShell>
  );
}
