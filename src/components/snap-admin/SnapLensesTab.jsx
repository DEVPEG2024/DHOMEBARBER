import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Loader2, AlertTriangle, Sparkles, Eye, EyeOff, Play, Save, Undo2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  sortLenses, lensSettings, buildEntries, isColorLens, isBeardLens, groupLabel, lensKindLabel, NO_DEFAULT_LENS,
} from '@/lib/snapLenses';
import SnapPaletteEditor from './SnapPaletteEditor';
import SnapBeardEditor from './SnapBeardEditor';

const draftFrom = (config) => ({
  lenses: config?.lenses || {},
  default_lens: config?.default_lens || '',
  colors: config?.colors ?? null,
  beard_styles: config?.beard_styles ?? null,
});

/**
 * Catalogue des filtres : les lentilles publiées dans les groupes (lues en direct chez Snap),
 * leur visibilité, leur nom, leur ordre, le filtre appliqué à l'ouverture, la palette et les
 * styles de barbe. Tout part en un seul enregistrement.
 */
export default function SnapLensesTab({ config, lensesQuery, onSave, saving }) {
  const [draft, setDraft] = useState(() => draftFrom(config));
  // Réinitialisé quand le serveur renvoie une nouvelle version (après enregistrement), pas à
  // chaque rechargement : une modification en cours ne doit pas disparaître en arrière-plan.
  useEffect(() => { setDraft(draftFrom(config)); }, [config?.updated_at]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(config));
  const catalog = useMemo(() => ({
    lenses: draft.lenses,
    defaultLens: draft.default_lens || null,
    colors: draft.colors,
    beardStyles: draft.beard_styles,
  }), [draft]);

  const lenses = lensesQuery.data?.lenses || [];
  const groupErrors = lensesQuery.data?.errors || [];
  const ordered = useMemo(() => sortLenses(lenses, catalog), [lenses, catalog]);
  const entries = useMemo(() => buildEntries(lenses, catalog), [lenses, catalog]);
  const hasColorLens = lenses.some(isColorLens);
  const hasBeardLens = lenses.some(isBeardLens);

  const setLens = (id, patch) => setDraft((d) => {
    const next = { ...(d.lenses[id] || {}), ...patch };
    if (!next.name) delete next.name;
    return { ...d, lenses: { ...d.lenses, [id]: next } };
  });

  const onDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const next = [...ordered];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setDraft((d) => {
      const lensesDraft = { ...d.lenses };
      next.forEach((lens, i) => { lensesDraft[lens.id] = { ...(lensesDraft[lens.id] || {}), order: i }; });
      return { ...d, lenses: lensesDraft };
    });
  };

  const save = () => onSave({
    lenses: draft.lenses,
    default_lens: draft.default_lens || null,
    colors: draft.colors,
    beard_styles: draft.beard_styles,
  });

  const defaultKnown = !draft.default_lens || draft.default_lens === NO_DEFAULT_LENS || entries.some((e) => e.key === draft.default_lens);

  return (
    <div className="space-y-5 pb-20">
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-sm font-semibold">Lentilles publiées</h3>
          <Link to="/snap" className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary shrink-0">
            <Play className="w-3 h-3" /> Tester en direct
          </Link>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          Lues en direct chez Snap. Glissez pour changer l'ordre du carrousel, masquez ce qui ne sert pas,
          renommez si besoin. Une lentille publiée depuis Lens Studio dans le groupe du salon apparaît ici toute seule.
        </p>

        {lensesQuery.isLoading && (
          <div className="py-8 flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" /> Chargement des lentilles depuis Snap…
          </div>
        )}
        {lensesQuery.error && (
          <p className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Impossible de joindre Camera Kit : {lensesQuery.error.message || 'erreur inconnue'}. Vérifiez le jeton dans l'onglet Camera Kit.
          </p>
        )}
        {groupErrors.length > 0 && (
          <div className="mb-3 space-y-1">
            {groupErrors.map((e, i) => (
              <p key={i} className="flex items-start gap-2 text-[11px] text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {e?.lensGroupId || e?.groupId ? `${groupLabel(e.lensGroupId || e.groupId)} : ` : ''}groupe illisible ({e?.message || e?.name || 'erreur Snap'}).
              </p>
            ))}
          </div>
        )}
        {lensesQuery.isSuccess && lenses.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Aucune lentille dans les groupes configurés. Publiez-en une depuis Lens Studio dans le groupe du salon.
          </p>
        )}

        {ordered.length > 0 && (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="snap-lenses">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {ordered.map((lens, index) => {
                    const s = lensSettings(lens, catalog);
                    const kind = lensKindLabel(lens);
                    return (
                      <Draggable key={lens.id} draggableId={lens.id} index={index}>
                        {(p, snapshot) => (
                          <div
                            ref={p.innerRef}
                            {...p.draggableProps}
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                              snapshot.isDragging ? 'border-primary/50 bg-secondary shadow-lg' : 'border-border bg-secondary/40'
                            } ${s.hidden ? 'opacity-60' : ''}`}
                          >
                            <span {...p.dragHandleProps} className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground" aria-label="Déplacer">
                              <GripVertical className="w-4 h-4" />
                            </span>
                            <span className="w-11 h-11 shrink-0 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                              {lens.iconUrl
                                ? <img src={lens.iconUrl} alt="" className="w-full h-full object-cover" draggable={false} />
                                : <Sparkles className="w-4 h-4 text-primary" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <Input
                                value={draft.lenses[lens.id]?.name || ''}
                                placeholder={lens.name || 'Lentille'}
                                maxLength={40}
                                onChange={(e) => setLens(lens.id, { name: e.target.value })}
                                className="h-8 text-sm bg-background border-border"
                                aria-label={`Nom affiché pour ${lens.name}`}
                              />
                              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                <span>{groupLabel(lens.groupId)}</span>
                                {kind
                                  ? <span className="rounded-full bg-primary/15 text-primary px-1.5 py-px font-semibold">{kind}</span>
                                  : <span>filtre simple</span>}
                                <span className="font-mono opacity-70">{String(lens.id).slice(0, 8)}</span>
                              </p>
                            </div>
                            <label className="flex flex-col items-center gap-1 shrink-0 cursor-pointer">
                              <Switch checked={!s.hidden} onCheckedChange={(v) => setLens(lens.id, { hidden: !v })} aria-label={s.hidden ? 'Afficher' : 'Masquer'} />
                              <span className="text-[9px] text-muted-foreground inline-flex items-center gap-0.5">
                                {s.hidden ? <><EyeOff className="w-2.5 h-2.5" /> masquée</> : <><Eye className="w-2.5 h-2.5" /> visible</>}
                              </span>
                            </label>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-1">Filtre à l'ouverture</h3>
        <p className="text-[11px] text-muted-foreground mb-3">Appliqué dès que la caméra s'allume.</p>
        <select
          value={draft.default_lens}
          onChange={(e) => setDraft((d) => ({ ...d, default_lens: e.target.value }))}
          className="w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm"
        >
          <option value="">Automatique (une couleur, sinon le premier filtre cheveux / barbe)</option>
          <option value={NO_DEFAULT_LENS}>Aucun : caméra sans filtre</option>
          {entries.map((e) => (
            <option key={e.key} value={e.key}>
              {e.swatch || e.emoji ? `${e.name} · ${lensSettings(e.lens, catalog).name}` : e.name}
            </option>
          ))}
          {!defaultKnown && <option value={draft.default_lens}>Filtre introuvable ou masqué</option>}
        </select>
        {!defaultKnown && (
          <p className="mt-2 text-[11px] text-amber-300">Le filtre choisi n'est plus visible : c'est le réglage automatique qui s'applique.</p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          {entries.length} pastille{entries.length > 1 ? 's' : ''} dans le carrousel des clients.
        </p>
      </section>

      <SnapPaletteEditor colors={draft.colors} onChange={(colors) => setDraft((d) => ({ ...d, colors }))} hasColorLens={hasColorLens} />
      <SnapBeardEditor styles={draft.beard_styles} onChange={(beard_styles) => setDraft((d) => ({ ...d, beard_styles }))} hasBeardLens={hasBeardLens} />

      {dirty && (
        <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-card/95 backdrop-blur px-4 py-3 shadow-xl">
          <p className="text-xs text-muted-foreground">Modifications non enregistrées</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setDraft(draftFrom(config))} disabled={saving} className="text-xs">
              <Undo2 className="w-3.5 h-3.5 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="bg-primary text-primary-foreground text-xs">
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
