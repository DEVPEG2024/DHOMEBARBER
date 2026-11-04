import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Star, WifiOff } from 'lucide-react';
import { watchPawnText } from '@/lib/coupe/watch';
import { COUPE_COLORS } from '../palette';

/*
 * Briques de l'écran du salon (planche validée, écrans 14 et 15, 1280 × 720) : cartes noires
 * bordées, libellés or en capitales, pions aux initiales (jamais une photo), QR blanc, bandeau
 * « Connexion perdue ». Toutes les tailles sont celles de la planche, en px de la scène 1280 × 720
 * (mise à l'échelle de l'écran par ScreenFrame) ; textes d'information à 16 px de scène au moins
 * (décision A4 du contrat, section 6 : lisibles de loin sur la télé du salon).
 */

const NOIR = COUPE_COLORS.noir;

/** Carte noire translucide bordée (planche : `.card`). */
export const CARD = 'rounded-2xl border border-white/10 bg-[rgba(20,20,22,.92)]';
/** Libellé or en capitales (planche : `.lbl`). */
export const LABEL = 'font-fut text-base font-bold uppercase leading-none tracking-[0.14em] text-[color:var(--coupe-or)]';
/** Grand texte en capitales condensées (planche : `.dsp`). */
export const DISPLAY = 'font-fut font-extrabold uppercase leading-none tracking-[0.03em]';
/** Liste d'une carte : trait fin entre deux lignes (planche : `.m + .m`). */
export const LIST = 'divide-y divide-white/[.07]';
/** Ligne d'une liste (planche : `.m` / `.r`). */
export const ROW = 'flex min-w-0 items-center gap-2.5 px-3.5';

const RED_PAWN = `radial-gradient(circle at 35% 30%, #ff5a60, ${COUPE_COLORS.rouge} 55%, ${COUPE_COLORS.rougeSombre})`;
const WHITE_PAWN = 'radial-gradient(circle at 35% 30%, #fff, #eceef0 55%, #b9bbc0)';

/**
 * Pion aux initiales (« DHB » pour le salon) : rouge pour le joueur du bas du terrain, blanc pour les
 * autres. Jamais une photo, même si le serveur en envoyait une.
 */
export function ScreenPawn({ name, role, size = 28, tone = 'white', ring = false }) {
  const text = watchPawnText(name, role);
  const red = tone === 'red';
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-fut font-extrabold leading-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * (text.length > 2 ? 0.32 : 0.4)),
        background: red ? RED_PAWN : WHITE_PAWN,
        color: red ? COUPE_COLORS.blanc : NOIR,
        boxShadow: ring ? (red ? '0 0 0 2px #fff, 0 6px 14px rgba(0,0,0,.6)' : '0 6px 14px rgba(0,0,0,.6)') : undefined,
      }}
    >
      {text}
    </span>
  );
}

/** Étoile bleue du salon (« D'Home Barber »), lue par les lecteurs d'écran. */
export function SalonStar({ role, size = 13 }) {
  if (role !== 'salon' && role !== 'admin') return null;
  return (
    <Star
      role="img"
      aria-label="Le salon"
      className="inline-block shrink-0 align-[-1px]"
      style={{ width: size, height: size, color: COUPE_COLORS.etoile, fill: COUPE_COLORS.etoile }}
    />
  );
}

/** Nom d'un joueur et l'étoile du salon. */
export function PlayerName({ name, role, className = '' }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="truncate">{name}</span>
      <SalonStar role={role} />
    </span>
  );
}

/**
 * QR blanc vers une adresse publique (https://dhomebarber.fr…). `data-qr-url` : l'adresse codée
 * (lue par les vérifications de bout en bout).
 */
export function QrBox({ url, size = 116, label }) {
  const inner = size - 16;
  return (
    <div
      role="img"
      aria-label={label}
      data-qr-url={url}
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-white p-2"
      style={{ width: size, height: size }}
    >
      <QRCodeSVG value={url} size={inner} level="M" bgColor="#ffffff" fgColor={NOIR} marginSize={0} />
    </div>
  );
}

/**
 * Pastille rouge « En direct · quarts » (point fixe : l'écran ne clignote pas) ; `tone="gold"` avant
 * le début (« Début à 19:00 »).
 */
export function LiveBadge({ children, tone = 'live' }) {
  const gold = tone === 'gold';
  return (
    <span
      className={`inline-flex h-[34px] shrink-0 items-center gap-2 self-start rounded-full border px-3.5 text-base font-bold ${gold
        ? 'border-[color:var(--coupe-or-bord)] bg-[rgba(235,193,94,.12)] text-[color:var(--coupe-or)]'
        : 'border-[rgba(255,61,68,.45)] bg-[rgba(224,31,38,.18)] text-[color:var(--coupe-rouge-vif)]'}`}
    >
      <span className={`h-2 w-2 rounded-full ${gold ? 'bg-[color:var(--coupe-or)]' : 'bg-[color:var(--coupe-rouge-vif)]'}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/** Connexion perdue : les dernières données restent affichées, l'écran réessaie seul. */
export function OfflineStrip() {
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-2.5 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[color:var(--coupe-rouge-trait)] bg-[rgba(11,11,12,.92)] px-4 py-1.5 text-base font-semibold text-white"
    >
      <WifiOff className="h-4 w-4 text-[color:var(--coupe-rouge-vif)]" aria-hidden="true" />
      Connexion perdue, on réessaie…
    </div>
  );
}
