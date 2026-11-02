/**
 * Snake du Gang : « Comment jouer » (/snake/regles, planche du 2 nov. 2026, `CommentJouer.dc.html`).
 * Contrat : docs/fonctions/snake-du-gang-contrat.md, sections 0, 1 et 5.
 *
 * Les chiffres viennent du moteur (`src/lib/snake/engine.js`), jamais écrits en dur : niveaux,
 * bestiole toutes les `BONUS_EVERY` bouchées, points d'une bestiole (`bonusPoints`, attrapée tout de
 * suite ou au dernier pas de ses `BONUS_STEPS`) au niveau choisi sur cet appareil.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import SnakeShell from '@/components/snake/SnakeShell';
import { SNAKE_COLORS as C, lcdBackground } from '@/components/snake/palette';
import { BUG_NAMES, BugSprite, DiamondSprite, HeadSprite } from '@/components/snake/pages/sprites';
import { BONUS_EVERY, BONUS_STEPS, KINDS, LEVEL_MAX, LEVEL_MIN, bonusPoints } from '@/lib/snake/engine';
import { useSnakePrefs } from '@/lib/snake/prefs';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3DBE7E]';
const TILE = lcdBackground(7);

/** Case de 6 px du serpent dans une vignette (`hollow` : la case mordue, en creux). */
function Cell({ x, y, hollow = false }) {
  return (
    <span
      className="absolute box-border h-1.5 w-1.5"
      style={{ left: x, top: y, background: hollow ? 'transparent' : C.encre, border: hollow ? `1px solid ${C.encre}` : undefined }}
    />
  );
}

/** Vignette d'écran vert de 52 px, à gauche de chaque règle. */
function Tile({ children, center = false }) {
  return (
    <span
      aria-hidden="true"
      className={`relative h-[52px] w-[52px] shrink-0 rounded-xl ${center ? 'grid place-items-center' : 'block'}`}
      style={TILE}
    >
      {children}
    </span>
  );
}

/** Une règle : vignette, titre, texte. */
function Rule({ tile, title, children }) {
  return (
    <div className="flex items-start gap-3.5">
      {tile}
      <div className="flex min-w-0 flex-col gap-[3px]">
        <h2 className="m-0 text-base font-bold text-white">{title}</h2>
        <p className="m-0 text-sm leading-[1.4]" style={{ color: C.gris }}>{children}</p>
      </div>
    </div>
  );
}

// Serpent qui se mord : queue en bas, tour par la droite, tête qui revient sur la case en creux
const BITE_CELLS = [[9, 36], [16, 36], [23, 36], [30, 36], [37, 36], [37, 29], [37, 22], [37, 15], [30, 15], [23, 15], [23, 22]];
// Pavé de touches : 2, 4, 5 (en creux), 6, 8
const PAD_KEYS = [[20, 6], [6, 20], [20, 20, true], [34, 20], [20, 34]];

export default function SnakeRegles() {
  const [prefs] = useSnakePrefs();
  const level = prefs.level;

  return (
    <SnakeShell title="Comment jouer" backTo="/snake" backLabel="Retour au menu du jeu" mainClassName="flex flex-1 flex-col gap-[15px] px-4 pb-5 pt-1">
      <section>
        <Rule
          title="Le serpent avance tout seul"
          tile={(
            <Tile>
              {[8, 15, 22, 29].map((x) => <Cell key={x} x={x} y={23} />)}
              <HeadSprite className="absolute" style={{ left: 37, top: 20 }} fill={C.encre} />
            </Tile>
          )}
        >
          Tu choisis seulement la direction. Pas de demi-tour : il ne peut pas repartir sur lui-même.
        </Rule>
      </section>

      <section>
        <Rule title="Mange les points" tile={<Tile center><DiamondSprite size={20} fill={C.encre} /></Tile>}>
          Chaque bouchée te fait grandir d’une case et rapporte ton niveau en points : plus tu joues vite (niveaux {LEVEL_MIN} à {LEVEL_MAX}), plus ça rapporte.
        </Rule>
      </section>

      <section className="flex flex-col gap-2">
        <Rule title="Attrape les bestioles" tile={<Tile center><BugSprite kind="araignee" width={42} height={21} fill={C.encre} /></Tile>}>
          Toutes les {BONUS_EVERY} bouchées, une bestiole apparaît avec un compte à rebours en haut de l’écran. Plus tu l’attrapes vite, plus elle rapporte : au niveau {level}, de {bonusPoints(level, 1)} à {bonusPoints(level, BONUS_STEPS)} points. Elle ne te fait pas grandir.
        </Rule>
        <ul aria-label="Les bestioles" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0 min-[375px]:pl-[66px]">
          {KINDS.map((kind) => (
            <li key={kind} className="flex min-w-0 flex-col items-center gap-[3px]">
              <span aria-hidden="true" className="grid h-[30px] w-full place-items-center rounded-[8px]" style={TILE}>
                <BugSprite kind={kind} width={28} height={14} fill={C.encre} />
              </span>
              <span className="max-w-full break-words text-center text-xs" style={{ color: C.grisClair }}>{BUG_NAMES[kind]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <Rule
          title="Ne te mords pas la queue"
          tile={(
            <Tile>
              {BITE_CELLS.map(([x, y]) => <Cell key={`${x}-${y}`} x={x} y={y} />)}
              <Cell x={23} y={29} hollow />
            </Tile>
          )}
        >
          C’est perdu. Il n’y a pas de murs : quand tu sors d’un côté de l’écran, tu reviens par l’autre.
        </Rule>
      </section>

      <section>
        <Rule
          title="Les commandes"
          tile={(
            <Tile>
              {PAD_KEYS.map(([x, y, hollow]) => (
                <span
                  key={`${x}-${y}`}
                  className="absolute box-border h-3 w-3 rounded-[3px]"
                  style={{ left: x, top: y, background: hollow ? 'transparent' : C.encre, border: hollow ? `2px solid ${C.encre}` : undefined }}
                />
              ))}
            </Tile>
          )}
        >
          Glisse ton doigt sur l’écran, ou touche 2 (haut), 4 (gauche), 6 (droite), 8 (bas). 5 met en pause.
          <span className="hidden [@media(hover:hover)_and_(pointer:fine)]:inline"> Au clavier : les flèches, et Espace pour la pause.</span>
        </Rule>
      </section>

      <p className="m-0 rounded-xl border px-3 py-2.5 text-[13px] leading-[1.4]" style={{ background: C.carte, borderColor: C.carteBord, color: C.gris }}>
        En plus : ton meilleur score du mois compte au classement du salon. Nouvelle saison chaque 1er du mois.
      </p>

      <Link
        to="/snake"
        className={`mt-auto flex h-[52px] shrink-0 items-center justify-center rounded-[14px] font-fut text-[21px] font-extrabold uppercase tracking-[0.06em] text-white hover:brightness-110 ${FOCUS}`}
        style={{ background: C.vert }}
      >
        J’ai compris
      </Link>
    </SnakeShell>
  );
}
