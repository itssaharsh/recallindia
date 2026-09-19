#!/usr/bin/env python3
"""Live smoke check for ``common.aws_ai``: Comprehend, Translate and Polly, each called once.

Usage (from the repo root)::

    AWS_PROFILE=firstcommit AWS_DEFAULT_REGION=ap-south-1 python scripts/aws_ai_check.py
    ... python scripts/aws_ai_check.py --save-fixtures   # also write fixtures/aws_ai/*

Runs the three live calls with one fixed input (a CDSCO NSQ-style line), prints a compact result
per service and, with ``--save-fixtures``, writes ``fixtures/aws_ai/comprehend_entities.json``,
``translate_en_hi.json`` (input recorded alongside the response) and ``polly_sample.mp3`` exactly
as received. Polly speaks the Hindi translation when Translate succeeded (that is the P10 voice
note), otherwise the English input. ``DEMO_MODE`` is forced to 0; ``AWS_PROFILE`` defaults to
``firstcommit``; the region is never changed on failure (the exact error text is printed).

Exit status: 0 when all three services succeeded, 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ["DEMO_MODE"] = "0"
os.environ.setdefault("AWS_PROFILE", "firstcommit")
os.environ.setdefault("AWS_DEFAULT_REGION", "ap-south-1")

from common import aws_ai  # noqa: E402  (path + env must be set before this import)

FIXED_INPUT = (
    "Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals, "
    "failed CDSCO quality test, July 2026 alert"
)
FIXTURE_DIR = REPO_ROOT / "fixtures" / "aws_ai"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aws_ai_check.py",
        description="Call Comprehend, Translate and Polly once each and print the results.",
    )
    parser.add_argument(
        "--save-fixtures",
        action="store_true",
        help="write fixtures/aws_ai/* (comprehend, translate, polly) exactly as received",
    )
    return parser


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def check_comprehend(save: bool) -> bool:
    try:
        entities = aws_ai.comprehend_entities(FIXED_INPUT)
    except Exception as err:  # print the exact error text, keep going with the other services
        print(f"comprehend  FAIL  {err}")
        return False
    head = [{k: e.get(k) for k in ("Text", "Type", "Score")} for e in entities[:3]]
    print(f"comprehend  OK    {len(entities)} entities; first 3: {json.dumps(head)}")
    if save:
        _write_json(
            FIXTURE_DIR / "comprehend_entities.json", {"input": FIXED_INPUT, "Entities": entities}
        )
    return True


def check_translate(save: bool) -> str | None:
    try:
        hindi = aws_ai.translate(FIXED_INPUT, "en", "hi")
    except Exception as err:
        print(f"translate   FAIL  {err}")
        return None
    print(f"translate   OK    {hindi}")
    if save:
        _write_json(
            FIXTURE_DIR / "translate_en_hi.json",
            {
                "input": FIXED_INPUT,
                "TranslatedText": hindi,
                "SourceLanguageCode": "en",
                "TargetLanguageCode": "hi",
            },
        )
    return hindi


def check_polly(text: str, save: bool) -> bool:
    try:
        voice, engine = aws_ai.polly_voice()
        if voice != aws_ai.PREFERRED_VOICES[0]:
            print(
                f"polly       NOTE  {aws_ai.PREFERRED_VOICES[0]} not available in "
                f"{aws_ai.REGION}; falling back to {voice}"
            )
        mp3 = aws_ai.polly_mp3(text, voice=voice)
    except Exception as err:
        print(f"polly       FAIL  {err}")
        return False
    print(f"polly       OK    voice={voice} engine={engine} mp3={len(mp3)} bytes")
    if save:
        FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
        (FIXTURE_DIR / "polly_sample.mp3").write_bytes(mp3)
    return True


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(f"region={aws_ai.REGION} profile={os.environ.get('AWS_PROFILE')}")
    ok_comprehend = check_comprehend(args.save_fixtures)
    hindi = check_translate(args.save_fixtures)
    ok_polly = check_polly(hindi or FIXED_INPUT, args.save_fixtures)
    if args.save_fixtures:
        print(f"fixtures -> {FIXTURE_DIR}")
    return 0 if (ok_comprehend and hindi is not None and ok_polly) else 1


if __name__ == "__main__":
    sys.exit(main())
