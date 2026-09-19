"""Record the live API into ``app/public/fixtures`` for the app's ``?demo=1`` mode (P06).

Every GET the app makes is fetched once from the deployed API and saved as JSON, with a
``manifest.json`` keyed exactly the way the client asks (``"GET /v1/notices?limit=50"``; the
query in ``app/src/lib/api.ts`` ``query()`` order, values encoded like ``encodeURIComponent``).
Demo mode therefore reads the shapes the live API returns; nothing is hand-written, so they
cannot drift. Writes (POST) are never recorded: demo mode is read-only.

What is recorded:
* ``/v1/stats``;
* the feed: page 1 of every source and of all sources, plus ``--pages`` pages in all; the last
  recorded page's ``next_cursor`` is set to null so "Load more" ends where the recording ends;
* the wall: ``/items``, ``/items/<id>`` for every item with a case, and each case's notice;
* ``/ingest``: each ``--replay-runs`` run view (``/ingest/runs/<id>``: real step timings, rows,
  notices), a ``/ingest/runs`` list of exactly those runs (a demo can only replay what it has),
  and each run's PDF itself, downloaded next to the JSON with its ``/ingest/pdf`` answer pointing
  at that same-origin copy (a presigned S3 URL would expire).

    make app-fixtures                               # API URL from the stack outputs
    python scripts/gen_ui_fixtures.py --api-url https://<id>.execute-api.ap-south-1.amazonaws.com
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "public" / "fixtures"
PAGE = 50  # the feed's page size (feed-view.tsx PAGE)
# the live Textract run of the June 2025 archive alert (docs/P00-REPORT.md, Update 2026-09-19)
REPLAY_RUNS = ("ingest-20260919084944-ab53",)
RUN_SUMMARY_KEYS = (
    "run_id",
    "execution_arn",
    "status",
    "adapter",
    "month",
    "title",
    "method",
    "pages",
    "rows_in",
    "notices_out",
    "new",
    "pdf_s3_key",
    "started_at",
    "stopped_at",
    "duration_ms",
)
QUERY_ORDER = ("source", "since", "q", "limit", "cursor")
TIMEOUT = 30


def enc(value: object) -> str:
    """``encodeURIComponent``: leaves ``A-Z a-z 0-9 - _ . ! ~ * ' ( )`` as they are."""
    return quote(str(value), safe="!~*'()")


def query(**params: object) -> str:
    parts = [
        f"{key}={enc(params[key])}" for key in QUERY_ORDER if params.get(key) not in (None, "")
    ]
    return f"?{'&'.join(parts)}" if parts else ""


