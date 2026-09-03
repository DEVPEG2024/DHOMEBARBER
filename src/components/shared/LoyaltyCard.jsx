/**
 * LoyaltyCard — carte de fidélité « 10e coupe offerte ».
 *
 * AFFICHAGE PUREMENT CALCULÉ : RIEN N'EST STOCKÉ CÔTÉ SERVEUR.
 * Le nombre de rendez-vous `completed` du client (compté dans Profile.jsx via
 * `Appointment.filter({ client_email, status: 'completed' })`, filtre forcé par
 * le serveur sur le client connecté) est converti en tampons :
 *   - 10 tampons par carte, `filled = count % 10` ;
 *   - sauf `count > 0 && count % 10 === 0` → carte pleine (10/10), récompense disponible ;
 *   - cartes déjà complétées = `Math.floor(count / 10)`, moins la carte pleine
 *     courante (qui reste affichée pleine).
 *
 * La coupe offerte est honorée AU SALON sur présentation de la carte pleine :
 * il n'existe ni entité « fidélité », ni flag « récompense consommée ». Si un
 * jour on veut une validation admin (marquer la récompense utilisée, empêcher
 * une double utilisation, décaler le compteur), il faudra une entité dédiée
 * côté backend (ex. `loyalty_rewards` : client_email, card_index, redeemed_at,
 * redeemed_by) déclarée dans `applyReadPolicy` / `CREATE_RULES` / `UPDATE_RULES`.
 *
 * Animations : transform / opacity uniquement (framer-motion), `useReducedMotion`
 * respecté (aucune boucle, arrivée instantanée). Retour haptique léger quand le
 * dernier tampon « frappe » la carte.
 */
import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Scissors, Gift, Trophy } from 'lucide-react';
import { hapticFeedback } from '@/lib/capacitor';

export const STAMPS_PER_CARD = 10;
const STAMP_DELAY = 0.08; // cascade entre deux tampons (secondes)
// Légère inclinaison finale de chaque tampon (effet « tamponné à la main »)
const STAMP_TILT = [-6, 4, -3, 5, -4, 3, -5, 6, -2, 0];
const SLOTS = Array.from({ length: STAMPS_PER_CARD }, (_, i) => i);

/** Convertit le nombre de RDV terminés en état de carte (règle en tête de fichier). */
export function computeLoyalty(count) {
  const safe = Math.max(0, Math.floor(Number(count) || 0));
  const isFull = safe > 0 && safe % STAMPS_PER_CARD === 0;
  const filled = isFull ? STAMPS_PER_CARD : safe % STAMPS_PER_CARD;
  const completedCards = Math.floor(safe / STAMPS_PER_CARD) - (isFull ? 1 : 0);
  return { filled, isFull, completedCards, remaining: STAMPS_PER_CARD - filled };
}

function progressLabel({ filled, isFull, remaining }) {
  if (isFull) return 'Récompense disponible';
  if (filled === 0) return 'Votre première coupe lance la carte';
  if (remaining === 1) return 'Plus qu\'une coupe';
  return `Plus que ${remaining} coupes`;
}

/** Cadeau qui remue légèrement (carte pleine). */
function GiftWiggle({ reduceMotion }) {
  return (
    <motion.span
      className="flex"
      animate={reduceMotion ? undefined : { rotate: [0, -10, 10, -7, 7, 0], scale: [1, 1.08, 1.08, 1.05, 1.05, 1] }}
      transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut', delay: 1.4 }}
    >
      <Gift className="w-5 h-5" strokeWidth={2.25} />
    </motion.span>
  );
}

/** Tampon encreur : arrive en frappant (scale 1,6 → 1, ressort) avec un halo d'encre qui s'estompe. */
function Stamp({ index, isGift, reduceMotion, onLanded }) {
  const delay = reduceMotion ? 0 : index * STAMP_DELAY;
  return (
    <div className="relative w-12 h-12">
      {!reduceMotion && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-primary/40"
          initial={{ opacity: 0.8, scale: 0.6 }}
          animate={{ opacity: 0, scale: 1.9 }}
          transition={{ delay: delay + 0.06, duration: 0.55, ease: 'easeOut' }}
        />
      )}
      <motion.div
        className="relative w-full h-full rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30"
        initial={reduceMotion ? false : { scale: 1.6, rotate: -14, opacity: 0 }}
        animate={{ scale: 1, rotate: isGift ? 0 : STAMP_TILT[index], opacity: 1 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { delay, type: 'spring', stiffness: 520, damping: 22, mass: 0.8, opacity: { delay, duration: 0.12 } }
        }
        onAnimationComplete={onLanded}
      >
        {isGift ? <GiftWiggle reduceMotion={reduceMotion} /> : <Scissors className="w-5 h-5" strokeWidth={2.25} />}
      </motion.div>
    </div>
  );
}

