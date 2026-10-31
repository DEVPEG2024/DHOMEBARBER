/*
 * Invitation à un match de La Coupe du Gang en image (demande du propriétaire, 29 oct. 2026) :
 * « <Nom> te défie », les deux pions face à face, le code du match en grand et l'adresse, sur le
 * stade du jeu. Partagée avec le lien par la salle d'attente (« Envoyer le défi »).
 *
 * 1080 × 1350 (4:5 : lisible dans une conversation comme en story), JPEG dessiné au canvas sur le
 * téléphone, préparé dès l'ouverture de la salle d'attente : un partage lancé trop longtemps après
 * le tap est refusé sur iPhone. Le code est écrit sur l'image : une appli qui ne garde que l'image
 * laisse quand même rejoindre le match (« Rejoindre » avec le code). Rien d'autre sur le joueur que
 * son nom affiché en jeu et, pour un client, sa photo de profil.
 */
import { isNative } from '@/lib/capacitor';
import { STADIUM_URL } from '@/lib/coupe/stadiumImage';
import { COUPE_COLORS as C } from '@/components/coupe/palette';
import {
  BODY, FUT, NOIR, blobToBase64, drawSegments, drawText, ellipsize, fitFont, loadFonts, loadImage,
  roundRect, toBlob, withShadow,
} from './scoreStory';

export const CHALLENGE_IMAGE_WIDTH = 1080;
export const CHALLENGE_IMAGE_HEIGHT = 1350;
const PHOTO_TIMEOUT_MS = 6000;
const PAWN_R = 112;

// Photo de profil d'un client : chargée avec CORS (l'API l'autorise pour l'app), sinon le canvas
// serait « sali » et l'image ne pourrait plus être enregistrée ; null en cas d'échec (initiales)
function loadPhoto(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    const timer = setTimeout(() => resolve(null), PHOTO_TIMEOUT_MS);
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth ? img : null); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

/** Initiales affichées dans un pion (« Lucas M. » → « LM », « D'Home Barber » → « DHB »). */
function initialsOf(name, role) {
  if (role === 'admin' || role === 'salon') return 'DHB';
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (role === 'barber') return words[0].charAt(0).toUpperCase();
  return `${words[0].charAt(0)}${words[1] ? words[1].charAt(0) : ''}`.toUpperCase();
}

// Fond : le stade du jeu (tribune au logo en haut, rond central plus bas), assombri sous les textes
function drawBackground(ctx, stadium) {
  const w = CHALLENGE_IMAGE_WIDTH;
  const h = CHALLENGE_IMAGE_HEIGHT;
  ctx.fillStyle = C.noir;
  ctx.fillRect(0, 0, w, h);
  if (stadium) {
    const s = w / stadium.naturalWidth;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Haut de l'image un peu au-dessus du cadre : la tribune au logo derrière le titre
    ctx.drawImage(stadium, 0, -40, w, stadium.naturalHeight * s);
  }
  const veil = ctx.createLinearGradient(0, 0, 0, h);
  veil.addColorStop(0, NOIR(0.88));
  veil.addColorStop(0.12, NOIR(0.72));
  veil.addColorStop(0.4, NOIR(0.6));
  veil.addColorStop(0.7, NOIR(0.72));
  veil.addColorStop(1, NOIR(0.96));
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, h);
}

// Pion : anneau rouge (le défiant) ou blanc (l'ami), photo ronde d'un client ou initiales
function drawPawn(ctx, cx, cy, { ring, photo, label }) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, PAWN_R, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();
  const r = PAWN_R - 12;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const k = (2 * r) / Math.min(photo.naturalWidth, photo.naturalHeight);
    const dw = photo.naturalWidth * k;
    const dh = photo.naturalHeight * k;
    ctx.drawImage(photo, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#34353a');
    g.addColorStop(1, C.noir2);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = C.blanc;
    fitFont(ctx, label, { weight: 800, family: FUT, max: 104, min: 48, maxWidth: r * 1.5 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 6);
  }
  ctx.restore();
}

