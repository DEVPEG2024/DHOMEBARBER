import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { COUPE_COLORS } from '@/components/coupe/palette';
import Pawn from './Pawn';
import { mmss, roleLabel } from './format';
import { useSecondsLeft } from './hooks';

// Un défi dure 2 minutes (contrat 4.2) : l'anneau du compte à rebours part de là
const DEFI_S = 120;

/**
 * « Défi reçu » (maquette du même nom, thème stade) : qui te défie (son pion en blanc, comme tout
 * adversaire), compte à rebours de 2 min en rouge, ce que le match rapporte (gain en or),
 * Accepter / Pas maintenant. La croix vaut « Pas maintenant » (le défiant est prévenu).
 */
export default function ChallengeReceived({ invite, isBarber, onAccept, onDecline, onExpire }) {
  const left = useSecondsLeft(invite?.expiresAt || null);
  const expiredRef = useRef(false);
  const from = invite?.from || {};
  const name = from.name || 'Un joueur';
  // Écran bas (iPhone SE) : pion plus petit, Accepter et Pas maintenant visibles sans défiler
  const pawnSize = typeof window !== 'undefined' && window.innerHeight <= 640 ? 72 : 104;

  useEffect(() => {
    if (left > 0 || expiredRef.current || !invite) return;
    expiredRef.current = true;
    onExpire?.();
  }, [left, invite, onExpire]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onDecline?.(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDecline]);

  const share = Math.max(0, Math.min(1, left / DEFI_S));
  return (
    <section className="cdg-screen" role="dialog" aria-modal="true" aria-labelledby="cdg-defi-title">
      <div className="cdg-defi">
        <button type="button" className="cdg-close" onClick={onDecline} aria-label="Fermer : pas maintenant">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="cdg-eyebrow">La <span style={{ color: COUPE_COLORS.or }}>Coupe</span> du Gang · défi</p>
        <Pawn name={from.name} role={from.role} photo={from.photo || null} tone="rival" size={pawnSize} />
        <span className="cdg-chip">{roleLabel(from.role)}</span>
        <h1 className="cdg-defi-title" id="cdg-defi-title">{name} <br />te défie</h1>
        <div className="cdg-countdown">
          <div
            className="cdg-ring"
            style={{ background: `conic-gradient(${COUPE_COLORS.rougeVif} 0 ${share * 100}%, rgba(255, 255, 255, .12) ${share * 100}% 100%)` }}
            role="timer"
            aria-label={`Temps restant : ${mmss(left)}`}
          >
            <b>{mmss(left)}</b>
          </div>
          <span>pour accepter,<br />ensuite le défi expire</span>
        </div>
        <div className="cdg-stakes">
          <div><span>Si tu gagnes</span><b style={{ color: COUPE_COLORS.or }}>+3 points</b></div>
          <div><span>Si tu perds</span><b>−1 point</b></div>
          <p>Les points comptent quand vous y avez droit tous les deux (une carte Gang pour un client). Jamais sous 0.</p>
        </div>
        <div className="cdg-row w-full">
          <button type="button" className="cdg-btn cdg-ghost cdg-btn-17" onClick={onDecline}>Pas maintenant</button>
          <button type="button" className="cdg-btn cdg-primary" onClick={onAccept}>Accepter</button>
        </div>
        {isBarber && (
          <p className="cdg-small">Tu reçois les défis parce que tu es « Dispo pour un match ». Tu peux le couper dans Mon espace.</p>
        )}
      </div>
    </section>
  );
}
