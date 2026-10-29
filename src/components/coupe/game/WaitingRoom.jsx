import React, { useEffect, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';
import Panel from './Panel';
import Pawn from './Pawn';
import { mmss } from './format';
import { useSecondsLeft } from './hooks';
import { shareChallenge } from './share';
import { renderChallengeImage } from './challengeImage';

// Une salle d'attente dure 2 minutes côté serveur (contrat 4.2)
const ROOM_MS = 2 * 60 * 1000;

const SHARE_MESSAGES = {
  copied: 'Lien copié : colle-le dans un message.',
  failed: 'Partage impossible : donne le code à ton adversaire.',
};

/**
 * Salle d'attente : le code à 4 chiffres en grand (à montrer en personne) et « Envoyer le défi » :
 * une image (« <Nom> te défie », le code ; challengeImage.js) avec le lien
 * https://dhomebarber.fr/coupe?defi=…, ou le lien seul si l'appareil ne partage pas d'image.
 * Défi lancé à un barber ou à un joueur de la liste : son pion (photo d'un client), l'attente et le
 * temps qui reste (il a reçu une notification, ou le défi s'il a le jeu ouvert).
 * `reconnecting` : connexion reprise après un passage par une autre app (le serveur garde la salle,
 * le code reste le même). `me` : { name (nom montré à l'adversaire), role, photo } pour l'image.
 */
export default function WaitingRoom({ code, link, invited, roomAt, onCancel, reconnecting = false, me = null }) {
  const left = useSecondsLeft(roomAt ? roomAt + ROOM_MS : null);
  const [shareMsg, setShareMsg] = useState(null);
  const waitLine = (who) => (reconnecting ? 'Reconnexion…' : `En attente de ${who}`);

  // Image du défi préparée dès l'ouverture de la salle : un partage lancé longtemps après le tap
  // est refusé sur iPhone. Pas prête au tap : le lien part seul
  const imageRef = useRef({ key: '', blob: null });
  const myName = me?.name || '';
  const myRole = me?.role || '';
  const myPhoto = me?.photo || null;
  useEffect(() => {
    if (invited || !link || !code) return undefined;
    const key = [code, link, myName, myRole, myPhoto || ''].join('|');
    if (imageRef.current.key === key) return undefined;
    imageRef.current = { key, blob: null };
    let cancelled = false;
    const timer = setTimeout(() => {
      renderChallengeImage({ name: myName, role: myRole, photo: myPhoto, code })
        .then((blob) => { if (!cancelled && imageRef.current.key === key) imageRef.current = { key, blob }; })
        .catch(() => { /* le lien partira seul */ });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [invited, link, code, myName, myRole, myPhoto]);

  const share = async () => {
    setShareMsg(null);
    const r = await shareChallenge({ link, code, image: imageRef.current.blob });
    if (SHARE_MESSAGES[r]) setShareMsg(SHARE_MESSAGES[r]);
  };

  if (invited) {
    return (
      <Panel labelledBy="cdg-invited" onClose={onCancel} closeLabel="Annuler le défi">
        <p className="cdg-eyebrow">Défi envoyé</p>
        <div className="flex items-center gap-4">
          <Pawn name={invited.name} role={invited.role || 'barber'} photo={invited.photo || null} tone="rival" size={64} />
          <h2 className="cdg-message" id="cdg-invited">{invited.name || (invited.role === 'user' ? 'Ce joueur' : 'Le barber')}</h2>
        </div>
        <p className="cdg-wait" role="status"><span className="cdg-dot" aria-hidden="true" />{waitLine(invited.name || 'son accord')}</p>
        <p className="cdg-lead">
          Défi envoyé : {left > 0 ? mmss(left) : 'peu de temps'} pour l&apos;accepter.
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
        Sur l&apos;autre téléphone : La Coupe du Gang, puis « Rejoindre » avec ce code. Ou envoie-lui le défi : une image avec le code et le lien.
      </p>
      {link && (
        <button type="button" className="cdg-btn cdg-primary" onClick={share}>
          <span className="cdg-inline"><Share2 className="h-5 w-5" aria-hidden="true" />Envoyer le défi</span>
        </button>
      )}
      {shareMsg && <p className="cdg-small" role="status">{shareMsg}</p>}
      <p className="cdg-small">{left > 0 ? `Code valable encore ${mmss(left)}` : 'Le code va expirer'}</p>
      <button type="button" className="cdg-btn cdg-ghost" onClick={onCancel}>Annuler</button>
    </Panel>
  );
}
