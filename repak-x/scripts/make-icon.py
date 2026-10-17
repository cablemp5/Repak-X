"""repakxtra's logo images, all cut from one source: .github/brand/repakxtralogo-source.png ("repak" in white, "xtra"
in blue dots, on transparency). Run from repak-x/ with any Python that has Pillow:
    python scripts/make-icon.py [--sheet contact.png] [--test-ico path.ico]
Writes
  - the wordmark the app shows (src/assets/brand/wordmark.png) and its ink copy for the light theme (wordmark-ink.png),
  - the README banner (.github/brand/wordmark-dark.png and wordmark-light.png),
  - the app icon, the dotted x alone: icons/RepakIcon.png (512) and icons/RepakIcon.ico (16 to 256), which
    tauri.conf.json bundles into the exe (taskbar, window, desktop shortcut), plus the same x inside the app (the splash
    image and ModularLogo's masks in src/assets/app-icons). RepakIcon-x256.png stays Repak X's own logo: the Discord
    widget shows the original.
--sheet writes the 16, 24, 32 and 48 px icons on dark and light, to check the dots still read at small sizes.
--test-ico writes the icon in the test build's green, for the test copy's desktop shortcut (kept outside the repo)."""
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parent
SOURCE = ROOT / ".github" / "brand" / "repakxtralogo-source.png"
X_BOX = (1597, 665, 1874, 930)   # the dotted x in the source
MARGIN = 0.08                    # transparent margin around the x in the square icon
INK = (0x0A, 0x0A, 0x0A)         # "repak" on the light theme
TEST_GREEN = (0x3E, 0xCF, 0x6E)  # the test build's mark (theme.css, xtra_buildmark.rs)
# The .ico sizes: BOX (a plain area average) keeps the most contrast at 24 px on the contact sheet (see --sheet). The
# dots cover about 40% of the x, so at 16 px no filter gets past about 40% opacity.
ICON_FILTER = Image.BOX
ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)


def shrink(im, size, resample=Image.LANCZOS):
    """Resized with premultiplied alpha, so transparent pixels do not bleed dark fringes into the edges."""
    return im.convert("RGBa").resize(size, resample).convert("RGBA")


def save_small(im, path):
    """A 256-color palette PNG (alpha kept): keeps each wordmark well under 50 KB with no visible change."""
    im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE).save(path, optimize=True)


def to_height(im, height):
    return shrink(im, (round(im.width * height / im.height), height))


def ink(im):
    """Low-saturation pixels (the white "repak" and its soft edge) turn ink; alpha and the blue dots stay."""
    saturation = im.convert("RGB").convert("HSV").getchannel("S")
    out = im.copy()
    out.paste(Image.new("RGBA", im.size, INK + (255,)), mask=saturation.point(lambda s: 255 if s < 77 else 0))
    out.putalpha(im.getchannel("A"))
    return out


def tinted(im, rgb):
    """Every pixel in one color, its own alpha kept: what xtra_buildmark.rs does to the window icon."""
    out = Image.new("RGBA", im.size, rgb + (255,))
    out.putalpha(im.getchannel("A"))
    return out


def icon_square(src):
    x = src.crop(X_BOX)
    side = round(max(x.size) / (1 - 2 * MARGIN))
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(x, ((side - x.width) // 2, (side - x.height) // 2))
    return square


def icon_frames(square, resample=ICON_FILTER, rgb=None):
    """Each size made straight from the full-size crop (not from a smaller copy)."""
    frames = [shrink(square, (s, s), resample) for s in ICON_SIZES]
    return [tinted(f, rgb) for f in frames] if rgb else frames   # tinted after shrinking: exact color at every alpha


def save_ico(frames, path):
    frames = sorted(frames, key=lambda f: f.width, reverse=True)
    frames[0].save(path, sizes=[f.size for f in frames], append_images=frames[1:])


def contact_sheet(square, path):
    """Rows: one per resampling filter; each row the 16/24/32/48 icons on dark, then on light, drawn 4x with no
    smoothing so each pixel shows."""
    filters = [("LANCZOS", Image.LANCZOS), ("BICUBIC", Image.BICUBIC), ("HAMMING", Image.HAMMING), ("BOX", Image.BOX)]
    sizes, zoom, pad = (16, 24, 32, 48), 4, 12
    cell = 48 * zoom + pad
    sheet = Image.new("RGBA", (cell * len(sizes) * 2 + pad, cell * len(filters) + pad), (128, 128, 128, 255))
    for row, (_, f) in enumerate(filters):
        for half, bg in enumerate([(10, 10, 10, 255), (245, 245, 245, 255)]):
            for col, s in enumerate(sizes):
                tile = Image.new("RGBA", (48 * zoom, 48 * zoom), bg)
                icon = shrink(square, (s, s), f).resize((s * zoom, s * zoom), Image.NEAREST)
                tile.alpha_composite(icon, ((tile.width - icon.width) // 2, (tile.height - icon.height) // 2))
                sheet.paste(tile, (pad + (half * len(sizes) + col) * cell, pad + row * cell))
    sheet.save(path)
    print("rows:", ", ".join(n for n, _ in filters))


def main(args):
    src = Image.open(SOURCE).convert("RGBA")
    word = src.crop(src.getchannel("A").getbbox())   # trims the transparent padding

    brand = HERE / "src" / "assets" / "brand"
    brand.mkdir(parents=True, exist_ok=True)
    app = to_height(word, 78)   # 3x the tallest spot it shows at (Credits, 25 px); the header shows it at 22 px
    save_small(app, brand / "wordmark.png")
    save_small(ink(app), brand / "wordmark-ink.png")
    readme = to_height(word, 292)   # 3x the README's 560 px wide banner (97 px tall)
    save_small(readme, ROOT / ".github" / "brand" / "wordmark-dark.png")
    save_small(ink(readme), ROOT / ".github" / "brand" / "wordmark-light.png")

    square = icon_square(src)
    big = shrink(square, (512, 512))   # larger than the source crop (330 px): a smooth filter, not BOX
    assert big.getpixel((0, 0))[3] == 0, "transparent corners"
    big.save(HERE / "icons" / "RepakIcon.png", optimize=True)
    save_ico(icon_frames(square), HERE / "icons" / "RepakIcon.ico")
    art = HERE / "src" / "assets" / "app-icons"
    big.save(art / "RepakIcon-x512.png", optimize=True)
    mask = Image.new("RGBA", big.size, (255, 255, 255, 0))
    mask.putalpha(big.getchannel("A"))
    mask.save(art / "logomask_R.png", optimize=True)   # ModularLogo's accent layer draws the x; its X layer stays empty

    if "--sheet" in args:
        contact_sheet(square, args[args.index("--sheet") + 1])
    if "--test-ico" in args:
        save_ico(icon_frames(square, rgb=TEST_GREEN), args[args.index("--test-ico") + 1])
    print("wrote the wordmarks, the README banner, icons/RepakIcon.png, icons/RepakIcon.ico and src/assets/app-icons")


if __name__ == "__main__":
    main(sys.argv[1:])
