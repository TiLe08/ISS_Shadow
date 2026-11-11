# vergleich.py: setzt ein Livebild und eine Zwillingsansicht (camshot.py) mit Titeln nebeneinander.
# Aufruf: python vergleich.py live.png zwilling.png aus.png "Titel links" "Titel rechts"
import sys
from PIL import Image, ImageDraw, ImageFont

live, twin, out, title_l, title_r = sys.argv[1:6]
H, GAP, TOP, PAD = 900, 14, 60, 14
BG, WHITE, CYAN = (6, 12, 18), (225, 232, 240), (63, 224, 255)


def fit(path):
    im = Image.open(path).convert('RGB')
    return im.resize((round(im.width * H / im.height), H), Image.LANCZOS)


def font(size):
    for name in ('DejaVuSans-Bold.ttf', 'arialbd.ttf', 'Arial Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


a, b = fit(live), fit(twin)
img = Image.new('RGB', (PAD + a.width + GAP + b.width + PAD, TOP + H + PAD), BG)
img.paste(a, (PAD, TOP)); img.paste(b, (PAD + a.width + GAP, TOP))
d = ImageDraw.Draw(img); f = font(26)
d.text((PAD, 20), title_l, fill=WHITE, font=f); d.text((PAD + a.width + GAP, 20), title_r, fill=CYAN, font=f)
img.save(out); print('ok', out, img.size)
