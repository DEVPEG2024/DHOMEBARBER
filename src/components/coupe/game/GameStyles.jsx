import React from 'react';

/*
 * Styles de l'écran de jeu de La Coupe du Gang, préfixés « cdg- » : ceux du prototype validé
 * (docs/prototypes/coupe-du-gang.html) et des maquettes « Match en ligne », « Fin du match » et
 * « Défi reçu » (https://claude.ai/artifact/6sEgcJPvzCvPtBQsGPP3vU). Le jeu reste sombre quel que
 * soit le thème de l'app (stade de nuit). Animations seulement sans « mouvement réduit ».
 */
export const GAME_CSS = `
.cdg-root { --cdg-display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif; --cdg-body: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --cdg-gold: #ebc15e; --cdg-rival: #86adff; --cdg-muted: #9db0a6; --cdg-fg: #eef3ef; --cdg-turf: #33b574; --cdg-warn: #ff9d4d;
  font-family: var(--cdg-body); color: var(--cdg-fg); background: #05080a; color-scheme: dark;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.cdg-root button { -webkit-tap-highlight-color: transparent; }
.cdg-root button:focus-visible, .cdg-root input:focus-visible, .cdg-root textarea:focus-visible { outline: 2px solid var(--cdg-gold); outline-offset: 2px; }

.cdg-hud { position: relative; display: flex; align-items: center; gap: 8px; height: 56px; flex: none; }
.cdg-hud-label { flex: 1; min-width: 0; margin: 0; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font: 700 15px/1.1 var(--cdg-display); letter-spacing: .12em; text-transform: uppercase; color: var(--cdg-muted); }
.cdg-icon { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid rgba(255, 255, 255, .14);
  background: rgba(5, 9, 7, .62); color: var(--cdg-fg); display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-ping { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 58px; flex: none;
  font: 600 12px/1 var(--cdg-body); font-variant-numeric: tabular-nums; color: #6fd39f; }
.cdg-ping.cdg-mid { color: var(--cdg-gold); }
.cdg-ping.cdg-bad { color: var(--cdg-warn); }
.cdg-diag { position: absolute; left: 50%; bottom: -2px; transform: translateX(-50%); margin: 0; white-space: nowrap;
  font: 600 10.5px/1 var(--cdg-body); color: var(--cdg-muted); font-variant-numeric: tabular-nums; pointer-events: none; }

.cdg-stage { position: relative; min-height: 0; flex: 1; }
.cdg-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; }

.cdg-reacts { flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 4px; }
.cdg-reacts-row { display: flex; gap: 12px; }
.cdg-react { width: 52px; height: 52px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .05);
  font-size: 22px; line-height: 1; display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-react:disabled { opacity: .45; cursor: default; }
.cdg-reacts small { font-size: 11.5px; color: #8a9a92; }

.cdg-clock { position: absolute; z-index: 15; left: 10px; top: 8px; display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  border-radius: 999px; pointer-events: none; background: rgba(5, 9, 7, .78); border: 1px solid rgba(235, 193, 94, .45);
  font: 700 15px/1 var(--cdg-display); letter-spacing: .06em; color: var(--cdg-gold); font-variant-numeric: tabular-nums; }
.cdg-clock.cdg-urgent { color: var(--cdg-warn); border-color: rgba(255, 157, 77, .6); }
.cdg-hint { position: absolute; z-index: 30; left: 50%; top: 12px; transform: translateX(-50%); width: max-content; max-width: calc(100% - 24px);
  box-sizing: border-box; padding: 10px 14px; border-radius: 999px; pointer-events: none; text-align: center;
  background: rgba(5, 9, 7, .92); border: 1px solid rgba(255, 157, 77, .55); font: 600 13px/1.3 var(--cdg-body); color: var(--cdg-fg); }
.cdg-bubble { position: absolute; z-index: 14; pointer-events: none; }
.cdg-bubble.cdg-mine { left: 18px; bottom: 18px; font-size: 34px; line-height: 1; }
.cdg-bubble.cdg-theirs { right: 30px; top: 14px; padding: 6px 10px; border-radius: 999px; background: rgba(4, 8, 6, .82);
  border: 1px solid rgba(134, 173, 255, .4); font: 600 12px/1 var(--cdg-body); display: flex; align-items: center; gap: 6px; }
.cdg-bubble.cdg-theirs b { color: var(--cdg-rival); font-weight: 600; }
.cdg-bubble.cdg-theirs span { font-size: 16px; line-height: 1; }

.cdg-float { position: absolute; z-index: 16; left: 50%; top: 50%; transform: translate(-50%, -50%); width: max-content; max-width: calc(100% - 32px);
  box-sizing: border-box; padding: 14px 18px; border-radius: 18px; text-align: center; background: rgba(5, 9, 7, .92);
  border: 1px solid rgba(255, 255, 255, .14); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cdg-float strong { font: 800 22px/1.05 var(--cdg-display); letter-spacing: .04em; text-transform: uppercase; }
.cdg-float span { font-size: 13px; color: var(--cdg-muted); }
.cdg-pending { display: none; }
.cdg-root[data-phase="over"] .cdg-pending { display: flex; }

.cdg-overlay { position: absolute; inset: 0; bottom: var(--keyboard-overlap, 0px); z-index: 20; display: flex; align-items: center; justify-content: center;
  padding: 12px 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; background: rgba(5, 8, 10, .62); }
.cdg-overlay.cdg-soft { background: rgba(5, 8, 10, .34); }
.cdg-overlay.cdg-top { z-index: 40; background: rgba(5, 8, 10, .72); }
.cdg-panel { position: relative; width: 100%; max-width: 372px; margin: auto; box-sizing: border-box; background: #0b1210;
  border: 1px solid rgba(255, 255, 255, .1); border-radius: 24px; padding: 22px 20px 16px; display: flex; flex-direction: column;
  gap: 16px; box-shadow: 0 30px 80px rgba(0, 0, 0, .55); }
.cdg-panel:focus { outline: none; }
.cdg-eyebrow { margin: 0; padding-right: 48px; font: 600 11px/1.2 var(--cdg-body); letter-spacing: .14em; text-transform: uppercase; color: var(--cdg-muted); }
.cdg-title { margin: 0; font: 800 clamp(48px, 15vw, 66px)/.84 var(--cdg-display); text-transform: uppercase; }
.cdg-title span { color: var(--cdg-gold); }
.cdg-lead { margin: 0; color: var(--cdg-muted); font-size: 14px; line-height: 1.5; }
.cdg-label { margin: 0; font: 700 14px/1 var(--cdg-display); letter-spacing: .12em; text-transform: uppercase; }
.cdg-btn { min-height: 52px; border-radius: 14px; border: 1px solid transparent; padding: 8px 14px; cursor: pointer;
  font: 800 19px/1.1 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.cdg-btn:disabled { opacity: .5; cursor: default; }
.cdg-btn.cdg-btn-17 { font-size: 17px; padding-left: 10px; padding-right: 10px; white-space: nowrap; }
.cdg-btn.cdg-btn-sm { min-height: 50px; font-size: 16px; padding-left: 8px; padding-right: 8px; text-align: center; }
.cdg-root a.cdg-btn { text-decoration: none; }
.cdg-story-img { display: block; max-width: 100%; max-height: 52vh; margin: 0 auto; border-radius: 16px; object-fit: contain;
  -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
.cdg-btn .cdg-inline { display: inline-flex; align-items: center; gap: 8px; }
.cdg-primary { background: var(--cdg-gold); color: #1a1205; }
.cdg-ghost { background: transparent; color: var(--cdg-fg); border-color: rgba(255, 255, 255, .22); }
.cdg-danger { background: #c2412d; color: #fff5f2; }
.cdg-btn small { font: 500 12px/1.2 var(--cdg-body); letter-spacing: 0; text-transform: none; color: var(--cdg-muted); }
.cdg-primary small { color: rgba(26, 18, 5, .72); }
.cdg-input { flex: 1; min-width: 0; min-height: 52px; box-sizing: border-box; border-radius: 14px; border: 1px solid rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .05); color: var(--cdg-fg); padding: 0 12px; text-align: center;
  font: 800 26px/1 var(--cdg-display); letter-spacing: .3em; font-variant-numeric: tabular-nums;
  -webkit-user-select: text; user-select: text; }
.cdg-input::placeholder { font: 500 14px/1 var(--cdg-body); letter-spacing: 0; color: var(--cdg-muted); }
.cdg-input:focus { outline: none; border-color: var(--cdg-gold); }
.cdg-textarea { width: 100%; box-sizing: border-box; min-height: 84px; resize: none; border-radius: 14px; border: 1px solid rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .05); color: var(--cdg-fg); padding: 10px 12px; font: 400 16px/1.4 var(--cdg-body);
  -webkit-user-select: text; user-select: text; }
.cdg-textarea:focus { outline: none; border-color: var(--cdg-gold); }
.cdg-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px;
  border-radius: 14px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .1); }
.cdg-seg button { min-height: 42px; border: 0; border-radius: 10px; background: transparent; color: var(--cdg-muted);
  font: 700 16px/1 var(--cdg-display); letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
.cdg-seg button[aria-checked="true"] { background: var(--cdg-fg); color: #05080a; }
.cdg-rules { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; font-size: 13px; line-height: 1.4; color: var(--cdg-muted); }
.cdg-rules li { display: flex; gap: 9px; align-items: baseline; }
.cdg-rules li::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--cdg-turf); transform: translateY(-1px); }
.cdg-foot { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px;
  border-top: 1px solid rgba(255, 255, 255, .1); padding-top: 4px; font-size: 11.5px; line-height: 1.4; color: var(--cdg-muted); }
.cdg-link { background: none; border: 0; color: var(--cdg-fg); font: 600 12.5px var(--cdg-body); padding: 0 4px; min-height: 44px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; }
.cdg-link:disabled { opacity: .5; cursor: default; }
.cdg-message { margin: 0; font: 800 34px/1 var(--cdg-display); text-transform: uppercase; text-wrap: balance; }
.cdg-message.cdg-sm { font-size: 28px; }
.cdg-code { margin: 0; text-align: center; font: 800 104px/.9 var(--cdg-display); letter-spacing: .12em; color: var(--cdg-gold); font-variant-numeric: tabular-nums; }
.cdg-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.cdg-row.cdg-single { grid-template-columns: minmax(0, 1fr); }
.cdg-wait { margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px; font: 700 17px/1.2 var(--cdg-display); letter-spacing: .08em; text-transform: uppercase; text-align: center; }
.cdg-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cdg-turf); flex: none; }
.cdg-close { position: absolute; z-index: 1; top: 10px; right: 10px; width: 44px; height: 44px; border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(5, 9, 7, .62); color: var(--cdg-fg); display: grid; place-items: center; cursor: pointer; padding: 0; }
.cdg-small { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--cdg-muted); text-align: center; }
.cdg-alert { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4;
  background: rgba(255, 157, 77, .1); border: 1px solid rgba(255, 157, 77, .4); color: var(--cdg-fg); }
.cdg-choices { margin: 0; padding: 0; border: 0; display: grid; gap: 8px; }
.cdg-choice { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: 14px; cursor: pointer;
  border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .03); font-size: 15px; }
.cdg-choice:has(input:checked) { border-color: var(--cdg-gold); background: rgba(235, 193, 94, .1); }
.cdg-choice input { width: 18px; height: 18px; margin: 0; accent-color: #ebc15e; }

/* Pion d'un joueur (même dessin que sur le terrain) */
.cdg-pawn { position: relative; flex: none; border-radius: 50%; box-sizing: border-box; box-shadow: 3px 6px 0 rgba(0, 0, 0, .3); }
.cdg-pawn-in { width: 100%; height: 100%; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 30%, #26322c, #0a0f0c); font-family: var(--cdg-display); font-weight: 800; }
.cdg-pawn-mark { position: absolute; display: grid; place-items: center; border-radius: 50%; background: rgba(4, 8, 6, .9); }

/* Défi reçu */
.cdg-screen { position: absolute; inset: 0; z-index: 25; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
  background: radial-gradient(120% 80% at 50% 30%, #13201a 0%, #07090b 70%); display: flex; flex-direction: column; padding: 8px 0 12px; }
.cdg-defi { position: relative; width: 100%; max-width: 420px; margin: auto; box-sizing: border-box; border-radius: 26px; background: #0f1416;
  border: 1px solid rgba(255, 255, 255, .09); padding: 18px 20px 20px; display: flex; flex-direction: column; align-items: center; gap: 16px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, .5); }
.cdg-defi .cdg-eyebrow { margin-top: 8px; padding: 0 44px; text-align: center; }
.cdg-chip { margin-top: -6px; padding: 5px 10px; border-radius: 999px; background: rgba(235, 193, 94, .14); color: var(--cdg-gold);
  font: 700 12px/1 var(--cdg-display); letter-spacing: .1em; text-transform: uppercase; }
.cdg-defi-title { margin: 0; text-align: center; font: 800 40px/.95 var(--cdg-display); text-transform: uppercase; text-wrap: balance; }
.cdg-countdown { display: flex; align-items: center; gap: 12px; }
.cdg-countdown span { font-size: 13px; line-height: 1.4; color: var(--cdg-muted); }
.cdg-ring { width: 56px; height: 56px; flex: none; border-radius: 50%; display: grid; place-items: center; }
.cdg-ring b { width: 46px; height: 46px; border-radius: 50%; background: #0f1416; display: grid; place-items: center;
  font: 800 17px/1 var(--cdg-display); font-variant-numeric: tabular-nums; }
.cdg-stakes { width: 100%; border-radius: 16px; background: rgba(255, 255, 255, .04); border: 1px solid rgba(255, 255, 255, .07); }
.cdg-stakes > div { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; font-size: 13.5px; }
.cdg-stakes > div + div, .cdg-stakes > p { border-top: 1px solid rgba(255, 255, 255, .06); }
.cdg-stakes > div span:first-child { color: var(--cdg-muted); }
.cdg-stakes b { font: 800 18px/1 var(--cdg-display); }
.cdg-stakes > p { margin: 0; padding: 12px 14px; font-size: 12.5px; line-height: 1.45; color: var(--cdg-muted); }

/* Fin du match */
.cdg-end { position: absolute; inset: 0; z-index: 22; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;
  background: radial-gradient(100% 70% at 50% 35%, rgba(28, 26, 13, .9) 0%, rgba(7, 9, 11, .95) 72%); display: flex; }
.cdg-end-body { width: 100%; max-width: 420px; margin: 0 auto; box-sizing: border-box; padding: 64px 0 12px; display: flex; flex-direction: column; gap: 18px; min-height: 100%; }
.cdg-end-head { display: flex; flex-direction: column; gap: 6px; }
.cdg-end-head .cdg-eyebrow { color: #c9b27a; padding: 0; }
.cdg-result { margin: 0; font: 800 84px/.86 var(--cdg-display); text-transform: uppercase; }
.cdg-result.cdg-win { color: var(--cdg-gold); }
.cdg-result.cdg-mid { font-size: 64px; }
.cdg-result.cdg-long { font-size: 50px; line-height: .92; }
.cdg-final { margin: 4px 0 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; }
.cdg-final > span:first-child { font: 800 44px/1 var(--cdg-display); font-variant-numeric: tabular-nums; }
.cdg-final .cdg-who { font-size: 13px; color: var(--cdg-muted); }
.cdg-note { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--cdg-muted); }
.cdg-pts { border-radius: 20px; background: #12161a; border: 1px solid rgba(235, 193, 94, .3); overflow: hidden; }
.cdg-pts-main { padding: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; background: rgba(235, 193, 94, .08); }
.cdg-pts-main > span:first-child { display: flex; flex-direction: column; gap: 4px; }
.cdg-pts-delta { font: 800 34px/1 var(--cdg-display); color: var(--cdg-gold); }
.cdg-pts-delta.cdg-neg { color: var(--cdg-fg); }
.cdg-pts-main small { font-size: 12.5px; color: #c9b27a; }
.cdg-pts-total { font: 800 26px/1 var(--cdg-display); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cdg-pts-total span { color: var(--cdg-muted); }
.cdg-pts-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid rgba(255, 255, 255, .06); font-size: 13.5px; }
.cdg-pts-row span:first-child { color: var(--cdg-muted); }
.cdg-pts-row span:last-child { font-weight: 600; }
.cdg-pts-info { margin: 0; padding: 14px 16px; border-radius: 16px; font-size: 13.5px; line-height: 1.45;
  background: rgba(235, 193, 94, .09); border: 1px solid rgba(235, 193, 94, .25); }
.cdg-pts-info b { color: var(--cdg-gold); }
.cdg-end-actions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
.cdg-end-actions .cdg-primary { min-height: 58px; }
.cdg-mod { display: flex; justify-content: center; gap: 18px; }

/* Téléphone en paysage */
.cdg-rotate { position: absolute; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 16px; text-align: center; background: #05080a; }
.cdg-rotate strong { font: 800 30px/1 var(--cdg-display); letter-spacing: .04em; text-transform: uppercase; }
.cdg-rotate span { font-size: 14px; color: var(--cdg-muted); }

@keyframes cdg-rise { from { transform: translateY(14px) scale(.98); opacity: .5; } to { transform: none; opacity: 1; } }
@keyframes cdg-float-up { 0% { transform: translateY(10px) scale(.6); opacity: 0; } 15% { transform: translateY(0) scale(1.1); opacity: 1; }
  80% { opacity: 1; } 100% { transform: translateY(-40px) scale(1); opacity: 0; } }
@keyframes cdg-pulse { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes cdg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .cdg-panel, .cdg-defi { animation: cdg-rise .35s cubic-bezier(.2, .9, .3, 1.15); }
  .cdg-end-body { animation: cdg-rise .4s cubic-bezier(.2, .9, .3, 1.15); }
  .cdg-bubble { animation: cdg-float-up 1.6s ease-out forwards; }
  .cdg-dot { animation: cdg-pulse 1.4s ease-in-out infinite; }
  .cdg-spin { animation: cdg-spin 1s linear infinite; }
}
`;

export default function GameStyles() {
  return <style>{GAME_CSS}</style>;
}
