"""Stade « style Milan sans marques » : écussons et « AC MILAN » remplacés par le logo D'Home Barber
et « LA COUPE DU GANG ». Usage : python3 nettoyer_stade.py <original.jpg> <logo.png> <police.ttf> <sortie.png>"""
import sys, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

src, logo_path, font_path, out = sys.argv[1:5]
im = Image.open(src).convert("RGB")
W, H = im.size
logo = Image.open(logo_path).convert("RGBA")
logo = logo.crop(logo.getbbox())
random.seed(7)

def median_color(box, keep):
    px = [p for p in im.crop(box).getdata() if keep(p)]
    if not px:
        return (20, 20, 22)
    px.sort(key=lambda p: sum(p))
    return px[len(px) // 2]

reddish = lambda p: p[0] > 120 and p[1] < 90 and p[2] < 90
darkish = lambda p: sum(p) < 90

def paint_ellipse(cx, cy, rx, ry, color, blur=2.0, noise=6):
    """Recouvre une ellipse d'une couleur unie (bords adoucis, grain léger comme le JPEG)."""
    pad = int(blur * 3) + 2
    box = (cx - rx - pad, cy - ry - pad, cx + rx + pad, cy + ry + pad)
    w, h = box[2] - box[0], box[3] - box[1]
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse((pad, pad, pad + 2 * rx, pad + 2 * ry), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    fill = Image.new("RGB", (w, h), color)
    if noise:
        n = Image.effect_noise((w, h), noise).convert("L")
        fill = ImageChops.add(fill, Image.merge("RGB", (n, n, n)), scale=1.0, offset=-128)
    im.paste(fill, box[:2], mask)

def paste_logo(cx, cy, width, angle=0, opacity=1.0):
    lw = int(width)
    lh = int(logo.height * lw / logo.width)
    l = logo.resize((lw, lh), Image.LANCZOS)
    if angle:
        l = l.rotate(angle, resample=Image.BICUBIC, expand=True)
    if opacity < 1:
        a = l.getchannel("A").point(lambda v: int(v * opacity))
        l.putalpha(a)
    im.paste(l, (int(cx - l.width / 2), int(cy - l.height / 2)), l)

# 1. Petits drapeaux rouges (losanges) : écusson recouvert de rouge, petit logo dessus
small = [(243, 140), (260, 317), (963, 138), (952, 318), (88, 533), (1120, 533),
         (80, 1400), (80, 1668), (1130, 1400), (1126, 1664, 20, 29), (142, 1830, 16, 18), (1067, 1828, 17, 19),
         (380, 1928), (828, 1928)]
for cx, cy, *size in small:
    rx, ry = size or (20, 25)
    red = median_color((cx - 34, cy - 34, cx + 34, cy + 34), reddish)
    paint_ellipse(cx, cy, rx, ry, red, blur=1.8, noise=3)
    paste_logo(cx, cy + 1, 30)

# 2. Grandes bannières d'angle (haut) : médaillon noir à liseré, logo au centre
for cx, cy in [(140, 295), (1072, 295)]:
    paint_ellipse(cx, cy, 52, 86, (236, 236, 236), blur=1.5, noise=4)
    paint_ellipse(cx, cy, 47, 81, (14, 14, 16), blur=1.2, noise=5)
    paste_logo(cx, cy + 2, 86)

# 3. Bannière noire du bas (centre) : logo à la place de l'écusson
dark = median_color((560, 1865, 650, 1960), darkish)
paint_ellipse(602, 1913, 24, 36, dark, blur=1.6)
paste_logo(602, 1913, 64)

# 4. Bannières verticales des côtés : fond noir repeint entre les bandes rouges, logo, texte
font = ImageFont.truetype(font_path, 64)
def vertical_text(text, length, thickness, ccw):
    """Texte blanc espacé, mis à l'échelle pour tenir dans `length` × `thickness`, tourné de 90°."""
    spacing = 6
    widths = [font.getbbox(c)[2] - font.getbbox(c)[0] if c != " " else 18 for c in text]
    total = sum(widths) + spacing * (len(text) - 1)
    asc, desc = font.getmetrics()
    t = Image.new("RGBA", (total + 8, asc + desc + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    x = 4
    for c, w in zip(text, widths):
        if c != " ":
            d.text((x - font.getbbox(c)[0], 4), c, font=font, fill=(242, 242, 242, 255))
        x += w + spacing
    t = t.crop(t.getbbox())
    scale = min(length / t.width, thickness / t.height)
    t = t.resize((max(1, int(t.width * scale)), max(1, int(t.height * scale))), Image.LANCZOS)
    return t.rotate(90 if ccw else -90, expand=True, resample=Image.BICUBIC)

for side in ("gauche", "droite"):
    if side == "gauche":
        x0, x1, crest = 52, 117, (75, 767)
    else:
        x0, x1, crest = 1089, 1158, (1130, 765)
    y0, y1 = 690, 1182
    dark = median_color((x0 + 6, 820, x1 - 6, 850), darkish)
    box = (x0, y0, x1, y1)
    w, h = x1 - x0, y1 - y0
    fill = Image.new("RGB", (w, h), dark)
    n = Image.effect_noise((w, h), 5).convert("L")
    fill = ImageChops.add(fill, Image.merge("RGB", (n, n, n)), offset=-128)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle((2, 2, w - 3, h - 3), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    im.paste(fill, box[:2], mask)
    paste_logo(crest[0], crest[1], w - 10)
    txt = vertical_text("LA COUPE DU GANG", length=h - 150, thickness=w - 26, ccw=(side == "gauche"))
    cx = (x0 + x1) / 2
    cy = 840 + (y1 - 20 - 840) / 2
    im.paste(txt, (int(cx - txt.width / 2), int(cy - txt.height / 2)), txt)

im.save(out)
print("ok", out, im.size)
