"""But parasite en haut de l'image (filet et carré de gazon au-dessus de la tribune du logo, défaut de
l'image d'origine) repeint en tribune : rangée haute, allée grise et bandes rouges et noires, reprises
à côté à la même hauteur (rangées de sièges alignées, 16 px) ou plus bas d'un multiple de 16 px.
Usage : python3 tribune_haut.py <stade-gazon.png> <sortie.png>"""
import sys
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1:3]
im = Image.open(src).convert("RGB")

X0, X1 = 392, 810    # zone repeinte (filet, poteaux, carré de gazon et son ombre)
Y_TIER = 54          # rangée haute : 0 → 54
Y_WALK = 78          # allée grise : 54 → 78
Y1 = 176             # bandes de la tribune : 78 → 176
ROW = 16             # écart des rangées de sièges
DOWN = 7 * ROW       # bandes noires prises 112 px plus bas (même colonne de sièges, hors logo)

patch = Image.new("RGB", (X1 - X0, Y1))

def put(box, x0, x1, y0, y1, flip=False):
    """Copie `box` (x, y, x2, y2 de l'image) à la place x0..x1, y0..y1 de la zone, mise à la largeur."""
    part = im.crop(box).resize((x1 - x0, y1 - y0), Image.LANCZOS)
    if flip:
        part = part.transpose(Image.FLIP_LEFT_RIGHT)
    patch.paste(part, (x0 - X0, y0))

def tiles(sources, y0, y1, overlap):
    """Morceaux pris à la même hauteur, posés bout à bout de X0 à X1 ; chacun recouvre le précédent
    sur `overlap` px en fondu (aucune couture). `sources` : (x, x2, retourné) pris à tour de rôle."""
    x, i = X0, 0
    while x < X1 - overlap or i == 0:
        a, b, flip = sources[i % len(sources)]
        w = min(b - a, X1 - x)
        part = im.crop((a, y0, a + w, y1))
        if flip:
            part = part.transpose(Image.FLIP_LEFT_RIGHT)
        ramp = Image.new("L", part.size, 255)
        if i:
            d = ImageDraw.Draw(ramp)
            for k in range(overlap):
                d.line((k, 0, k, y1 - y0), fill=round(255 * (k + 1) / (overlap + 1)))
        patch.paste(part, (x - X0, y0), ramp)
        x, i = x + w - overlap, i + 1

# Rangée haute : public des deux côtés du filet, en alternance (même hauteur)
tiles([(286, 392, False), (812, 918, False), (286, 392, True), (812, 918, True)], 0, Y_TIER, 16)

# Allée grise et rambarde : prolongée à partir de sa partie gauche (même hauteur) ; fondus hors des
# poteaux (x 314, 336, 370 de la source)
tiles([(287, 396, False)], Y_TIER, Y_WALK, 12)

# Bandes de la tribune, aux limites mesurées sous le carré de gazon (y 172 à 212)
RED_A, RED_B = (291, 367), (840, 915)
BLACK_L, BLACK_R = (372, 426), (778, 836)
for x0, x1, kind in [
    (X0, 428, "black-same"), (428, 489, "red-a"), (489, 563, "black-r"), (563, 641, "red-b"),
    (641, 713, "black-l"), (713, 774, "red-a-flip"), (774, X1, "black-same"),
]:
    if kind == "black-same":   # la même bande, plus bas
        put((x0, Y_WALK + DOWN, x1, Y1 + DOWN), x0, x1, Y_WALK, Y1)
    elif kind == "black-r":
        put((BLACK_R[0], Y_WALK + DOWN, BLACK_R[1], Y1 + DOWN), x0, x1, Y_WALK, Y1)
    elif kind == "black-l":
        put((BLACK_L[0], Y_WALK + DOWN, BLACK_L[1], Y1 + DOWN), x0, x1, Y_WALK, Y1, flip=True)
    elif kind == "red-a":
        put((RED_A[0], Y_WALK, RED_A[1], Y1), x0, x1, Y_WALK, Y1)
    elif kind == "red-b":
        put((RED_B[0], Y_WALK, RED_B[1], Y1), x0, x1, Y_WALK, Y1)
    else:
        put((RED_A[0], Y_WALK, RED_A[1], Y1), x0, x1, Y_WALK, Y1, flip=True)

# Pose fondue sur 3 px (côtés et bas ; le haut est le bord de l'image)
mask = Image.new("L", im.size, 0)
ImageDraw.Draw(mask).rectangle((X0 + 2, 0, X1 - 3, Y1 - 3), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(1.6))
full = im.copy()
full.paste(patch, (X0, 0))
im = Image.composite(full, im, mask)
im.save(out)
print("tribune du haut repeinte :", (X0, 0, X1, Y1))
