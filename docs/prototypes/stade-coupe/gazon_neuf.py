"""Gazon refait d'un seul tenant (aucun raccord) puis terrain du jeu tracé dessus, aux mesures de
src/lib/coupe/engine.js et renderer.js. Les personnes, drapeaux et la piste autour sont gardés.
Logo Nova (spirale, demande du propriétaire du 29 oct. 2026) peint au centre du rond central, à
la place de l'ancien « DHB » pâle.
Usage : python3 gazon_neuf.py <stade-propre.png> <nova-spirale.png> <sortie.png>"""
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

src, logo_path, out = sys.argv[1:4]
im = Image.open(src).convert("RGB")
WD, HD = im.size
random.seed(5)

W, H, GW, GD, SBW, SBD, BBW, BBD, POST = 360, 640, 124, 28, 150, 52, 228, 100, 3.5
GL, GR = (W - GW) / 2, (W + GW) / 2
Y0, Y1 = 543, 1777
K = (Y1 - Y0) / H
X0 = 602.5 - W / 2 * K
CX, CY = X0 + W / 2 * K, (Y0 + Y1) / 2

# ── 1. Où refaire le gazon ───────────────────────────────────────────────
# a) Bande du bord : seulement les pixels couleur gazon (personnes, maillots verts, piste gardés)
OUT = (182, 486, 1025, 1826)
band = Image.new("L", (WD, HD), 0)
crop = im.crop(OUT)
vals = [255 if (20 <= r <= 50 and 50 <= g <= 82 and 24 <= b <= 54 and g - r >= 18 and g - b >= 14) else 0
        for (r, g, b) in crop.getdata()]
gm = Image.new("L", crop.size)
gm.putdata(vals)
band.paste(gm, OUT[:2])
# b) Intérieur : tout est gazon ou tracé (anciennes lignes, piquets) → refait en entier
inner = Image.new("L", (WD, HD), 0)
ImageDraw.Draw(inner).rounded_rectangle((199, 508, 1007, 1809), radius=30, fill=255)
# c) Anciens buts : refaits en entier (personne dessus)
#    bas : limite gazon / piste mesurée de part et d'autre du but
def last_green_row(x):
    last = None
    for y in range(1795, 1840):
        r, g, b = im.getpixel((x, y))
        if 20 <= r <= 50 and 50 <= g <= 82 and 24 <= b <= 54 and g - r >= 18:
            last = y
    return last