/** Emplacement vide : cercle en pointillé ; le prochain à remplir pulse doucement. */
function EmptySlot({ index, isGift, isNext, reduceMotion, delay }) {
  const pulse = isNext && !reduceMotion;
  return (
    <motion.div
      className={`relative w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center ${
        isNext ? 'border-primary/60 text-primary/80' : 'border-white/15 text-muted-foreground/40'
      }`}
      animate={pulse ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : undefined}
      transition={pulse ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay } : undefined}
    >
      {isGift ? (
        <Gift className="w-5 h-5" strokeWidth={1.75} />
      ) : (
        <span className="text-[11px] font-semibold tabular-nums">{index + 1}</span>
      )}
    </motion.div>
  );
}

/** Squelette discret pendant le chargement (opacity qui pulse). */
function LoyaltySkeleton({ reduceMotion }) {
  return (
    <motion.div
      aria-busy="true"
      aria-label="Chargement de la carte de fidélité"
      className="relative"
      initial={false}
      animate={reduceMotion ? { opacity: 0.5 } : { opacity: [0.35, 0.75, 0.35] }}
      transition={reduceMotion ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="grid grid-cols-5 gap-y-3 justify-items-center">
        {SLOTS.map((i) => (
          <div key={i} className="w-12 h-12 rounded-full border-2 border-dashed border-white/15" />
        ))}
      </div>
      <div className="mt-5 h-1.5 rounded-full bg-white/10" />
      <div className="mt-2 flex justify-between">
        <div className="h-3 w-10 rounded bg-white/10" />
        <div className="h-3 w-24 rounded bg-white/10" />
      </div>
    </motion.div>
  );
}

export default function LoyaltyCard({ count = 0, loading = false }) {
  const reduceMotion = useReducedMotion();
  const { filled, isFull, completedCards, remaining } = computeLoyalty(count);
  // Fin de la cascade des tampons : les éléments suivants (barre, bandeau, pulse) démarrent après
  const cascadeEnd = reduceMotion ? 0 : filled * STAMP_DELAY + 0.35;
  const hapticFor = useRef(null);

  const handleLastStampLanded = () => {
    if (hapticFor.current === filled) return;
    hapticFor.current = filled;
    hapticFeedback();
  };

  return (
    <section
      aria-label="Carte de fidélité"
      className="relative rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 overflow-hidden"
    >
      {/* Halo décoratif */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />

      {/* Bordure verte qui respire quand la carte est pleine */}
      {isFull && !loading && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-primary shadow-[0_0_28px_hsl(var(--primary)/0.35)]"
          animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0.35, 1, 0.35] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* En-tête */}
      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground leading-tight">Carte de fidélité</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Votre 10e coupe est offerte</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
          <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
        </div>
      </div>

      {loading ? (
        <LoyaltySkeleton reduceMotion={reduceMotion} />
      ) : (
        <>
          {/* Grille 5 × 2 */}
          <div
            role="img"
            aria-label={`${filled} tampon${filled > 1 ? 's' : ''} sur ${STAMPS_PER_CARD}`}
            className="relative grid grid-cols-5 gap-y-3 justify-items-center"
          >
            {SLOTS.map((i) => {
              const isGift = i === STAMPS_PER_CARD - 1;
              if (i < filled) {
                return (
                  <Stamp
                    key={i}
                    index={i}
                    isGift={isGift}
                    reduceMotion={reduceMotion}
                    onLanded={i === filled - 1 ? handleLastStampLanded : undefined}
                  />
                );
              }
              return (
                <EmptySlot
                  key={i}
                  index={i}
                  isGift={isGift}
                  isNext={i === filled}
                  reduceMotion={reduceMotion}
                  delay={cascadeEnd}
                />
              );
            })}
          </div>

          {/* Progression */}
          <div className="relative mt-5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={STAMPS_PER_CARD}
              aria-valuenow={filled}
              className="h-1.5 rounded-full bg-white/10 overflow-hidden"
            >
              <motion.div
                className="h-full rounded-full bg-primary"
                style={{ originX: 0 }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: filled / STAMPS_PER_CARD }}
                transition={reduceMotion ? { duration: 0 } : { delay: cascadeEnd, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 mt-2">
              <p className="text-xs font-semibold text-foreground tabular-nums">{filled} / {STAMPS_PER_CARD}</p>
              <p className="text-xs text-muted-foreground text-right">{progressLabel({ filled, isFull, remaining })}</p>
            </div>
          </div>

          {/* Carte pleine : coupe offerte */}
          {isFull && (
            <motion.div
              className="relative mt-4 flex items-center gap-3 rounded-2xl bg-primary/10 border border-primary/30 px-4 py-3"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: cascadeEnd + 0.1, duration: 0.4 }}
            >
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/30">
                <Gift className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Coupe offerte !</p>
                <p className="text-[11px] text-muted-foreground">Montrez cette carte au salon</p>
              </div>
            </motion.div>
          )}

          {/* Cartes déjà complétées (hors carte pleine courante) */}
          {completedCards > 0 && (
            <p className="relative mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Trophy className="w-3.5 h-3.5 text-primary" />
              Cartes complétées : <span className="font-semibold text-foreground tabular-nums">{completedCards}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
