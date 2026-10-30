import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Share2 } from 'lucide-react';
import { initialsOf, timeAgo } from '@/lib/feed/rules';

// Couleurs de la pastille selon le niveau de la carte Gang (clés de lib/gangCard.js du serveur) ;
// `short` : libellé de la pastille quand le nom du niveau est trop long pour elle
// Police condensée des cartes Gang (chargée par src/index.css)
const CARD_FONT = { fontFamily: "'Barlow Condensed', var(--font-display), sans-serif" };

const TIER_STYLES = {
  bronze: { bg: 'linear-gradient(160deg, #e2a878, #6b3a1a)', fg: '#1d0f05' },
  argent: { bg: 'linear-gradient(160deg, #eef1f5, #7b828c)', fg: '#14171b' },
  or: { bg: 'linear-gradient(160deg, #e3c473, #6d5320)', fg: '#1a1406' },
  orrare: { bg: 'linear-gradient(160deg, #fff1bf, #d4a93c 45%, #6d5320)', fg: '#1a1406' },
  tots: { bg: 'linear-gradient(160deg, #6aa8ff, #1e3a8a)', fg: '#ffffff', short: 'TOTS' },
  icone: { bg: 'linear-gradient(160deg, #fbf7ea, #b9a76a)', fg: '#1a1406' },
};

/**
 * « Moment du Gang » (fil v2, contrat section 5) : un membre passe un niveau sur sa carte Gang. La
 * carte entière est dorée et remplace l'en-tête auteur : pastille du niveau (photo ronde du membre
 * s'il en a une), « Moment du Gang », « <prénom> passe <niveau> sur sa carte Gang », temps, nombre
 * de 👏 et le bouton « 👏 Féliciter » (= ma réaction 👏).
 *
 * Mise en page : la carte dessine son propre cadre (bord doré, coins de 18 px, fond) : PostCard la
 * rend sans son cadre ni son en-tête. Avec `onComment` / `onShare`, « Commenter (N) » et
 * « Partager » s'affichent en bas, dans la carte ; sans eux, rien.
 *
 * @param {object} props
 * @param {object} props.item   publication (`kind: 'moment'`)
 * @param {(next: '👏' | null) => void} [props.onCongratulate]  `'👏'` pour féliciter, `null` pour
 *   retirer ma réaction (re-tap sur « Félicité »)
 * @param {() => void} [props.onComment]   ouvre les commentaires
 * @param {() => void} [props.onShare]     partage la publication
 * @param {number} [props.commentsCount]   nombre affiché dans « Commenter (N) » (0 : « Commenter »)
 */
export default function MomentCard({ item, onCongratulate, onComment, onShare, commentsCount = 0 }) {
  const reduce = useReducedMotion();
  const meta = item?.meta || {};
  const name = String(meta.member_name || '').trim() || 'Un membre';
  const tierLabel = String(meta.tier_label || '').trim() || 'un niveau';
  const tier = TIER_STYLES[meta.tier] || TIER_STYLES.or;
  const photo = meta.member_photo_url || null;
  const claps = Math.max(0, Number(item?.reactions?.['👏']) || 0);
  const done = item?.my_reaction === '👏';
  const when = timeAgo(item?.created_at);
  const comments = Math.max(0, Number(commentsCount) || 0);
  const hasActions = !!(onComment || onShare);
  const actionClass = 'inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-[#f3e3b3]';

  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-[18px] border border-[#d4b15a]/35 bg-card p-3.5"
      style={{ backgroundImage: 'linear-gradient(135deg, rgba(212,177,90,0.14), rgba(212,177,90,0.02) 55%)' }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          aria-hidden="true"
          className="flex h-[108px] w-[74px] shrink-0 flex-col items-center justify-between rounded-[10px] border border-white/20 p-1.5"
          style={{ background: tier.bg, color: tier.fg, ...CARD_FONT }}
        >
          <span className="w-full truncate text-center text-[15px] font-extrabold uppercase leading-none">{tier.short || tierLabel}</span>
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-black/20">
            {photo
              ? <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              : <span className="text-[13px] font-extrabold">{initialsOf(name)}</span>}
          </span>
          <span className="w-full truncate text-center text-[13px] font-extrabold uppercase leading-none">{name}</span>
        </div>

        {/* Marge à droite : le menu de la carte (PostCard) se pose dans le coin haut droit */}
        <div className="min-w-0 flex-1 pr-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#e6cf8f]">Moment du Gang</p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-foreground break-words">
            {name} passe {tierLabel} sur sa carte Gang
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {when}{when ? ' · ' : ''}{claps} 👏
          </p>
          <motion.button
            type="button"
            aria-pressed={done}
            whileTap={reduce ? undefined : { scale: 0.94 }}
            onClick={() => onCongratulate?.(done ? null : '👏')}
            // 36 px dessinés, 44 px de zone de tap
            className={`relative mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-colors after:absolute after:-inset-y-1 after:inset-x-0 ${
              done
                ? 'border-[#d4b15a] bg-[#d4b15a]/30 text-[#fff4d1]'
                : 'border-[#d4b15a]/50 bg-[#d4b15a]/12 text-[#f3e3b3] hover:bg-[#d4b15a]/20'
            }`}
          >
            <span aria-hidden="true">👏</span>
            {done ? 'Félicité' : 'Féliciter'}
          </motion.button>
        </div>
      </div>

      {hasActions && (
        <div className="-mb-1.5 mt-2.5 flex min-w-0 flex-wrap items-center gap-1 border-t border-[#d4b15a]/20 pt-1">
          {onComment && (
            <button type="button" onClick={onComment} className={actionClass}>
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {comments > 0 ? `Commenter (${comments})` : 'Commenter'}
            </button>
          )}
          {onShare && (
            <button type="button" onClick={onShare} className={actionClass}>
              <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Partager
            </button>
          )}
        </div>
      )}
    </div>
  );
}
