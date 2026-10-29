import React from 'react';
import { Scissors, Star } from 'lucide-react';
import { playerBadge } from '@/lib/coupe/renderer';
import { COUPE_COLORS as C } from '../palette';

/**
 * Pion d'un joueur, comme sur le terrain (thème stade, maillots domicile et extérieur) : anneau
 * rouge pour toi (`tone="gold"`, nom gardé pour les écrans qui l'utilisent : toi, ou qui te défie),
 * blanc pour l'adversaire (`tone="rival"`), initiales en blanc au centre. Un barber porte son
 * initiale et des ciseaux de la couleur de son anneau (jamais sa photo en rond), le salon « DHB »
 * et une petite étoile bleue.
 */
export default function Pawn({ name, role, tag, tone = 'gold', size = 44 }) {
  const badge = playerBadge(name, role, tag);
  const home = tone !== 'rival';
  const ring = home
    ? `linear-gradient(135deg, ${C.rouge}, ${C.rougeSombre})`
    : `linear-gradient(135deg, ${C.blancCasse}, #b9bcc2)`;
  const markColor = home ? C.rougeVif : C.blancCasse;
  const pad = Math.max(3, Math.round(size * 0.09));
  const len = badge.tag.length;
  const fontSize = Math.round(size * (len > 3 ? 0.26 : len > 2 ? 0.3 : len > 1 ? 0.34 : 0.42));
  const mark = Math.max(14, Math.round(size * 0.3));
  return (
    <span className="cdg-pawn" style={{ width: size, height: size, padding: pad, background: ring }} aria-hidden="true">
      <span className="cdg-pawn-in" style={{ fontSize }}>{badge.tag}</span>
      {badge.star && (
        <span className="cdg-pawn-mark" style={{ width: mark, height: mark, right: -2, top: -2 }}>
          <Star style={{ width: mark * 0.7, height: mark * 0.7 }} fill={C.etoile} color={C.etoile} strokeWidth={1.5} />
        </span>
      )}
      {badge.scissors && (
        <span className="cdg-pawn-mark" style={{ width: mark, height: mark, right: -2, bottom: -2 }}>
          <Scissors style={{ width: mark * 0.62, height: mark * 0.62 }} color={markColor} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}
