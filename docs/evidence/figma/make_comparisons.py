"""Compose labeled evidence pairs without altering either source image."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
FONT = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")


def fit(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    result = image.copy()
    result.thumbnail(box, Image.Resampling.LANCZOS)
    return result


def comparison(name: str, heading: str, earlier: Image.Image, later: Image.Image, later_label: str) -> None:
    canvas = Image.new("RGB", (2400, 1120), "#0b0e12")
    draw = ImageDraw.Draw(canvas)
    title_font = ImageFont.truetype(str(FONT_BOLD), 44)
    label_font = ImageFont.truetype(str(FONT_BOLD), 28)
    note_font = ImageFont.truetype(str(FONT), 20)
    draw.text((64, 44), heading, fill="#f5f7fa", font=title_font)
    labels = [
        ("BEFORE · Photo2Sim implementation", "Archived browser evidence; synthetic demo"),
        (later_label, "Exported directly from the Kamino Figma file"),
    ]
    for i, (label, note) in enumerate(labels):
        x = 64 + i * 1170
        draw.text((x, 124), label, fill="#76a9ff" if i else "#d6dce5", font=label_font)
        draw.text((x, 164), note, fill="#9aa5b4", font=note_font)
        draw.rounded_rectangle((x, 206, x + 1110, 1070), radius=14, fill="#14181e")
    for i, source in enumerate((earlier, later)):
        image = fit(source.convert("RGB"), (1080, 834))
        x = 64 + i * 1170 + (1110 - image.width) // 2
        y = 206 + (864 - image.height) // 2
        canvas.paste(image, (x, y))
    canvas.save(HERE / name, optimize=True)


old = Image.open(HERE / "before-completed-desktop.jpg")
upload_old = old.crop((0, 0, old.width, 795))
workspace_old = old.crop((0, 720, old.width, old.height))
comparison("comparison-upload.png", "Upload: one long form becomes a focused step", upload_old,
           Image.open(HERE / "upload.png"), "AFTER · Kamino Upload design")
comparison("comparison-workspace.png", "Review: file list becomes a visual workspace", workspace_old,
           Image.open(HERE / "workspace.png"), "AFTER · Kamino Workspace design")
