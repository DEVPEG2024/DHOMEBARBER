import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { hapticFeedback } from '@/lib/capacitor';
import {
  useWalletFeatures, walletsForDevice, fetchWalletLinks, openWalletUrl, friendlyWalletError,
} from '@/lib/walletApi';

/*
 * Logos simplifiés, en attendant les badges officiels.
 * PRODUCTION : Apple et Google imposent leur badge officiel, sans retouche :
 *  - Apple : « Ajouter à Apple Wallet » (badge FR, SVG noir) — https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/
 *  - Google : « Ajouter à Google Wallet » (badge FR) — https://developers.google.com/wallet/generic/resources/brand-guidelines
 * Remplacer le contenu de chaque bouton ci-dessous (logo + texte) par le SVG du badge, à déposer dans
 * public/wallet/ (voir docs/backend-wallet.md, § 6).
 */
function AppleWalletLogo() {
  return (
    <svg viewBox="0 0 28 22" className="w-6 h-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="26" height="20" rx="4" fill="#1c1c1e" stroke="#fff" strokeOpacity="0.35" />
      <rect x="3.5" y="3.5" width="21" height="4" rx="1.5" fill="#34aadc" />
      <rect x="3.5" y="6" width="21" height="4" rx="1.5" fill="#5ac85a" />
      <rect x="3.5" y="8.5" width="21" height="4" rx="1.5" fill="#ffcc00" />
      <rect x="3.5" y="11" width="21" height="4" rx="1.5" fill="#ff9500" />
      <path d="M3.5 14 h6.5 a4 4 0 0 0 8 0 h6.5 v4.5 a1.5 1.5 0 0 1 -1.5 1.5 h-18 a1.5 1.5 0 0 1 -1.5 -1.5 z" fill="#2c2c2e" />
    </svg>
  );
}

function GoogleWalletLogo() {
  return (
    <svg viewBox="0 0 28 22" className="w-6 h-5 shrink-0" aria-hidden="true">
      <rect x="2" y="2" width="24" height="7" rx="3" fill="#4285f4" />
      <rect x="2" y="6" width="24" height="7" rx="3" fill="#34a853" />
      <rect x="2" y="10" width="24" height="7" rx="3" fill="#fbbc04" />
      <path d="M2 14 h9 l3 3 l3 -3 h9 v3 a3 3 0 0 1 -3 3 h-18 a3 3 0 0 1 -3 -3 z" fill="#ea4335" />
    </svg>
  );
}

const WALLETS = {
  apple: { label: 'Ajouter à Apple Wallet', Logo: AppleWalletLogo, missing: 'Apple Wallet n’est pas encore disponible.' },
  google: { label: 'Ajouter à Google Wallet', Logo: GoogleWalletLogo, missing: 'Google Wallet n’est pas encore disponible.' },
};

/**
 * Boutons « Ajouter à Apple Wallet » / « Ajouter à Google Wallet » d'une carte cadeau active.
 * Le parent ne les rend que pour une carte validée, non expirée, avec un solde ; ici on ne garde que
 * les Wallets annoncés par le serveur (`features.appleWallet` / `googleWallet`) et utiles sur cet appareil.
 */
export default function WalletButtons({ card, className = '' }) {
  const features = useWalletFeatures();
  const wallets = walletsForDevice(features);
  const [busy, setBusy] = useState(null);
  // Garde contre le double tap (deux taps avant que `busy` ne soit rendu)
  const busyRef = useRef(false);

  if (!card?.id || wallets.length === 0) return null;

  const handleAdd = async (kind) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    hapticFeedback();
    try {
      const links = await fetchWalletLinks(card.id);
      const url = kind === 'apple' ? links.apple_url : links.google_url;
      if (!url) {
        toast.error(WALLETS[kind].missing, { description: 'Présentez le QR code de la carte au salon.' });
        return;
      }
      await openWalletUrl(kind, url);
    } catch (err) {
      toast.error('Ajout au Wallet impossible', { description: friendlyWalletError(err) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {wallets.map((kind) => {
        const { label, Logo } = WALLETS[kind];
        const loading = busy === kind;
        return (
          <motion.button
            key={kind}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() => handleAdd(kind)}
            disabled={!!busy}
            aria-busy={loading}
            data-wallet={kind}
            // Remplacer logo + texte par le badge officiel (voir le commentaire en tête de fichier)
            className="w-full h-12 flex items-center justify-center gap-2.5 rounded-xl bg-black text-white border border-white/25 text-sm font-semibold disabled:opacity-60 transition-opacity"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Logo />}
            <span>{loading ? 'Préparation…' : label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
