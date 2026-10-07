import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, Undo2, Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AI_REWRITES, aiWriterAvailable, draftNotification } from '@/lib/aiWriter';

const ADDRESS_KEY = 'dhb-ai-writer-address';

function readAddress() {
  try {
    return localStorage.getItem(ADDRESS_KEY) === 'tu' ? 'tu' : 'vous';
  } catch {
    return 'vous';
  }
}

/**
 * Assistant IA du composeur de notifications : une consigne → trois propositions à choisir,
 * puis des retouches en un tap sur le titre et le message en cours (annulables).
 *
 * @param {object} props
 * @param {string} props.subject
 * @param {string} props.message
 * @param {'all'|'one'} props.audience
 * @param {({ subject, message }) => void} props.onApply  Remplace le titre et le message du composeur
 */
export default function AiWriterPanel({ subject, message, audience, onApply }) {
  const [available, setAvailable] = useState(null);
  const [brief, setBrief] = useState('');
  const [address, setAddress] = useState(readAddress);
  const [busy, setBusy] = useState(null); // 'write' ou la clé de la retouche en cours
  const [proposals, setProposals] = useState([]);
  const [chosen, setChosen] = useState(-1);
  const [previous, setPrevious] = useState(null);

  useEffect(() => {
    let alive = true;
    aiWriterAvailable().then(ok => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);

  const changeAddress = (value) => {
    setAddress(value);
    try { localStorage.setItem(ADDRESS_KEY, value); } catch { /* préférence non mémorisée */ }
  };

  /** Applique un texte en gardant le précédent pour « Annuler » */
  const apply = (next) => {
    if (subject || message) setPrevious({ subject, message });
    onApply(next);
  };

  const write = async () => {
    setBusy('write');
    try {
      const result = await draftNotification({ mode: 'write', brief, address, audience });
      setProposals(result);
      setChosen(-1);
    } catch (err) {
      toast.error(err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : "L'assistant IA n'a pas répondu");
    }
    setBusy(null);
  };

  const rewrite = async (style) => {
    setBusy(style);
    try {
      const [result] = await draftNotification({ mode: 'rewrite', style, subject, message, address, audience });
      if (result) {
        apply(result);
        setChosen(-1);
      }
    } catch (err) {
      toast.error(err?.message && !/^HTTP \d+$/.test(err.message) ? err.message : "L'assistant IA n'a pas répondu");
    }
    setBusy(null);
  };

  const choose = (p, i) => {
    apply(p);
    setChosen(i);
  };

  const undo = () => {
    if (!previous) return;
    onApply(previous);
    setPrevious(null);
    setChosen(-1);
  };

  if (available === null) return null;
  if (!available) {
    return (
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Sparkles className="w-3 h-3" /> Assistant IA de rédaction : en cours d'activation
      </p>
    );
  }

  const hasText = !!(subject || message);

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Assistant IA
        </p>
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/8" role="group" aria-label="Tutoiement ou vouvoiement">
          {['vous', 'tu'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => changeAddress(v)}
              aria-pressed={address === v}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                address === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {v === 'vous' ? 'Vouvoyer' : 'Tutoyer'}
            </button>
          ))}
        </div>
      </div>

      <Textarea
        value={brief}
        onChange={e => setBrief(e.target.value.slice(0, 600))}
        placeholder="Dites ce que vous voulez annoncer, l'IA rédige. Ex. : -20 % sur les colorations ce week-end, places limitées"
        className="bg-secondary border-border resize-none text-sm"
        rows={2}
      />
      <button
        type="button"
        onClick={write}
        disabled={!!busy || brief.trim().length < 3}
        className="mt-2 w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === 'write' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
        {busy === 'write' ? 'Rédaction…' : proposals.length > 0 ? "Trois autres propositions" : "Rédiger avec l'IA"}
      </button>

      {proposals.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">Touchez une proposition pour la reprendre dans le message :</p>
          {proposals.map((p, i) => (
            <button
              key={`${i}-${p.subject}`}
              type="button"
              onClick={() => choose(p, i)}
              className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                chosen === i ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">{p.subject}</span>
                {chosen === i && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </span>
              <span className="block text-xs text-muted-foreground mt-1 whitespace-pre-line">{p.message}</span>
            </button>
          ))}
        </div>
      )}

      {hasText && (
        <div className="mt-3">
          <p className="text-[11px] text-muted-foreground mb-1.5">Retoucher le message actuel :</p>
          <div className="flex flex-wrap gap-1.5">
            {AI_REWRITES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => rewrite(r.key)}
                disabled={!!busy}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:text-primary transition-colors bg-secondary disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy === r.key && <Loader2 className="w-3 h-3 animate-spin" />}
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {previous && !busy && (
        <button type="button" onClick={undo} className="mt-2.5 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Undo2 className="w-3 h-3" /> Revenir au texte précédent
        </button>
      )}
    </div>
  );
}
