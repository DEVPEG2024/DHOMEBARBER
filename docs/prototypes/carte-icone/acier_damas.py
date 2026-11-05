"""Acier de Damas de la carte Icône « La Lame » : src/assets/gang/acier-damas.webp et acier-damas-poli.webp.

Usage (dans un environnement à part, avec numpy, scipy et pillow) :
    python acier_damas.py <dossier de sortie>

Image à 3 fois le repère de la carte (900 × 1320). Le bas (nom, stats) est plus calme et plus sombre :
le texte y reste lisible. Une nouvelle image garde ce partage.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = sys.argv[1]
W, H = 900, 1320


def noise_at(u, v, seed, size=256):
    g = np.random.default_rng(seed).standard_normal((size, size))
    return map_coordinates(g, [np.mod(v, size), np.mod(u, size)], order=3, mode='grid-wrap')


def fbm(u, v, octs=4, seed=0, lac=2.03, gain=0.5):
    s, a, tot = 0, 1.0, 0
    for i in range(octs):
        s = s + a * noise_at(u, v, seed + i * 17)
        tot += a * a
        u, v = u * lac + 11.3, v * lac + 7.7
        a *= gain
    return s / np.sqrt(tot)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def save(name, rgb, size, quality):
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8))
    if size != img.size:
        img = img.resize(size, Image.LANCZOS)
    path = os.path.join(OUT, name + '.webp')
    img.save(path, 'WEBP', quality=quality, method=6)
    print(name, img.size, os.path.getsize(path) // 1024, 'Ko')


x, y = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
px, py = x / W, y / H
a = fbm(x / 340, y / 340, 4, 700)
b = fbm(x / 170, y / 170, 3, 720)
# Couches pliées : plusieurs vagues qui se croisent autour de « noeuds »
knots = np.sin(px * 7.1 + a * 1.6) * np.cos(py * 5.3 - b * 1.1)
f = y / 30 + 7.2 * a + 2.2 * knots + 1.1 * b + 1.1 * np.sin(x / 80 + a * 2.4)
wave = np.sin(f * 2 * np.pi / 2.0)
fine = np.sin(f * 2 * np.pi * 1.5 + b * 2)
height = gaussian_filter(0.5 + 0.5 * np.tanh(wave * 2.8) * 0.78 + 0.11 * fine, 0.8)
gy, gx = np.gradient(height)
spec = np.clip(0.5 + (-gx * 0.7 - gy * 0.8) * 3.4, 0, 1)
# Brossage très fin à l'horizontale
brush = gaussian_filter(np.random.default_rng(3).standard_normal((H, W)), (0.5, 26))
brush = brush / brush.std()
calm = sstep(0.5, 0.66, py) * (1 - sstep(0.93, 1, py) * 0.2)

tone = 0.05 + height * 0.36 + (spec - 0.5) * 0.30 + brush * 0.012
tone = 0.105 + (tone - 0.105) * (1 - calm * 0.68)
# Lumière générale : plus clair vers le haut à droite, derrière le portrait
tone = tone * (0.5 + 0.95 * np.exp(-(((px - 0.62) / 0.55) ** 2 + ((py - 0.24) / 0.38) ** 2)))
save('acier-damas', np.stack([tone * 0.97, tone * 0.99, tone * 1.035], -1), (W, H), 84)

# Même acier, poli : montré seulement là où passe la lumière
polished = (0.03 + height ** 1.5 * 1.02 + (spec - 0.5) * 0.5 + brush * 0.018) * (1 - calm * 0.42)
save('acier-damas-poli', np.stack([polished * 0.97, polished * 0.99, polished * 1.03], -1), (600, 880), 78)
