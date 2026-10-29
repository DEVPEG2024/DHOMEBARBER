import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { COUPE_REPORT_REASONS, reportCoupePlayer } from '@/lib/coupe/coupeApi';
import Panel from './Panel';
import { sendErrorText } from './format';

const DETAILS_MAX = 500;

/**
 * Signaler l'adversaire (App Store 1.2) : motif, précisions facultatives, envoi à l'équipe du salon
 * (`POST /coupe/report`, alerte admin côté serveur). Fermée par la croix ou Échap.
 */
export default function ReportSheet({ name, keyHash, roomCode, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      await reportCoupePlayer({ keyHash, roomCode, reason, details: details.trim() || undefined });
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(sendErrorText(err, "Le signalement n'est pas parti : réessaie."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel labelledBy="cdg-report-title" onClose={onClose} closeLabel="Fermer" dialog top>
      <p className="cdg-eyebrow">Signaler</p>
      <h2 className="cdg-message cdg-sm" id="cdg-report-title">Signaler {name}</h2>
      {done ? (
        <>
          <p className="cdg-lead" role="status">Merci : l&apos;équipe du salon va regarder.</p>
          <button type="button" className="cdg-btn cdg-ghost" onClick={onClose}>Fermer</button>
        </>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <fieldset className="cdg-choices">
            <legend className="cdg-label mb-2">Motif</legend>
            {COUPE_REPORT_REASONS.map((r) => (
              <label key={r.value} className="cdg-choice">
                <input
                  type="radio"
                  name="cdg-report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </fieldset>
          <label className="cdg-label mt-1" htmlFor="cdg-report-details">Précisions (facultatif)</label>
          <textarea
            id="cdg-report-details"
            className="cdg-textarea"
            rows={3}
            maxLength={DETAILS_MAX}
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
          />
          <p className="cdg-small" style={{ textAlign: 'right' }}>{details.length} / {DETAILS_MAX}</p>
          {error && <p className="cdg-alert" role="alert">{error}</p>}
          <button type="submit" className="cdg-btn cdg-primary" disabled={!reason || sending}>
            {sending
              ? <span className="cdg-inline"><Loader2 className="h-5 w-5 cdg-spin" aria-hidden="true" />Envoi…</span>
              : 'Envoyer le signalement'}
          </button>
        </form>
      )}
    </Panel>
  );
}
