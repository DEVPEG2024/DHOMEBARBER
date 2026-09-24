import React from 'react';
import { ArrowUp, ArrowDown, RotateCcw, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { beardStylesOf } from '@/lib/snapLenses';

/**
 * Styles de barbe d'une lentille « barbe » (`launchParams.style`). La lentille ne connaît que ces
 * quatre styles : on peut les renommer, changer leur emoji, les réordonner ou en masquer.
 */
export default function SnapBeardEditor({ styles, onChange, hasBeardLens }) {
  const list = beardStylesOf({ beardStyles: styles });
  const patch = (i, p) => onChange(list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold">Styles de barbe</h3>
        {styles != null && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-3 h-3" /> Réglages d'origine
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Une pastille par style activé, avant les couleurs.</p>
      {!hasBeardLens && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5 text-[11px] text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          Aucune lentille du groupe ne déclare la barbe (<code className="text-foreground">dhb = beard</code>) : ces styles seront
          utilisés dès qu'une lentille la déclarera.
        </p>
      )}
      <div className="space-y-1.5">
        {list.map((b, i) => (
          <div key={b.id} className={`flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 ${b.enabled === false ? 'opacity-60' : ''}`}>
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20" aria-label="Monter">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20" aria-label="Descendre">
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>
            <Input value={b.emoji || ''} maxLength={8} onChange={(e) => patch(i, { emoji: e.target.value })}
              className="h-8 w-12 text-center text-base bg-background border-border px-1" aria-label="Emoji" />
            <Input value={b.name} maxLength={30} onChange={(e) => patch(i, { name: e.target.value })}
              className="h-8 text-xs bg-background border-border flex-1 min-w-0" aria-label="Nom du style" />
            <Switch checked={b.enabled !== false} onCheckedChange={(v) => patch(i, { enabled: v })} aria-label="Proposer ce style" />
          </div>
        ))}
      </div>
    </section>
  );
}
