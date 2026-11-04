import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  forgetScreenKey, hashHasKey, keyFromHash, readStoredScreenKey, storeScreenKey, useScreenFeed,
} from '@/lib/coupe/screenApi';
import { useSalonMusicPaused } from '@/components/coupe/game/hooks';
import ScreenFrame from '@/components/coupe/ecran/ScreenFrame';
import ScreenMessage from '@/components/coupe/ecran/ScreenMessage';
import FreeMode from '@/components/coupe/ecran/FreeMode';
import TournamentMode from '@/components/coupe/ecran/TournamentMode';
import { OfflineStrip } from '@/components/coupe/ecran/ScreenParts';
import { LIVE_STAGE, useScreenSpectator } from '@/components/coupe/ecran/MatchStage';
import { useBigMatch } from '@/components/coupe/ecran/useBigMatch';
import { usePeriodicReload, useScreenWakeLock, useServerNow } from '@/components/coupe/ecran/hooks';
import { liveRows } from '@/components/coupe/ecran/screenFormat';

/*
 * Écran du salon de La Coupe du Gang (`/ecran`, site seulement, sans compte ; planche validée,
 * écrans 14 et 15 ; contrat docs/fonctions/coupe-spectateurs-contrat.md, section 4.2).
 *
 * - Clé d'écran donnée par l'admin (Admin → La Coupe du Gang → Écran du salon) dans le lien
 *   `https://dhomebarber.fr/ecran#cle=<clé>` : rangée sur l'appareil puis retirée de l'adresse. Sans
 *   clé : comment l'obtenir. Clé coupée par le salon (403) : « Écran coupé par le salon », clé oubliée.
 * - Données : `GET /coupe/screen` (src/lib/coupe/screenApi.js), toutes les 15 s, 5 s pendant un
 *   tournoi. Panne réseau : dernières données gardées, bandeau « Connexion perdue ».
 * - Mode tournoi (tournoi en cours ou dans les 15 min) : écran 14 ; sinon mode libre : écran 15.
 *   Le match en grand est choisi par useBigMatch et regardé par **une seule socket** pour tout
 *   l'écran (useScreenSpectator : elle change de match par `watch`).
 * - La clé n'est oubliée que sur le 403 de `GET /coupe/screen` (décision A1) : `error screen_revoked`
 *   de la socket (état `revoked`) fait relire l'écran tout de suite, et ce 403 l'efface ; un 4401
 *   seul est une coupure (SpectatorMatch se reconnecte), jamais un oubli de la clé.
 * - Scène de 1280 × 720 mise à l'échelle (ScreenFrame), portrait empilé, aucun défilement.
 * - Écran gardé allumé (Wake Lock), page rechargée toutes les 6 h, muet (aucun son, jamais la
 *   musique de l'app), noms seulement, jamais de photo.
 */

/** Clé au premier affichage : celle du lien (rangée), sinon celle de l'appareil. */
function initialKey() {
  const fromHash = typeof window === 'undefined' ? null : keyFromHash(window.location.hash);
  if (fromHash) return { key: fromHash, stored: storeScreenKey(fromHash) };
  const stored = readStoredScreenKey();
  return { key: stored, stored: !!stored };
}

export default function EcranSalon() {
  const location = useLocation();
  const navigate = useNavigate();
  const [keyState, setKeyState] = useState(initialKey);
  const [revoked, setRevoked] = useState(false);
  const { key, stored } = keyState;

  // Clé retirée de l'adresse (elle ne reste ni dans l'historique ni à l'écran). Nouveau lien ouvert
  // sur le même écran (seul le `#` change, la page ne se recharge pas) : sa clé remplace l'ancienne
  // et l'écran est relu, même après « Écran coupé »
  useEffect(() => {
    if (!hashHasKey(location.hash)) return;
    const next = keyFromHash(location.hash);
    if (next) {
      setKeyState((ks) => (ks.key === next ? ks : { key: next, stored: storeScreenKey(next) }));
      setRevoked(false);
    }
    navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  // 403 de `GET /coupe/screen` : écran coupé par le salon, clé oubliée
  const onRevoked = useCallback(() => {
    forgetScreenKey();
    setRevoked(true);
  }, []);

  const feed = useScreenFeed(revoked ? null : key, { onRevoked });
  const data = feed.status === 'ready' ? feed.data : null;
  const now = useServerNow(data?.server_now, feed.receivedAt);
  const rows = useMemo(() => liveRows(data), [data]);
  const tournament = data?.tournament && typeof data.tournament === 'object' && data.tournament.id ? data.tournament : null;
  // Socket de l'écran coupée (`error screen_revoked`) : relu tout de suite, le 403 fait oublier la clé
  // (sans attendre la lecture suivante, 15 s hors tournoi)
  const refreshFeed = feed.refresh;
  const onSocketRevoked = useCallback(() => { refreshFeed(); }, [refreshFeed]);
  const big = useBigMatch(rows, { tid: tournament ? String(tournament.id) : null, socket: LIVE_STAGE, onRevoked: onSocketRevoked });

  let message = null;
  if (revoked || feed.status === 'revoked') message = 'revoked';
  else if (!key) message = 'nokey';
  else if (feed.status === 'closed') message = 'closed';
  else if (feed.status === 'offline') message = 'offline';
  else if (!data) message = 'loading';

  // Une seule socket pour tout l'écran ; rien de regardé pendant un message plein écran
  const spectator = useScreenSpectator(revoked ? null : key, message ? null : big.target, big.report);

  useScreenWakeLock();
  // Muet : la musique de l'app ne joue jamais ici (ScreenFrame empêche aussi son départ au toucher)
  useSalonMusicPaused(true);
  usePeriodicReload({
    busy: () => !!big.target,
    beforeReload: () => {
      // Appareil sans stockage : la clé repasse par l'adresse, sinon le rechargement la perdrait
      if (key && !stored && !revoked) window.history.replaceState(window.history.state, '', `/ecran#cle=${encodeURIComponent(key)}`);
    },
  });

  return (
    <ScreenFrame label="Écran du salon : La Coupe du Gang">
      {(portrait) => (
        <>
          {message ? (
            <ScreenMessage kind={message} />
          ) : tournament ? (
            <TournamentMode tournament={tournament} liveRows={rows} now={now} portrait={portrait} big={big} spectator={spectator} />
          ) : (
            <FreeMode data={data} now={now} portrait={portrait} big={big} spectator={spectator} />
          )}
          {!message && feed.offline && <OfflineStrip />}
        </>
      )}
    </ScreenFrame>
  );
}