def filename(path: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")[:60] or "root"
    return f"{slug}-{hashlib.sha1(path.encode()).hexdigest()[:8]}.json"


class Recorder:
    def __init__(self, api_url: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.files: dict[str, str] = {}
        self.bodies: dict[str, object] = {}
        self.blobs: dict[str, bytes] = {}  # binary files served as-is (the replayed PDFs)

    def get(self, path: str) -> dict:
        request = urllib.request.Request(
            self.api_url + path, headers={"accept": "application/json"}
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as resp:
                body = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"GET {path} -> HTTP {exc.code}: {exc.read()[:300]!r}") from None
        except (urllib.error.URLError, TimeoutError) as exc:
            raise SystemExit(f"GET {path} failed: {exc}") from None
        self.record(path, body)
        return body

    def record(self, path: str, body: object) -> None:
        key = f"GET {path}"
        self.files[key] = filename(path)
        self.bodies[key] = body

    def notices(self, source: str | None, pages: int) -> None:
        cursor = None
        for number in range(1, pages + 1):
            path = f"/v1/notices{query(source=source, limit=PAGE, cursor=cursor)}"
            page = self.get(path)
            cursor = page.get("next_cursor")
            if not cursor:
                return
            if number == pages:  # the recording ends here: so does "Load more"
                self.record(path, {**page, "next_cursor": None})


def download(url: str) -> bytes:
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as resp:
            return resp.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SystemExit(f"download of {url[:80]} failed: {exc}") from None


def record_ingest(rec: Recorder, run_ids: tuple[str, ...] | list[str]) -> None:
    """Run views, a runs list of exactly those runs, and each run's PDF next to the JSON."""
    summaries = []
    for run_id in run_ids:
        view = rec.get(f"/ingest/runs/{enc(run_id)}")
        summaries.append({k: view.get(k) for k in RUN_SUMMARY_KEYS})
        key = view.get("pdf_s3_key")
        if not key:
            continue
        path = f"/ingest/pdf?key={enc(key)}"  # the client: `?key=${encodeURIComponent(key)}`
        answer = rec.get(path)
        name = str(key).rsplit("/", 1)[-1]
        rec.blobs[name] = download(answer["url"])
        rec.record(path, {**answer, "url": f"/fixtures/{name}"})
    rec.record("/ingest/runs", {"runs": summaries, "count": len(summaries)})


def record_all(
    api_url: str, pages: int, replay_runs: tuple[str, ...] | list[str] = REPLAY_RUNS
) -> Recorder:
    rec = Recorder(api_url)
    stats = rec.get("/v1/stats")
    rec.notices(None, pages)
    for source in stats.get("sources") or []:
        rec.notices(str(source["source"]), 1)
    items = rec.get("/items").get("items") or []
    seen_notices: set[str] = set()
    for item in items:
        if not item.get("case_id"):
            continue
        detail = rec.get(f"/items/{enc(item['item_id'])}")
        notice_id = (detail.get("case") or {}).get("notice_id")
        if notice_id and notice_id not in seen_notices:
            seen_notices.add(notice_id)
            rec.get(f"/v1/notices/{enc(notice_id)}")
    record_ingest(rec, replay_runs)
    return rec


def write(rec: Recorder, out: Path) -> int:
    out.mkdir(parents=True, exist_ok=True)
    for stale in [*out.glob("*.json"), *out.glob("*.pdf")]:
        stale.unlink()
    total = 0
    for name, data in rec.blobs.items():
        (out / name).write_bytes(data)
        total += len(data)
    for key, name in rec.files.items():
        data = json.dumps(rec.bodies[key], ensure_ascii=False, separators=(",", ":"))
        (out / name).write_text(data + "\n", encoding="utf-8")
        total += len(data)
    manifest = {
        "_recorded_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "_api": rec.api_url,
        **dict(sorted(rec.files.items())),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return total


def stack_api_url(stack: str, profile: str, region: str) -> str:
    import boto3

    session = boto3.Session(profile_name=profile, region_name=region)
    stacks = session.client("cloudformation").describe_stacks(StackName=stack)["Stacks"]
    outputs = {o["OutputKey"]: o["OutputValue"] for o in stacks[0].get("Outputs", [])}
    if not outputs.get("ApiUrl"):
        raise SystemExit(f"stack {stack!r} has no ApiUrl output")
    return outputs["ApiUrl"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--api-url", help="deployed API base URL (default: the stack's ApiUrl)")
    parser.add_argument("--stack", default="recallindia")
    parser.add_argument("--profile", default="firstcommit")
    parser.add_argument("--region", default="ap-south-1")
    parser.add_argument("--pages", type=int, default=3, help="feed pages recorded for all sources")
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument(
        "--replay-runs",
        nargs="*",
        default=list(REPLAY_RUNS),
        help="ingest runs demo mode can replay",
    )
    args = parser.parse_args(argv)
    api_url = args.api_url or stack_api_url(args.stack, args.profile, args.region)
    rec = record_all(api_url, max(1, args.pages), args.replay_runs)
    size = write(rec, args.out)
    print(f"recorded {len(rec.files)} responses ({size / 1024:.0f} KiB) from {api_url}")
    print(f"into {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