rows = sorted(v for v in [last_green_row(x) for x in list(range(470, 506, 3)) + list(range(706, 738, 3))] if v)
B = rows[len(rows) // 2] + 1
print("limite gazon / piste en bas :", B)
force = Image.new("L", (WD, HD), 0)
fd = ImageDraw.Draw(force)
fd.rectangle((541, 494, 664, 548), fill=255)
fd.rectangle((510, 1776, 691, B - 1), fill=255)
mask = ImageChops.lighter(ImageChops.lighter(band, inner), force)
region = mask.copy()
mask = mask.filter(ImageFilter.GaussianBlur(0.7))

# ── 2. Gazon neuf : rayures du jeu (14 bandes sur la hauteur du terrain), éclairage, ombre, grain ──
LIGHT, DARK = (36, 72, 43), (27, 58, 33)
P = (Y1 - Y0) / 14
col = Image.new("RGB", (1, HD))
for y in range(HD):
    k = math.floor((y + 0.5 - Y0) / P)
    col.putpixel((0, y), LIGHT if k % 2 else DARK)
col = col.filter(ImageFilter.GaussianBlur(1.2))
grass = col.resize((WD, HD), Image.NEAREST)
# Éclairage : plus clair au centre, plus sombre vers les angles (projecteurs)
light = Image.new("L", (WD // 4, HD // 4))
lp = []
for y in range(HD // 4):
    for x in range(WD // 4):
        dx = (x * 4 - CX) / 520
        dy = (y * 4 - CY) / 820
        d = math.sqrt(dx * dx + dy * dy)
        lp.append(int(255 * max(0.80, 1.0 - 0.17 * d * d)))
light.putdata(lp)
light = light.resize((WD, HD), Image.BICUBIC).filter(ImageFilter.GaussianBlur(6))
grass = ImageChops.multiply(grass, Image.merge("RGB", (light, light, light)))
# Ombre des tribunes sur les bords du gazon
edge = ImageChops.invert(region).filter(ImageFilter.GaussianBlur(16))
shade = edge.point(lambda v: 255 - int(v * 0.45))
grass = ImageChops.multiply(grass, Image.merge("RGB", (shade, shade, shade)))
# Grain fin (herbe)
n = Image.effect_noise((WD, HD), 7).convert("L").filter(ImageFilter.GaussianBlur(0.6))
grass = ImageChops.add(grass, Image.merge("RGB", (n, n, n)), scale=1.0, offset=-128)
im = Image.composite(grass, im, mask)

# ── 3. Piste sous l'ancien but du bas : couleur médiane de chaque rangée, prise à côté ──
def row_median(y, ranges):
    px = []
    for a, b in ranges:
        px += [im.getpixel((x, y)) for x in range(a, b)]
    px.sort(key=lambda p: sum(p))
    return px[len(px) // 2]
tx0, tx1, ty0, ty1 = 505, 699, B, 1848
w, h = tx1 - tx0, ty1 - ty0
patch = Image.new("RGB", (w, h))
pd = ImageDraw.Draw(patch)
ranges = [(400, 445), (460, 497), (712, 750), (765, 800)]
for j in range(h):
    pd.line([(0, j), (w, j)], fill=row_median(ty0 + j, ranges))
nn = Image.effect_noise((w, h), 3).convert("L")
patch = ImageChops.add(patch, Image.merge("RGB", (nn, nn, nn)), offset=-128)
pm = Image.new("L", (w, h), 0)
ImageDraw.Draw(pm).rectangle((1, 0, w - 2, h - 2), fill=255)
pm = pm.filter(ImageFilter.GaussianBlur(1.2))
im.paste(patch, (tx0, ty0), pm)

# ── 3 bis. Personnes debout derrière les nouveaux filets (plus larges que les anciens buts) :
#           retirées en recopiant la piste et le gazon voisins, sur les mêmes rangées ──
def clone(src_x0, dst_x0, width, y0, y1, feather=3):
    piece = im.crop((src_x0, y0, src_x0 + width, y1))
    m = Image.new("L", piece.size, 0)
    ImageDraw.Draw(m).rectangle((feather, 0, piece.width - feather - 1, piece.height - 1), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(feather / 1.5))
    im.paste(piece, (dst_x0, y0), m)
clone(541, 486, 56, 458, 507)
clone(598, 664, 58, 458, 507)
clone(540, 486, 32, 1804, 1849)
clone(640, 685, 34, 1804, 1849)

# ── 4. Terrain du jeu (dessiné 2 fois plus grand puis réduit) ──
SS = 2
layer = Image.new("RGBA", (WD * SS, HD * SS), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
def Pt(x, y):
    return ((X0 + x * K) * SS, (Y0 + y * K) * SS)
U = K * SS
CHALK = (236, 248, 240, 219)
LW = max(1, round(2 * U))
def rect_stroke(x0, y0, x1, y1):
    a, b = Pt(x0, y0), Pt(x1, y1)
    hw = LW / 2
    d.rectangle((a[0] - hw, a[1] - hw, b[0] + hw, b[1] + hw), outline=CHALK, width=LW)
def arc(cx, cy, r, a0, a1):
    c = Pt(cx, cy)
    rr = r * U
    hw = LW / 2
    d.arc((c[0] - rr - hw, c[1] - rr - hw, c[0] + rr + hw, c[1] + rr + hw), math.degrees(a0), math.degrees(a1), fill=CHALK, width=LW)
def disc(cx, cy, r, fill):
    c = Pt(cx, cy)
    rr = r * U
    d.ellipse((c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr), fill=fill)
for top in (True, False):
    y0, y1 = (-GD, 0) if top else (H, H + GD)
    a, b = Pt(GL, y0), Pt(GR, y1)
    d.rectangle((a[0], a[1], b[0], b[1]), fill=(255, 255, 255, 13))
    x = GL
    while x <= GR + 1e-6:
        d.line([Pt(x, y0), Pt(x, y1)], fill=(236, 248, 240, 51), width=max(1, round(0.6 * U)))
        x += 6
    y = y0
    while y <= y1 + 1e-6:
        d.line([Pt(GL, y), Pt(GR, y)], fill=(236, 248, 240, 51), width=max(1, round(0.6 * U)))
        y += 6
    back = -GD if top else H + GD
    line = 0 if top else H
    d.line([Pt(GL, line), Pt(GL, back), Pt(GR, back), Pt(GR, line)], fill=CHALK, width=LW, joint="curve")
for top in (True, False):
    bx0 = (W - SBW) / 2
    by0 = 0 if top else H - SBD
    a, b = Pt(bx0, by0), Pt(bx0 + SBW, by0 + SBD)
    hatch = Image.new("RGBA", (int(b[0] - a[0]), int(b[1] - a[1])), (255, 255, 255, 9))
    hd = ImageDraw.Draw(hatch)
    step = 8 * U
    xx = -SBD * U
    while xx < hatch.width:
        hd.line([(xx, 0), (xx + SBD * U, hatch.height)], fill=(255, 255, 255, 23), width=max(1, round(1.2 * U)))
        xx += step
    layer.alpha_composite(hatch, (int(a[0]), int(a[1])))
rect_stroke(1, 1, W - 1, H - 1)
# Ligne médiane arrêtée au rond central, jamais dedans : le rond ne garde que le logo (demande du
# propriétaire du 29 oct. 2026 au soir : « pas de rond au milieu du logo, pas de lignes dans le rond »)
CENTER_R = 48
d.line([Pt(1, H / 2), Pt(W / 2 - CENTER_R, H / 2)], fill=CHALK, width=LW)
d.line([Pt(W / 2 + CENTER_R, H / 2), Pt(W - 1, H / 2)], fill=CHALK, width=LW)
arc(W / 2, H / 2, CENTER_R, 0, 2 * math.pi)
bx0, sx0 = (W - BBW) / 2, (W - SBW) / 2
rect_stroke(bx0, 1, bx0 + BBW, BBD)
rect_stroke(bx0, H - BBD, bx0 + BBW, H - 1)
rect_stroke(sx0, 1, sx0 + SBW, SBD)
rect_stroke(sx0, H - SBD, sx0 + SBW, H - 1)
a = math.asin((BBD - 72) / 48)
arc(W / 2, 72, 48, a, math.pi - a)
arc(W / 2, H - 72, 48, math.pi + a, 2 * math.pi - a)
for (x, y, s) in [(1, 1, 0), (W - 1, 1, math.pi / 2), (W - 1, H - 1, math.pi), (1, H - 1, math.pi * 1.5)]:
    arc(x, y, 10, s, s + math.pi / 2)
# Points de penalty seulement : pas de point central sur le logo
for (x, y) in [(W / 2, 72), (W / 2, H - 72)]:
    disc(x, y, 2.6, CHALK)
# Logo Nova : masque blanc sur fond transparent (nova-spirale.png, découpé de l'image du
# propriétaire sans la croix bleue de repère), 64 unités de large pour la spirale, centrée dans le
# rond sur sa forme (milieu de la découpe, 404 ; 310, et non plus son œil 432 ; 324,5 : sans point
# central, l'œil décalait la spirale de 2 unités vers la gauche) ; peint comme les lignes, plus pâle
LOGO = Image.open(logo_path).convert("RGBA")
LOGO_EYE = (404.0, 310.0)
LOGO_W = 64 / (LOGO.width - 12)  # unités par pixel de la découpe (6 px de marge de chaque côté)
LOGO_ALPHA = 0.5
lw, lh = round(LOGO.width * LOGO_W * U), round(LOGO.height * LOGO_W * U)
alpha = LOGO.getchannel("A").resize((lw, lh), Image.LANCZOS).point(lambda v: round(v * LOGO_ALPHA))
paint = Image.new("RGBA", (lw, lh), CHALK[:3] + (0,))
paint.putalpha(alpha)
cx, cy = Pt(W / 2, H / 2)
layer.alpha_composite(paint, (round(cx - LOGO_EYE[0] * LOGO_W * U), round(cy - LOGO_EYE[1] * LOGO_W * U)))
for (x, y) in [(GL, 0), (GR, 0), (GL, H), (GR, H)]:
    disc(x, y, POST, (255, 255, 255, 255))
layer = layer.resize((WD, HD), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.35))
base = im.convert("RGBA")
base.alpha_composite(layer)
base.convert("RGB").save(out)
print("ok", out)
