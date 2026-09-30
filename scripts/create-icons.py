"""Render the application's two-bar brand mark; requires Pillow only for regeneration."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
scale = 4
image = Image.new("RGBA", (256 * scale, 256 * scale))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle(tuple(v * scale for v in (8, 8, 248, 248)), 52 * scale, fill="#6b55cf")
bars = Image.new("RGBA", image.size)
draw = ImageDraw.Draw(bars)
draw.rounded_rectangle(tuple(v * scale for v in (78, 54, 118, 202)), 20 * scale, fill=(255, 255, 255, 255))
draw.rounded_rectangle(tuple(v * scale for v in (138, 94, 178, 202)), 20 * scale, fill=(255, 255, 255, 140))
image = Image.alpha_composite(image, bars.rotate(18, resample=Image.Resampling.BICUBIC))
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(root / "assets/icon.png")
image.save(root / "assets/icon.ico", sizes=[(n, n) for n in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
