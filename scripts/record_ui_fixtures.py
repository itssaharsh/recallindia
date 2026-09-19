#!/usr/bin/env python3
"""Record the live AWS responses the P06 demo fixtures are made of (so shapes cannot drift).

    python scripts/record_ui_fixtures.py --strip PHOTO.jpg --source-url URL --author A --license L
    python scripts/record_ui_fixtures.py --paste "Pantoprazole Tablets IP ... PEP5001" ...

``--strip`` uploads the photo to ``raw/uploads/<uuid>.jpg`` (the same path the app's presigned
PUT uses), runs Textract ``DetectDocumentText`` on it through ``common.aws_ai`` and saves the raw
response, with the photo's source and licence, to ``fixtures/aws_ai/textract_detect_text.json``.
``--paste`` runs Comprehend ``BatchDetectEntities`` on each line and saves one file per line
under ``fixtures/aws_ai/comprehend/<fixture_key>.json``. Live only: AWS_PROFILE=firstcommit.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for extra in (REPO_ROOT / "backend", Path(__file__).resolve().parent):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

FIXTURES = REPO_ROOT / "fixtures" / "aws_ai"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--strip", help="a strip photo (JPEG/PNG) to run through Textract")
    p.add_argument("--source-url", default="", help="where the photo came from")
    p.add_argument("--author", default="", help="the photo's author (for attribution)")
    p.add_argument("--license", default="", help="the photo's licence")
    p.add_argument("--paste", nargs="*", default=[], help="pasted lines to run through Comprehend")
    p.add_argument("--stack", default=os.environ.get("STACK_NAME") or "recallindia")
    p.add_argument("--profile", default=os.environ.get("AWS_PROFILE") or "firstcommit")
    args = p.parse_args(argv)

    from _live import configure_live

    outputs = configure_live(args.stack, args.profile)
    import boto3

    from common import aws_ai
    from common.s3 import bucket_name

    os.environ["RAW_BUCKET"] = outputs.get("RawBucketName") or os.environ.get("RAW_BUCKET", "")
    if args.strip:
        photo = Path(args.strip)
        ext = "png" if photo.suffix.lower() == ".png" else "jpg"
        key = f"uploads/{uuid.uuid4()}.{ext}"
        boto3.client("s3").put_object(
            Bucket=bucket_name("raw"), Key=key, Body=photo.read_bytes(),
            ContentType="image/png" if ext == "png" else "image/jpeg",
        )  # fmt: skip
        response = aws_ai.textract_detect_text(bucket_name("raw"), key)
        response.pop("ResponseMetadata", None)
        from api.strip_ocr import EDGE_BANDS, crop_band

        edges = {}
        for label, box in EDGE_BANDS:  # every band, so the demo can replay any stopping point
            band = aws_ai.textract_detect_text_bytes(
                crop_band(photo.read_bytes(), box), demo_band=label
            )
            band.pop("ResponseMetadata", None)
            edges[label] = band
            print(f"edge {label}: {[ln['text'] for ln in aws_ai.textract_lines(band)]}")
        record = {
            "source": {
                "file": photo.name,
                "url": args.source_url,
                "author": args.author,
                "license": args.license,
                "uploaded_key": key,
            },  # fmt: skip
            "Response": response,
            "Edges": edges,
        }
        out = FIXTURES / "textract_detect_text.json"
        out.write_text(json.dumps(record, indent=1, ensure_ascii=False) + "\n")
        lines = aws_ai.textract_lines(response)
        print(f"textract: {len(lines)} lines -> {out.relative_to(REPO_ROOT)}")
        for line in lines:
            print(
                f"  {line['confidence']:.2f} h={line['height']:.3f} top={line['top']:.2f}"
                f"  {line['text']}"
            )
    if args.paste:
        folder = FIXTURES / "comprehend"
        folder.mkdir(parents=True, exist_ok=True)
        for line, entities in zip(
            args.paste, aws_ai.comprehend_entities_batch(args.paste), strict=True
        ):
            path = folder / f"{aws_ai.fixture_key(line)}.json"
            path.write_text(
                json.dumps({"input": line.strip(), "Entities": entities}, indent=1) + "\n"
            )
            print(
                f"comprehend: {line!r} -> "
                f"{[(e['Type'], e['Text'], round(e['Score'], 2)) for e in entities]}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
