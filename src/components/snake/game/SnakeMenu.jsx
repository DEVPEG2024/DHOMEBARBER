import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { queryFailed } from '@/components/shared/LoadError';
import { ofSeason, rankText } from '@/lib/snake/format';
import Lcd from '../Lcd';
import { SNAKE_COLORS as C } from '../palette';
import { isSnakeClosed, SNAKE_PAUSED_TEXT } from '../snakeErrors';
import Phone from './Phone';
import Keypad, { Key, DigitArrow, DigitWord, KeyWord } from './Keypad';
import { MenuSnake } from './PixelArt';

/**
 * Menu du Snake du Gang dans l'écran vert (planche `Main.dc.html`) : Nouvelle partie, Vitesse,
 * Classement, Comment jouer. 2 et 8 (ou les flèches) déplacent la sélection, 5 valide ; toucher
 * une ligne l'ouvre directement. Sous le téléphone : le record et la place du mois.
 */

const ITEM_CLASS = 'flex h-11 w-full items-center gap-2.5 rounded px-2.5 text-left font-pixel text-[13px] no-underline outline-none min-[375px]:text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3DBE7E]';

function RecordLine({ me }) {
  if (queryFailed(me)) {
    if (isSnakeClosed(me.error)) return <p className="text-[13px]" style={{ color: C.gris }}>{SNAKE_PAUSED_TEXT}</p>;
    return (
      <p className="flex flex-wrap items-center justify-center gap-x-1 text-[13px]" style={{ color: C.gris }}>
        Ton record n’a pas pu être chargé.
        <button
          type="button"
          onClick={() => me.refetch()}
          className="inline-flex min-h-[44px] items-center px-1 font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3DBE7E]"
          style={{ color: C.vertTexte }}
        >
          Réessayer
        </button>
      </p>
    );
  }
  const data = me?.data;
  // En attente : une ligne vide de la même hauteur (rien ne saute à l'arrivée du record)
  if (!data) return <p className="text-[15px]" aria-hidden="true">&nbsp;</p>;
  if (!data.record) {
    return <p className="text-[15px] text-white">Pas encore de record : lance ta première partie !</p>;
  }
  const place = rankText(data.rank);
  return (
    <p className="text-[15px] text-white">
      Ton record <strong className="font-pixel font-bold" style={{ color: C.or }}>{data.record.score}</strong>
      {place && (
        <>
          {' · '}
          <strong>{place}</strong> {ofSeason(data.season)}
        </>
      )}
    </p>
  );
}

export default function SnakeMenu({ level, me, onPlay, autoFocus = false }) {
  const navigate = useNavigate();
  const [sel, setSel] = useState(0);
  const itemRefs = useRef([]);
  const items = [
    { id: 'jouer', label: 'Nouvelle partie', action: onPlay },
    { id: 'vitesse', label: `Vitesse : niveau ${level}`, to: '/snake/reglages' },
    { id: 'classement', label: 'Classement', to: '/snake/classement' },
    { id: 'regles', label: 'Comment jouer', to: '/snake/regles' },
  ];
  const count = items.length;

  // Les gestionnaires du clavier lisent toujours la dernière version
  const latest = useRef(null);
  latest.current = { sel, items };

  const activate = (i) => {
    const it = latest.current.items[i];
    if (!it) return;
    if (it.action) it.action();
    else navigate(it.to);
  };

  const move = (d) => {
    const next = (latest.current.sel + d + count) % count;
    latest.current.sel = next;
    setSel(next);
    // Focus clavier déjà dans le menu : il suit la sélection (Entrée ouvre ce qui est surligné)
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && itemRefs.current.includes(active)) {
      try { itemRefs.current[next]?.focus({ preventScroll: true }); } catch { /* focus refusé */ }
    }
  };

  useEffect(() => {
    if (!autoFocus) return;
    try { itemRefs.current[0]?.focus({ preventScroll: true }); } catch { /* focus refusé */ }
  }, [autoFocus]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'ArrowUp' || k === '2' || k === 'z' || k === 'w') {
        e.preventDefault();
        move(-1);
      } else if (k === 'ArrowDown' || k === '8' || k === 's') {
        e.preventDefault();
        move(1);
      } else if (k === '5') {
        e.preventDefault();
        if (!e.repeat) activate(latest.current.sel);
      } else if ((k === 'Enter' || k === ' ') && !(t && t.closest && t.closest('button, a'))) {
        e.preventDefault();
        if (!e.repeat) activate(latest.current.sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `move` et `activate` lisent l'état par `latest`
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-5" data-snake-menu="">
      <Phone>
        <Lcd className="w-full" frame={8} radius={20} grid={14} innerClassName="flex flex-col px-3 pb-2 pt-3">
          <div className="flex h-[82px] items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-pixel text-[32px] font-bold leading-[32px] tracking-[0.02em] min-[375px]:text-[40px] min-[375px]:leading-[38px]">SNAKE</div>
              <div className="mt-2 font-pixel text-[13px] tracking-[0.32em]">DU GANG</div>
            </div>
            <MenuSnake className="h-[41px] w-[72px] shrink-0 min-[375px]:h-16 min-[375px]:w-28" />
          </div>
          <nav aria-label="Menu du jeu" className="flex flex-col">
            {items.map((it, i) => {
              const on = i === sel;
              const style = { background: on ? C.encre : 'transparent', color: on ? C.lcd : C.encre };
              const inner = (
                <>
                  <span aria-hidden="true" className="w-2.5 shrink-0">{on ? '>' : ''}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  <span aria-hidden="true">&gt;</span>
                </>
              );
              const common = {
                ref: (el) => { itemRefs.current[i] = el; },
                onFocus: () => setSel(i),
                className: ITEM_CLASS,
                style,
                'aria-current': on ? 'true' : undefined,
              };
              return it.to ? (
                <Link key={it.id} to={it.to} {...common}>{inner}</Link>
              ) : (
                <button key={it.id} type="button" onClick={() => activate(i)} {...common}>{inner}</button>
              );
            })}
          </nav>
        </Lcd>
        <Keypad
          slots={[
            <Key key="jeux" to="/jeux"><KeyWord>Jeux</KeyWord></Key>,
            <Key key="haut" label="Haut (2)" fast onPress={() => move(-1)}><DigitArrow digit="2" arrow="up" /></Key>,
            null,
            <Key key="gauche" label="Gauche (4)" disabled><DigitArrow digit="4" arrow="left" /></Key>,
            <Key key="ok" label="5 OK (valider)" green onPress={() => activate(latest.current.sel)}><DigitWord word="OK" /></Key>,
            <Key key="droite" label="Droite (6)" disabled><DigitArrow digit="6" arrow="right" /></Key>,
            null,
            <Key key="bas" label="Bas (8)" fast onPress={() => move(1)}><DigitArrow digit="8" arrow="down" /></Key>,
            null,
          ]}
        />
      </Phone>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <RecordLine me={me} />
        <p className="text-[13px]" style={{ color: C.gris }}>2 et 8 pour choisir, 5 pour valider. Ou touche une ligne.</p>
      </div>
    </div>
  );
}
