#!/usr/bin/env python3
"""
Musique de tribune de La Coupe du Gang en boucle sans couture (30 oct. 2026).

L'enregistrement choisi par le propriétaire (« Best of AC Milan Ultras! La Curva Sud Milano », MP3
d'une vidéo YouTube) se coupe net à 297,46 s puis finit sur 5 s de silence : en boucle, un blanc
de 7 s (silence, puis le fondu du début). Ce script fabrique `src/assets/coupe/tribune.mp3` :

  - contenu gardé : 0 à 297 s (avant la coupure) ;
  - les 4 dernières secondes fondues dans les 4 premières (fondu à puissance constante, sin/cos :
    deux foules différentes gardent le même niveau) : boucle de 293 s exactement, dont la fin
    s'enchaîne sur le début sans saut ;
  - 1 s de marge de chaque côté : avant la boucle, sa dernière seconde ; après, sa première. Le
    lecteur (src/lib/coupe/audioUnlock.js) boucle de 1 s à 294 s : un décodeur qui ajoute ou
    retire quelques millisecondes au début du MP3 (délai de l'encodeur) décale les deux points
    ensemble, la boucle reste sans couture ;
  - mono, 32 kHz, 64 kbit/s, niveau de l'ancien fichier (-26,3 LUFS : sous les bruitages).

Usage : python3 boucle_tribune.py "<source>.mp3" src/assets/coupe/tribune.mp3
Les constantes LOOP_S et GUARD_S sont aussi dans audioUnlock.js (MUSIC_LOOP_S, MUSIC_GUARD_S).
"""
import array
import json
import math
import os
import subprocess
import sys
import tempfile

SR = 32000
END_S = 297.0  # avant la coupure de l'enregistrement (297,46 s)
FADE_S = 4.0
LOOP_S = END_S - FADE_S  # 293 s
GUARD_S = 1.0
TARGET_LUFS = -26.3


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def main(src, out):
    tmp = tempfile.mkdtemp(prefix='tribune-')
    raw_in = os.path.join(tmp, 'source.raw')
    raw_out = os.path.join(tmp, 'boucle.raw')
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', raw_in])
    a = array.array('f')
    with open(raw_in, 'rb') as f:
        a.frombytes(f.read())

    end = int(END_S * SR)
    fade = int(FADE_S * SR)
    n_loop = end - fade
    assert n_loop == int(LOOP_S * SR), n_loop
    assert len(a) >= end, 'source trop courte'

    # Boucle : [fin fondue dans le début] + [suite du début jusqu'avant la fin]
    head = array.array('f', [0.0]) * fade
    for i in range(fade):
        t = (i / fade) * (math.pi / 2)
        head[i] = a[end - fade + i] * math.cos(t) + a[i] * math.sin(t)
    loop = head + a[fade:end - fade]
    assert len(loop) == n_loop

    guard = int(GUARD_S * SR)
    full = loop[n_loop - guard:] + loop + loop[:guard]
    with open(raw_out, 'wb') as f:
        full.tofile(f)

    # Niveau : mesuré sur la boucle, ramené à celui de l'ancien fichier (gain fixe)
    r = run(['ffmpeg', '-hide_banner', '-nostats', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw_out,
             '-af', 'loudnorm=I=-25:TP=-4:LRA=11:print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True)
    i = r.stderr.rindex('{')
    stats = json.loads(r.stderr[i:r.stderr.index('}', i) + 1])
    gain = TARGET_LUFS - float(stats['input_i'])
    peak = float(stats['input_tp']) + gain
    print(f"boucle {LOOP_S:.0f} s, marges {GUARD_S:.0f} s ; mesuré {stats['input_i']} LUFS, gain {gain:+.2f} dB, crête {peak:.1f} dBTP")
    assert peak < -1.0, 'crête trop haute'
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', raw_out,
         '-af', f'volume={gain:.2f}dB', '-codec:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', out])


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
