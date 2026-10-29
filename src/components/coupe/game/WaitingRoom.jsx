import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import Panel from './Panel';
import Pawn from './Pawn';
import { mmss } from './format';
import { useSecondsLeft } from './hooks';
import { shareChallenge } from './share';

// Une salle d'attente dure 2 minutes côté serveur (contrat 4.2)
const ROOM_MS = 2 * 60 * 1000;

const SHARE_MESSAGES = {
  copied: 'Lien copié : colle-le dans un message.',
  failed: 'Partage impossible : donne le code à ton adversaire.',
};

/**
 * Salle d'attente : le code à 4 chiffres en grand (à montrer en personne) et « Partager le lien »
 * (https://dhomebarber.fr/coupe?defi=…). Défi lancé à un barber : son pion, l'attente et le temps
 * qui reste (il a reçu une notification). `reconnecting` : connexion reprise après un passage par
 * une autre app (le serveur garde la salle, le code reste le même).
 */
export default function WaitingRoom({ code, link, invited, roomAt, onCancel, reconnecting = false }) {
  const left = useSecondsLeft(roomAt ? roomAt + ROOM_MS : null);
  const [shareMsg, setShareMsg] = useState(null);
  const waitLine = (who) => (reconnecting ? 'Reconnexion…' : `En attente de ${who}`);

  const share = async () => {
    setShareMsg(null);
    const r = await shareChallenge({ link, code });
    if (SHARE_MESSAGES[r]) setShareMsg(SHARE_MESSAGES[r]);
  };

  if (invited) {
    return (
      <Panel labelledBy="cdg-invited" onClose={onCancel} closeLabel="Annuler le défi">
        <p className="cdg-eyebrow">Défi envoyé</p>
        <div className="flex items-center gap-4">
          <Pawn name={invited.name} role={invited.role || 'barber'} tone="rival" size={64} />
          <h2 className="cdg-message" id="cdg-invited">{invited.name || 'Le barber'}</h2>
        </div>
        <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />{waitLine(invited.name || 'son accord')}</p>
        <p className="cdg-lead">
          Il a reçu une notification et a {left > 0 ? mmss(left) : 'peu de temps'} pour accepter.
        </p>
        <button type="button" className="cdg-btn cdg-ghost" onClick={onCancel}>Annuler le défi</button>
      </Panel>
    );
  }

  return (
    <Panel labelledBy="cdg-room" onClose={onCancel} closeLabel="Annuler le match">
      <p className="cdg-eyebrow" id="cdg-room">Code du match</p>
      <p className="cdg-code">{code}</p>
      <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />{waitLine("l'autre joueur")}</p>
      <p className="cdg-lead">
        Sur l&apos;autre téléphone : La Coupe du Gang, puis « Rejoindre » avec ce code. Ou envoie-lui le lien.
      </p>
      {link && (
        <button type="button" className="cdg-btn cdg-primary" onClick={share}>
          <span className="cdg-inline"><Share2 className="h-5 w-5" aria-hidden="true" />Partager le lien</span>
        </button>
      )}
      {shareMsg && <p className="cdg-small" role="status">{shareMsg}</p>}
      <p className="cdg-small">{left > 0 ? `Code valable encore ${mmss(left)}` : 'Le code va expirer'}</p>
      <button type="button" className="cdg-btn cdg-ghost" onClick={onCancel}>Annuler</button>
    </Panel>
  );
}
