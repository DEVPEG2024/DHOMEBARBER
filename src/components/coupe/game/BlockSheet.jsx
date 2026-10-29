import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { blockCoupePlayer } from '@/lib/coupe/coupeApi';
import Panel from './Panel';
import { sendErrorText } from './format';

/**
 * Bloquer l'adversaire, avec confirmation (`POST /coupe/block`) : il ne pourra plus te défier ni
 * rejoindre tes matchs, et toi non plus. Fermée par la croix ou Échap.
 */
export default function BlockSheet({ name, keyHash, onClose, onBlocked }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const block = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await blockCoupePlayer(keyHash);
      onBlocked?.();
    } catch (err) {
      setError(sendErrorText(err, "Le blocage n'a pas abouti : réessaie."));
      setSending(false);
    }
  };

  return (
    <Panel labelledBy="cdg-block-title" onClose={onClose} closeLabel="Fermer" dialog top>
      <p className="cdg-eyebrow">Bloquer</p>
      <h2 className="cdg-message cdg-sm" id="cdg-block-title">Bloquer {name} ?</h2>
      <p className="cdg-lead">Vous ne pourrez plus vous défier ni jouer ensemble à la Coupe du Gang.</p>
      {error && <p className="cdg-alert" role="alert">{error}</p>}
      <div className="cdg-row">
        <button type="button" className="cdg-btn cdg-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="cdg-btn cdg-danger" onClick={block} disabled={sending}>
          {sending ? <span className="cdg-inline"><Loader2 className="h-5 w-5 cdg-spin" aria-hidden="true" />Blocage…</span> : 'Bloquer'}
        </button>
      </div>
    </Panel>
  );
}
