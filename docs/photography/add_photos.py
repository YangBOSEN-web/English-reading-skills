"""Add photos to the site: resize for the web, strip EXIF (incl. GPS), update photos.json.

Usage:
    python3 add_photos.py 原图1.jpg 原图2.jpg --group 林间白衣 --place 长沙 --date 2026-10-12

Each photo can also carry its own info in the file name, which wins over the flags:
    2026-10-12_林间白衣_长沙_回头.jpg   (date_group_place_title; any part may be left out from the end)
Run with --remove 文件名.jpg to take a photo off the site.
"""
import argparse
import datetime
import json
import re
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
PHOTOS = HERE / "photos"
LIST = HERE / "photos.json"
LONG_SIDE = 1800


def load():
    return json.loads(LIST.read_text(encoding="utf-8")) if LIST.exists() else []


def save(items):
    items.sort(key=lambda p: (p.get("date") or "", p["file"]), reverse=True)
    LIST.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def exif_date(im):
    # Only the original capture time; tag 306 is the last-edited time, often the day it was sent.
    raw = im.getexif().get_ifd(0x8769).get(36867)
    if raw and re.match(r"\d{4}:\d\d:\d\d", raw):
        return raw[:10].replace(":", "-")
    return ""


def parse_name(stem):
    parts = stem.split("_")
    info = {}
    if parts and re.fullmatch(r"\d{4}-\d\d(-\d\d)?", parts[0]):
        info["date"] = parts.pop(0)
    for key in ("group", "place", "title"):
        if parts:
            info[key] = parts.pop(0)
    return info


def add(src, args, items):
    src = Path(src)
    im = Image.open(src)
    im = ImageOps.exif_transpose(im).convert("RGB")
    info = {"date": args.date or exif_date(Image.open(src)), "group": args.group, "place": args.place, "title": args.title}
    info.update({k: v for k, v in parse_name(src.stem).items() if v})
    im.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)

    PHOTOS.mkdir(exist_ok=True)
    n = 1 + max([int(m.group(1)) for p in items if (m := re.match(r"(\d+)\.jpg$", p["file"]))], default=0)
    name = f"{n:03d}.jpg"
    im.save(PHOTOS / name, "JPEG", quality=82, optimize=True, progressive=True)  # no exif= → metadata dropped

    items.append({
        "file": name,
        "w": im.width,
        "h": im.height,
        "group": info["group"] or "日常",
        "title": info["title"] or "",
        "place": info["place"] or "",
        "date": info["date"] or "",
    })
    print(f"added {src.name} → photos/{name} ({im.width}×{im.height}, {(PHOTOS / name).stat().st_size // 1024} KB)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--group", default="", help="组名，例如 林间白衣（网站上的分类按钮）")
    ap.add_argument("--place", default="")
    ap.add_argument("--date", default="", help="YYYY-MM-DD 或 YYYY-MM")
    ap.add_argument("--title", default="")
    ap.add_argument("--remove", nargs="*", default=[], metavar="FILE", help="从网站删除这些照片，例如 003.jpg")
    args = ap.parse_args()

    items = load()
    for f in args.remove:
        items = [p for p in items if p["file"] != f]
        (PHOTOS / f).unlink(missing_ok=True)
        print(f"removed {f}")
    for f in args.files:
        add(f, args, items)
    save(items)
    print(f"photos.json: {len(items)} photos")


if __name__ == "__main__":
    main()
