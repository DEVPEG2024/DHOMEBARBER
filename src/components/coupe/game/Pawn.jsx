import React from 'react';
import { Scissors, Star } from 'lucide-react';
import { playerBadge } from '@/lib/coupe/renderer';

/**
 * Pion d'un joueur, comme sur le terrain : anneau doré (toi, ou qui te défie) ou bleu
 * (l'adversaire), initiales au centre. Un barber porte son initiale et des ciseaux (jamais sa
 * photo en rond), le salon « DHB » et une petite étoile bleue.
 */
export default function Pawn({ name, role, tag, tone = 'gold', size = 44 }) {
  const badge = playerBadge(name, role, tag);
  const gold = tone !== 'rival';
  const ring = gold ? 'linear-gradient(135deg, #f3d27a, #a8781f)' : 'linear-gradient(135deg, #86adff, #3d63c9)';
  const color = gold ? '#ebc15e' : '#86adff';
  const pad = Math.max(3, Math.round(size * 0.09));
  const len = badge.tag.length;
  const fontSize = Math.round(size * (len > 3 ? 0.26 : len > 2 ? 0.3 : len > 1 ? 0.34 : 0.42));
  const mark = Math.max(14, Math.round(size * 0.3));
  return (
    <span className="cdg-pawn" style={{ width: size, height: size, padding: pad, background: ring }} aria-hidden="true">
      <span className="cdg-pawn-in" style={{ color, fontSize }}>{badge.tag}</span>
      {badge.star && (
        <span className="cdg-pawn-mark" style={{ width: mark, height: mark, right: -2, top: -2 }}>
          <Star style={{ width: mark * 0.7, height: mark * 0.7 }} fill="#3b82f6" color="#3b82f6" strokeWidth={1.5} />
        </span>
      )}
      {badge.scissors && (
        <span className="cdg-pawn-mark" style={{ width: mark, height: mark, right: -2, bottom: -2 }}>
          <Scissors style={{ width: mark * 0.62, height: mark * 0.62 }} color={color} strokeWidth={2.4} />
        </span>
      )}
    </span>
  );
}
