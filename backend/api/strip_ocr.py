"""Read a strip photo: the whole photo first, then its edge bands until a batch turns up.

Textract ``DetectDocumentText`` reads the photo's dominant text orientation. Indian strips
usually stamp the batch / Mfg / Exp in ink *vertically along one edge*, so on a full photo that
stamp is the minority orientation and is skipped (measured on a real strip: 56 lines read, the
"B.NO.446AG710 / MFD.06/2017 / EXP.05/2020" stamp not among them). Cropped to the edge band the
stamp dominates and Textract reads it without rotating anything. So: one full pass, and only if
no batch was found, the right / left / bottom / top 30% bands, stopping at the first band that
yields one (at most four more calls).
"""

from __future__ import annotations

import io
from collections.abc import Callable

from common import aws_ai, s3
from common.demo_mode import is_demo

try:
    from api import item_parse
except ModuleNotFoundError:  # Lambda layout
    import item_parse  # type: ignore[no-redef]

# (label, (left, top, right, bottom) as fractions of the photo)
EDGE_BANDS: tuple[tuple[str, tuple[float, float, float, float]], ...] = (
    ("right", (0.70, 0.0, 1.0, 1.0)),
    ("left", (0.0, 0.0, 0.30, 1.0)),
    ("bottom", (0.0, 0.70, 1.0, 1.0)),
    ("top", (0.0, 0.0, 1.0, 0.30)),
)
MAX_BAND_BYTES = 5 * 1024 * 1024  # Textract's limit for Bytes input


def crop_band(image: bytes, box: tuple[float, float, float, float]) -> bytes:
    """JPEG bytes of one band of ``image`` (fractions of its width / height)."""
    from PIL import Image, ImageOps  # lazy: only the live OCR path needs Pillow

    with Image.open(io.BytesIO(image)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")  # phone photos carry an EXIF rotation
        w, h = im.size
        band = im.crop((int(w * box[0]), int(h * box[1]), int(w * box[2]), int(h * box[3])))
        for quality in (90, 80, 70):
            out = io.BytesIO()
            band.save(out, "JPEG", quality=quality)
            if out.tell() <= MAX_BAND_BYTES:
                return out.getvalue()
    return out.getvalue()


def read_strip(key: str, load_image: Callable[[], bytes] | None = None) -> dict:
    """Prefilled item fields for the uploaded photo at ``raw/<key>`` (``parse_strip`` shape)
    plus ``passes`` (which Textract passes ran) and the lines read."""
    bucket = s3.bucket_name("raw")
    lines = aws_ai.textract_lines(aws_ai.textract_detect_text(bucket, key))
    parsed = item_parse.parse_strip(lines)
    passes = ["full"]
    if not parsed["fields"]["batch"]:
        image = b"" if is_demo() else (load_image or (lambda: s3.get_bytes("raw", key)))()
        for label, box in EDGE_BANDS:
            data = b"" if is_demo() else crop_band(image, box)
            band_lines = aws_ai.textract_lines(
                aws_ai.textract_detect_text_bytes(data, demo_band=label)
            )
            for line in band_lines:
                line["edge"] = label
            lines = lines + band_lines
            parsed = item_parse.parse_strip(lines)
            passes.append(f"edge:{label}")
            if parsed["fields"]["batch"]:
                break
    return {**parsed, "passes": passes, "all_lines": lines}
