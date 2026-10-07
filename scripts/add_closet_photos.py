"""Turn David's own clothing photos into closet photos the site can use.

Phone photos are huge (12 MP) and carry hidden data: the camera model and, worse, the GPS
location where the photo was taken. So the originals go in incoming/ (never committed, see
.gitignore), and this script writes clean copies into assets/closet/:

    .venv/Scripts/python scripts/add_closet_photos.py

For each photo in incoming/ (named like the closet id, e.g. top-black-hoodie.jpg):
1. Turn it upright (phones store rotation as a tag instead of turning the pixels).
2. Shrink it so the long side is 1000 px, like the stock photos.
3. Save a JPG with no metadata at all: no GPS, no camera, no date.
4. Check the saved copy really has no metadata, and print its size for assets/closet/CREDITS.csv.

Then add the piece to assets/closet/CREDITS.csv and data/closet_tags.csv, and run scripts/build.py.
"""
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
INCOMING = ROOT / 'incoming'
CLOSET = ROOT / 'assets' / 'closet'
LONG_SIDE = 1000
JPG_QUALITY = 88


def main():
    photos = sorted(p for p in INCOMING.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))
    if not photos:
        raise SystemExit('incoming/ is empty: put the new photos there first')
    for source in photos:
        target = CLOSET / f'{source.stem}.jpg'
        with Image.open(source) as image:
            had_gps = bool(image.getexif().get_ifd(0x8825))
            upright = ImageOps.exif_transpose(image).convert('RGB')
        upright.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)   # keeps the shape, only ever shrinks
        upright.save(target, 'JPEG', quality=JPG_QUALITY, optimize=True)   # no exif= argument, so none is written

        with Image.open(target) as saved:   # check the copy, not just trust the save
            leftover = len(saved.getexif()) + len(saved.info.get('exif', b''))
            width, height = saved.size
        if leftover:
            raise SystemExit(f'{target.name} still has metadata')
        print(f'{target.name}: {width}x{height}, {target.stat().st_size / 1024:.0f} KB '
              f'(was {source.stat().st_size / 1024 / 1024:.1f} MB{", GPS removed" if had_gps else ""})')


if __name__ == '__main__':
    main()
