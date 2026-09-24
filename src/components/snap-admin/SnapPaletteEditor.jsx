import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Plus, RotateCcw, Trash2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { paletteOf } from '@/lib/snapLenses';

const MAX_COLORS = 32;

/**
 * Palette des teintes proposées par une lentille « couleur » (`launchParams.color`). `colors` vaut
 * null tant que l'admin garde la palette d'origine ; la première modification la rend explicite.
 */
export default function SnapPaletteEditor({ colors, onChange, hasColorLens }) {
  const list = paletteOf({ colors });
  const update = (next) => onChange(next);
  const patch = (i, p) => update(list.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const onDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const next = [...list];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    update(next);
  };

  const add = () => {
    if (list.length >= MAX_COLORS) return;
    update([...list, { id: `c-${Date.now().toString(36)}`, name: 'Nouvelle couleur', hex: '#888888', enabled: true }]);
  };

  const enabled = list.filter((c) => c.enabled !== false);

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="text-sm font-semibold">Palette de couleurs</h3>
        {colors != null && (
          <button type="button" onClick={() => update(null)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-3 h-3" /> Palette d'origine
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Une pastille par couleur activée, dans cet ordre. Même lentille, relancée avec la teinte choisie :
        ajouter une couleur ne demande aucune republication.
      </p>
      {!hasColorLens && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-secondary/60 p-2.5 text-[11px] text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          Aucune lentille du groupe ne déclare la couleur (donnée fournisseur <code className="text-foreground">dhb = hair-color</code> dans Lens Studio) :
          la palette sera utilisée dès qu'une lentille la déclarera.
        </p>
      )}

      {/* ce que verront les clients */}
      <div className="flex flex-wrap gap-1.5 mb-4" aria-label="Aperçu de la palette">
        {enabled.map((c) => (
          <span key={c.id} title={c.name} className="w-6 h-6 rounded-full border border-white/15"
            style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), transparent 45%), ${c.hex}` }} />
        ))}
        {enabled.length === 0 && <span className="text-[11px] text-amber-300">Aucune couleur activée</span>}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="snap-colors">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
              {list.map((c, i) => (
                <Draggable key={c.id} draggableId={c.id} index={i}>
                  {(p, snapshot) => (
                    <div
                      ref={p.innerRef}
                      {...p.draggableProps}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                        snapshot.isDragging ? 'border-primary/50 bg-secondary shadow-lg' : 'border-border bg-secondary/40'
                      } ${c.enabled === false ? 'opacity-60' : ''}`}
                    >
                      <span {...p.dragHandleProps} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground" aria-label="Déplacer">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <input
                        type="color"
                        value={c.hex}
                        onChange={(e) => patch(i, { hex: e.target.value.toUpperCase() })}
                        className="w-8 h-8 shrink-0 rounded-md border border-border bg-transparent cursor-pointer p-0"
                        aria-label={`Teinte de ${c.name}`}
                      />
                      <Input
                        value={c.name}
                        maxLength={30}
                        onChange={(e) => patch(i, { name: e.target.value })}
                        className="h-8 text-xs bg-background border-border flex-1 min-w-0"
                        aria-label="Nom de la couleur"
                      />
                      <span className="hidden sm:inline text-[10px] text-muted-foreground tabular-nums w-14">{c.hex}</span>
                      <Switch checked={c.enabled !== false} onCheckedChange={(v) => patch(i, { enabled: v })} aria-label="Proposer cette couleur" />
                      <button type="button" onClick={() => update(list.filter((_, j) => j !== i))}
                        className="p-1 text-muted-foreground hover:text-red-400" aria-label={`Supprimer ${c.name}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button type="button" onClick={add} disabled={list.length >= MAX_COLORS}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-40">
        <Plus className="w-3.5 h-3.5" /> Ajouter une couleur
      </button>
    </section>
  );
}
