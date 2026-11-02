/*
 * Snake du Gang : textes des parties non classées et des fins pas encore envoyées, selon la raison
 * exacte (jamais « Hors connexion » quand le réseau est là, jamais « Vérifie ta connexion » pour
 * une panne du serveur). Raisons : voir `noTicketReason` et `sendFinish` de `controller.js`.
 */
import { CloudOff, Download, Hourglass, ServerCrash, Timer, WifiOff } from 'lucide-react';

/** Partie sans ticket : bandeau sous le téléphone et carte de l'écran de fin. */
export const LOCAL_TEXTS = {
  offline: {
    Icon: WifiOff,
    banner: 'Hors connexion : partie non classée',
    card: 'Tu jouais hors connexion : ce score n’est pas enregistré.',
  },
  slow: {
    Icon: Hourglass,
    banner: 'Serveur trop lent : partie non classée',
    card: 'Le serveur a mis trop de temps à répondre au lancement : ce score n’est pas enregistré.',
  },
  server: {
    Icon: ServerCrash,
    banner: 'Serveur indisponible : partie non classée',
    card: 'Le serveur ne répondait pas au lancement : ce score n’est pas enregistré.',
  },
  busy: {
    Icon: Timer,
    banner: 'Trop de parties d’affilée : partie non classée',
    card: 'Trop de parties d’affilée : ce score n’est pas enregistré. Souffle un peu, puis relance.',
  },
  update: {
    Icon: Download,
    banner: 'Mets l’app à jour pour être classé : partie non classée',
    card: 'Mets l’app à jour pour que tes parties comptent au classement.',
  },
};

export const localTexts = (reason) => LOCAL_TEXTS[reason] || LOCAL_TEXTS.offline;

/** Fin pas encore reçue par le serveur : elle est dans la file de l'appareil. */
export const RETRY_TEXTS = {
  offline: { Icon: CloudOff, text: 'Pas de connexion : on le renverra dès que possible.' },
  slow: { Icon: Hourglass, text: 'Le serveur met trop de temps à répondre : on le renverra dès que possible.' },
  server: { Icon: ServerCrash, text: 'Le serveur ne répond pas : on le renverra dès que possible.' },
  busy: { Icon: Timer, text: 'Le serveur est débordé : on le renverra dès que possible.' },
};

export const retryTexts = (reason) => RETRY_TEXTS[reason] || RETRY_TEXTS.offline;
