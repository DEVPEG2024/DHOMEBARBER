import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

const MAX_OUTPUT_SIDE = 2480;

// Même consigne que l'envoi (api/apiClient.js, UploadFile) : le HEIC des iPhone ne se décode
// que dans Safari, ailleurs la photo est illisible.
const HEIC_MESSAGE = "Cette photo est au format HEIC, que l'app ne sait pas lire. Sur iPhone : Réglages → "
  + 'Appareil photo → Formats → « Le plus compatible », puis reprenez la photo.';

/**
 * Message à afficher quand le navigateur ne sait pas décoder une photo choisie.
 * `source` : le fichier (nom + type) ou l'URL `data:` lue depuis ce fichier.
 */
export function unreadableImageMessage(source) {
  const hint = typeof source === 'string'
    ? source.slice(0, 40)
    : `${source?.name || ''} ${source?.type || ''}`;
  if (/hei[cf]/i.test(hint)) return HEIC_MESSAGE;
  return 'Impossible de lire cette photo (fichier abîmé ou format non pris en charge). Choisissez une image JPEG ou PNG.';
}

async function getCroppedImg(imageSrc, pixelCrop, rotation = 0) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(unreadableImageMessage(imageSrc)));
    image.src = imageSrc;
  });

  // Côté le plus long plafonné (taille de la photo de référence 1748 × 2480) :
  // évite un canvas trop grand sur iOS et un upload inutilement lourd.
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(pixelCrop.width, pixelCrop.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixelCrop.width * scale));
  canvas.height = Math.max(1, Math.round(pixelCrop.height * scale));
  const ctx = canvas.getContext('2d');

  // Avec une rotation, react-easy-crop donne la zone dans le repère de la boîte englobante de
  // l'image tournée : on dessine l'image tournée autour du centre de cette boîte, décalée de la
  // zone. Un seul canvas, à la taille de la sortie (pas de canvas intermédiaire géant sur iOS).
  const rad = (rotation * Math.PI) / 180;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const boxW = Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h;
  const boxH = Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * h;
  ctx.scale(canvas.width / pixelCrop.width, canvas.height / pixelCrop.height);
  ctx.translate(-pixelCrop.x + boxW / 2, -pixelCrop.y + boxH / 2);
  ctx.rotate(rad);
  ctx.drawImage(image, -w / 2, -h / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Impossible de préparer la photo. Réessayez avec une image plus petite.'));
        return;
      }
      resolve(new File([blob], 'cropped.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

export default function ImageCropDialog({ open, onOpenChange, imageSrc, onCropComplete, cropShape = 'round', aspect = 1 }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [processing, setProcessing] = useState(false);

  const onCropChange = useCallback((location) => setCrop(location), []);
  const onZoomChange = useCallback((z) => setZoom(z), []);

  const handleCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  // Fermeture (Annuler, croix, Échap, après validation) : réglages remis à zéro pour la photo suivante
  const close = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    onOpenChange?.(false);
  };

  // Photo illisible par le navigateur (HEIC hors Safari, fichier abîmé) : le recadrage resterait
  // vide et « Valider » ne ferait rien. On le dit et on referme.
  const handleMediaError = () => {
    toast.error(unreadableImageMessage(imageSrc));
    close();
  };

  const handleConfirm = async () => {
    if (processing) return;
    if (!croppedAreaPixels) {
      toast.error('La photo est encore en cours de chargement, patientez un instant.');
      return;
    }
    setProcessing(true);
    try {
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onCropComplete(croppedFile);
      close();
    } catch (err) {
      toast.error(err?.message || 'Impossible de recadrer cette photo.');
      close();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="bg-card border-border max-w-sm p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="font-display text-base">Recadrer la photo</DialogTitle>
        </DialogHeader>

        <div className="relative w-full" style={{ height: 320 }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={cropShape}
              showGrid={false}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={handleCropComplete}
              mediaProps={{ onError: handleMediaError }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="px-4 pb-2 space-y-3">
          {/* Zoom */}
          <div className="flex items-center gap-3">
            <ZoomOut className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 appearance-none bg-secondary rounded-full cursor-pointer accent-primary"
            />
            <ZoomIn className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-3">
            <RotateCw className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1 h-1.5 appearance-none bg-secondary rounded-full cursor-pointer accent-primary"
            />
            <span className="text-[10px] text-muted-foreground w-8 text-right">{rotation}°</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <Button variant="outline" className="flex-1 text-xs" onClick={close}>
            Annuler
          </Button>
          <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs" onClick={handleConfirm} disabled={processing}>
            <Check className="w-3.5 h-3.5 mr-1.5" />
            {processing ? 'Préparation…' : 'Valider'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