function drawChallenge({ name, role, code }, { stadium, photo }) {
  const canvas = document.createElement('canvas');
  canvas.width = CHALLENGE_IMAGE_WIDTH;
  canvas.height = CHALLENGE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  const w = CHALLENGE_IMAGE_WIDTH;
  const cx = w / 2;
  const shown = String(name || '').trim() || 'Un membre du Gang';

  drawBackground(ctx, stadium);

  // En-tête : « D'HOME BARBER · LA COUPE DU GANG », « COUPE » en or
  ctx.font = `600 30px ${BODY}`;
  withShadow(ctx, { blur: 10, y: 1 }, () => {
    drawSegments(ctx, [
      { text: "D'HOME BARBER · LA ", color: C.blanc },
      { text: 'COUPE', color: C.or },
      { text: ' DU GANG', color: C.blanc },
    ], cx, 96, { align: 'center', spacing: 30 * 0.2 });
  });

  // « DÉFI » sur une pastille rouge
  ctx.font = `800 34px ${FUT}`;
  const tag = 'DÉFI · MATCH EN LIGNE';
  const tagW = ctx.measureText(tag).width + 34 * 0.18 * tag.length + 64;
  roundRect(ctx, cx - tagW / 2, 140, tagW, 60, 30);
  ctx.fillStyle = C.rouge;
  ctx.fill();
  ctx.fillStyle = C.blanc;
  drawText(ctx, tag, cx, 182, { align: 'center', spacing: 34 * 0.18 });

  // Nom du défiant en très grand, puis « TE DÉFIE »
  const nameText = ellipsize(ctx, shown.toUpperCase(), 980);
  fitFont(ctx, nameText, { weight: 800, family: FUT, max: 168, min: 80, maxWidth: 960, spacingEm: 0.02 });
  withShadow(ctx, { blur: 24, y: 4 }, () => {
    ctx.fillStyle = C.blanc;
    drawText(ctx, nameText, cx, 380, { align: 'center', spacing: 3 });
  });
  ctx.font = `800 104px ${FUT}`;
  withShadow(ctx, { color: 'rgba(0, 0, 0, .9)', blur: 18, y: 4 }, () => {
    ctx.fillStyle = C.rougeVif;
    drawText(ctx, 'TE DÉFIE !', cx, 490, { align: 'center', spacing: 4 });
  });

  // Face à face : le défiant (anneau rouge), « VS » dans un losange rouge, l'ami (anneau blanc, « ? »)
  const rowY = 690;
  drawPawn(ctx, cx - 300, rowY, { ring: C.rouge, photo, label: initialsOf(shown, role) });
  drawPawn(ctx, cx + 300, rowY, { ring: C.blancCasse, photo: null, label: '?' });
  ctx.save();
  ctx.translate(cx, rowY);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = C.rouge;
  ctx.fillRect(-62, -62, 124, 124);
  ctx.restore();
  ctx.fillStyle = C.blanc;
  ctx.font = `800 64px ${FUT}`;
  drawText(ctx, 'VS', cx, rowY + 23, { align: 'center' });
  ctx.font = `700 30px ${FUT}`;
  ctx.fillStyle = C.grisClair;
  withShadow(ctx, { blur: 10, y: 1 }, () => {
    drawText(ctx, 'TOI ?', cx + 300, rowY + PAWN_R + 52, { align: 'center', spacing: 4 });
  });

  // Code du match en grand, dans un cadre noir bordé de rouge
  const boxW = 640;
  const boxY = 900;
  roundRect(ctx, cx - boxW / 2, boxY, boxW, 230, 28);
  ctx.fillStyle = NOIR(0.82);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.rouge;
  ctx.stroke();
  ctx.fillStyle = C.grisClair;
  ctx.font = `600 28px ${BODY}`;
  drawText(ctx, 'CODE DU MATCH', cx, boxY + 58, { align: 'center', spacing: 28 * 0.22 });
  ctx.fillStyle = C.blanc;
  ctx.font = `800 150px ${FUT}`;
  drawText(ctx, String(code || '····'), cx, boxY + 198, { align: 'center', spacing: 150 * 0.16 });

  // Mode d'emploi et adresse
  ctx.fillStyle = C.blanc;
  ctx.font = `600 34px ${BODY}`;
  withShadow(ctx, { blur: 10, y: 1 }, () => {
    drawText(ctx, 'Ouvre le lien, ou « Rejoindre » avec le code', cx, 1196, { align: 'center' });
  });
  ctx.fillStyle = C.grisClair;
  ctx.font = `500 28px ${BODY}`;
  // Sans nombre de buts : un ami sur une app pas à jour joue à 3, sur une app à jour à 5 (le serveur
  // décide match par match)
  drawText(ctx, 'Code valable 2 minutes · dhomebarber.fr', cx, 1262, { align: 'center' });

  return canvas;
}

/**
 * Image du défi : JPEG 1080 × 1350. `me` : { name (nom affiché en jeu), role, photo (url d'une
 * photo de client, ou null) } ; `code` : code du match à 4 chiffres.
 * @returns {Promise<Blob>}
 */
export async function renderChallengeImage({ name, role, photo, code }) {
  const [stadium, face] = await Promise.all([loadImage(STADIUM_URL), loadPhoto(photo), loadFonts()]);
  return toBlob(drawChallenge({ name, role, code }, { stadium, photo: face }));
}

/**
 * Partage de l'image avec le texte de l'invitation (`message` : invitation, code et lien, par
 * share.js). Rend 'shared' ou 'cancelled', ou null quand l'appareil ne partage pas de fichier (le
 * lien part alors seul).
 */
export async function shareChallengeImage({ blob, title, message }) {
  if (!blob) return null;
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: 'defi-coupe-du-gang.jpg', data, directory: Directory.Cache });
      await Share.share({ title, text: message, files: [uri], dialogTitle: 'Défier un ami' });
      return 'shared';
    } catch (err) {
      if (/cancel/i.test(String(err?.message || err))) return 'cancelled';
      return null;
    }
  }
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof File === 'undefined') return null;
  const file = new File([blob], 'defi-coupe-du-gang.jpg', { type: 'image/jpeg' });
  const data = { files: [file], title, text: message };
  let accepted = false;
  try {
    accepted = typeof navigator.canShare === 'function' && navigator.canShare(data);
  } catch {
    accepted = false;
  }
  if (!accepted) return null;
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    return null;
  }
}
