import React, { useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import MediaGrid from '@/components/feed/MediaGrid';
import { imagesOf } from '@/lib/feed/rules';

/**
 * Corps d'une publication « Avant / Après » (fil v2, contrat section 5) : les deux photos
 * superposées au format 4:5, la photo « avant » à gauche de la ligne, « après » à droite.
 *
 * La ligne se déplace au doigt ou à la souris (glisser, ou toucher l'endroit voulu) et au clavier :
 * un vrai `input type="range"` (« Comparer avant et après »), invisible mais focalisable, porte la
 * valeur ; la poignée s'entoure quand il a le focus. Au doigt, un geste vertical laisse défiler le
 * fil (`touch-action: pan-y`). Le glissement change un `clip-path` et une position : ce n'est pas
 * une animation.
 *
 * Mise en page : aucune marge latérale (PostCard la donne). Le mot de l'auteur (`item.content`) est
 * affiché ici : PostCard ne le répète pas (sinon `showText={false}`).
 *
 * @param {object} props
 * @param {object} props.item     publication (`kind: 'before_after'`, `images` = [avant, après])
 * @param {boolean} [props.showText]
 */
export default function BeforeAfter({ item, showText = true }) {
  const [pos, setPos] = useState(50);
  const boxRef = useRef(null);
  const dragRef = useRef(null);
  const images = imagesOf(item);
  const [before, after] = images;
  const barber = String(item?.meta?.employee_name || '').trim();
  const text = String(item?.content || '').trim();
  const caption = showText && text
    ? <p className="pb-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
    : null;

  // Une seule photo (ligne incomplète) : affichée comme une publication ordinaire
  if (!before || !after) {
    return (
      <div className="min-w-0">
        {caption}
        <MediaGrid images={images} rounded="rounded-2xl" />
      </div>
    );
  }

  const posAt = (clientX) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || !r.width) return null;
    return Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const moveTo = (clientX) => {
    const p = posAt(clientX);
    if (p != null) setPos(p);
  };
  const capture = (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Souris : on glisse tout de suite. Doigt : on attend de savoir si le geste est horizontal
    const mouse = e.pointerType === 'mouse';
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: mouse };
    if (mouse) {
      capture(e);
      moveTo(e.clientX);
    }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active) {
      const dx = Math.abs(e.clientX - d.x);
      const dy = Math.abs(e.clientY - d.y);
      if (dy > 10 && dy > dx) { dragRef.current = null; return; }
      if (dx < 6) return;
      d.active = true;
      capture(e);
    }
    moveTo(e.clientX);
  };
  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    // Simple toucher : la ligne vient sous le doigt
    if (d && d.id === e.pointerId && !d.active) moveTo(e.clientX);
  };
  const onPointerCancel = () => { dragRef.current = null; };

  return (
    <div className="min-w-0">
      {caption}
      <div
        ref={boxRef}
        className="relative w-full cursor-ew-resize select-none overflow-hidden rounded-2xl bg-secondary touch-pan-y"
        style={{ aspectRatio: '4/5' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <img src={after} alt="Photo après" draggable={false} loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img src={before} alt="Photo avant" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        </div>

        <span aria-hidden="true" className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-black/75 px-2 py-1 text-[11px] font-extrabold tracking-[0.1em] text-white">AVANT</span>
        <span aria-hidden="true" className="pointer-events-none absolute top-2.5 right-2.5 rounded-md bg-primary/85 px-2 py-1 text-[11px] font-extrabold tracking-[0.1em] text-white">APRÈS</span>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Comparer avant et après"
          aria-valuetext={`${pos} % avant, ${100 - pos} % après`}
          className="peer sr-only"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 -ml-px bg-white" style={{ left: `${pos}%` }} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -mt-5 -ml-5 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0d0f12] shadow-lg shadow-black/40 peer-focus-visible:ring-4 peer-focus-visible:ring-primary"
          style={{ left: `${pos}%` }}
        >
          <ChevronsLeftRight className="h-5 w-5" />
        </span>

        {barber && (
          <span className="pointer-events-none absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
            avec {barber}
          </span>
        )}
      </div>
    </div>
  );
}
