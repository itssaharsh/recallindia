"""cdsco_normalise: extract rows -> notices, Bedrock batches with validation, the fixture PDF."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from common import bedrock, dynamo
from common.ingest_runs import read_run
from ingest import cdsco_extract, cdsco_normalise

FIXTURE_PDF = Path(__file__).resolve().parents[2] / "fixtures" / "cdsco" / "nsq_latest.pdf"
PDF_URL = cdsco_normalise.cdsco.JUNE_2025_PDF_URL
PDF_KEY = "cdsco/CDSCO_NSQ_june25.pdf"
HEADER = [
    "S.No",
    "Product/Drug Name",
    "Batch No.",
    "Manufact uring Date",
    "Expiry Date",
    "Manufactured By",
    "NSQ Result",
    "Reported by CDSCO Laboratory",
]
# five rows exactly as pdfplumber reads them off page 1 of fixtures/cdsco/nsq_latest.pdf
ROWS = [
    [
        "1.",
        "Dextrose Injection I.P. 5%w/v (D5)",
        "1-3098",
        "01/2025",
        "12/2027",
        "M/s. Tam-Bran Pharmaceuticals Pvt. Ltd., Plot No. 212 & 216, Sector-1, Industrial "
        "Area, Pithampur, District-Dhar (M.P.) India- 454775",
        "Assay of Dextrose (Anhydrous)",
        "CDL, Kolkata",
    ],
    [
        "2.",
        "Dexamethasone Sodium Phosphate Injection I.P. (Dexacos)",
        "P24L220",
        "12/2024",
        "11/2026",
        "M/s. Paksons pharmaceuticals Private Limited, 36, Milestone, Delhi Rohtak Road, "
        "Sankhol, Bahadurgarh-124507, Haryana",
        "Free Dexamethasone, Particulate matter and Description",
        "CDL, Kolkata",
    ],
    [
        "3.",
        "Methylcobalamin Injection",
        "S4H046",
        "08/2024",
        "01/2026",
        "M/s. Arion Healthcare, Vill. Kishanpura, Baddi, Distt. Solan-174101(H.P.)",
        "Assay of Methylcobalamin, Particulate matter and Description",
        "CDL, Kolkata",
    ],
    [
        "4.",
        "Tranexamic Acid Injection IP 500 mg/5ml",
        "Z24-185",
        "02/2024",
        "01/2026",
        "M/s. Zee Laboratories Ltd., Behind 47, Industrial Area, Paonta Sahib-173025",
        "Related Substances and Assay of Tranexamic Acid",
        "CDL, Kolkata",
    ],
    [
        "5.",
        "Oxytocin Injection I.P. 1ml",
        "AOX-2402",
        "04/2024",
        "03/2026",
        "M/s. Systochem Laboratories Ltd., B-75 Roop Nagar, Indl. Area, Loni-201102(U.P.)",
        "Assay of Oxytocin",
        "CDL, Kolkata",
    ],
]
PAGES = [1, 1, 1, 2, 2]


def _extract(rows: list[list[str]] = ROWS, pages: list[int] = PAGES) -> dict:
    """An ``$.extract`` payload in the P03 shape (``header`` + ``{page,row,cells,bbox}``)."""
    return {
        "adapter": "cdsco_pdf",
        "method": "pdfplumber",
        "fallback_used": False,
        "header": list(HEADER),
        "pages": max(pages),
        "rows": [
            {
                "page": page,
                "row": i + 1,
                "cells": list(cells),
                "bbox": {"left": 0.05, "top": 0.1 + 0.02 * i, "width": 0.9, "height": 0.02},
            }
            for i, (cells, page) in enumerate(zip(rows, pages, strict=True))
        ],
    }


def _synthetic_rows(count: int) -> list[list[str]]:
    """``count`` well-formed 8-column rows (no digits in maker names: brand parsing cuts there)."""
    names = ("Alpha", "Beta", "Gamma", "Delta", "Epsilon")
    rows = []
    for i in range(count):
        maker = "Maker Thirtyone Pharma" if i == 30 else f"Maker {names[i % 5]} Pharma"
        rows.append(
            [
                f"{i + 1}.",
                f"Drug {i + 1}",
                f"B{i + 1:03d}",
                "01/2025",
                "12/2026",
                f"M/s. {maker}, Baddi",
                "Assay",
                "CDL, Kolkata",
            ]
        )
    return rows


def _normalise(extract: dict | None = None) -> dict:
    return cdsco_normalise.normalise_pdf(
        extract or _extract(), month="JUN-2025", pdf_s3_key=PDF_KEY, pdf_url=PDF_URL
    )


@pytest.fixture
def live_bedrock(monkeypatch):
    """Pretend to be live for the Bedrock gate only (fetch/store still use demo fixtures)."""
    monkeypatch.setattr(cdsco_normalise, "is_demo", lambda: False)
    monkeypatch.delenv("_X_AMZN_TRACE_ID", raising=False)
    bedrock.reset_invocation_warning()
    yield
    bedrock.reset_invocation_warning()


def _fake_converse_json(calls: list[str], *, drop_last: bool = False):
    """A Bedrock stand-in that maps the batch in the prompt verbatim (optionally one short)."""

    def fake(kind: str, prompt: str, **kw) -> dict | None:
        assert kind == "normalise" and kw.get("temperature") == 0.0 and kw.get("system")
        calls.append(prompt)
        header = json.loads(prompt.split("header: ", 1)[1].split("\n", 1)[0])
        batch = json.loads(prompt.split("rows: ", 1)[1].split("\n", 1)[0])
        index = cdsco_normalise.header_map(header)
        mapped = []
        for cells in batch:
            entry = {}
            for field, key in (
                ("product", "product"),
                ("batch", "batch"),
                ("mfg_date", "mfg_date"),
                ("exp_date", "exp_date"),
                ("manufacturer", "brand"),
                ("result", "result"),
                ("lab", "lab"),
            ):
                i = index.get(key)
                entry[field] = cells[i] if i is not None and i < len(cells) else ""
            mapped.append(entry)
        if drop_last:
            mapped = mapped[:-1]
        return {"rows": mapped}

    return fake


# --------------------------------------------------------------------------- rows_from_extract


def test_rows_from_extract_header_first_and_pages_parallel():
    rows, pages = cdsco_normalise.rows_from_extract(_extract())
    assert rows[0] == HEADER and pages[0] is None
    assert rows[1:] == ROWS and pages[1:] == PAGES
    # pre-P03 shape (plain lists + row_pages, header as the first row) still maps
    legacy = {"rows": [HEADER, *ROWS], "row_pages": [1, *PAGES]}
    rows2, pages2 = cdsco_normalise.rows_from_extract(legacy)
    assert rows2 == [HEADER, *ROWS] and pages2 == [1, *PAGES]
    # header given both ways is not duplicated
    both = {"header": HEADER, "rows": [HEADER, *ROWS], "row_pages": [1, *PAGES]}
    assert cdsco_normalise.rows_from_extract(both)[0] == [HEADER, *ROWS]


# --------------------------------------------------------------------------- deterministic


def test_five_fixture_rows_become_five_notices():
    out = _normalise()
    notices = out["notices"]
    assert len(notices) == 5
    assert out["counts"]["created"] == 5 and out["counts"]["upserted"] == 5
    assert out["fallback_used"] == {"extract": False, "normalise": True}
    assert out["bedrock"]["attempted"] == 0 and out["bedrock"]["used"] == 0

    first = notices[0]
    assert first["product"] == "Dextrose Injection I.P. 5%w/v (D5)"
    assert first["batches"] == ["1-3098"]
    assert first["brand"] == "Tam-Bran Pharmaceuticals Pvt. Ltd."
    assert first["brand_lc"] == "tam-bran pharmaceuticals pvt. ltd."
    assert first["hazard_or_failed_test"] == "Assay of Dextrose (Anhydrous)"
    assert first["lab"] == "CDL, Kolkata"
    assert first["mfg_date"] == "01/2025" and first["exp_date"] == "12/2027"
    assert first["row_ref"] == {"page": 1, "row": 1, "month": None}
    assert "failed CDSCO quality test" in first["title"] and "JUN-2025" in first["title"]
    assert ("recall" + "ed") not in first["title"]

    for n, cells, page in zip(notices, ROWS, PAGES, strict=True):
        assert n["source"] == "cdsco_nsq" and n["adapter"] == "cdsco_pdf"
        assert n["product"] == cells[1] and n["batches"] == [cells[2]]
        assert n["hazard_or_failed_test"] == cells[6] and n["lab"] == cells[7]
        assert n["row_ref"]["page"] == page
        assert n["pdf_s3_key"] == PDF_KEY and n["url"] == PDF_URL
        assert n["source_confidence"] == "primary-official"
        assert n["published_at"] == "2025-06-01"
    assert [n["row_ref"]["row"] for n in notices] == [1, 2, 3, 4, 5]
    assert [n["brand"] for n in notices[1:]] == [
        "Paksons pharmaceuticals Private Limited",
        "Arion Healthcare",
        "Zee Laboratories Ltd.",
        "Systochem Laboratories Ltd.",
    ]

    # idempotent: a second pass rewrites nothing
    again = _normalise()
    assert again["counts"]["created"] == 0 and again["counts"]["unchanged"] == 5
    assert again["counts"]["upserted"] == 0
    stored = [n for n in dynamo.scan_all("notices") if not n["pk"].startswith("meta#")]
    assert len(stored) == 5 and all(n["first_seen_at"] for n in stored)


# --------------------------------------------------------------------------- Bedrock


def test_bedrock_disabled_is_one_warning_and_no_attempt(monkeypatch, caplog, live_bedrock):
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    monkeypatch.setattr(
        bedrock, "converse_json", lambda *a, **k: pytest.fail("must not call Bedrock")
    )
    caplog.set_level(logging.WARNING, logger="common.bedrock")
    out = _normalise()
    assert len(out["notices"]) == 5
    assert out["bedrock"] == {
        "enabled": False,
        "attempted": 0,
        "used": 0,
        "error": "disabled (BEDROCK_ENABLED=false)",
    }
    assert out["fallback_used"]["normalise"] is True
    warnings = [r.getMessage() for r in caplog.records if r.name == "common.bedrock"]
    assert warnings == [bedrock.DISABLED_WARNING]
    # a second normalise in the same invocation does not warn again
    _normalise()
    assert len([r for r in caplog.records if r.name == "common.bedrock"]) == 1


def test_demo_mode_never_calls_bedrock(monkeypatch):
    # Bedrock is off by default (no LLM in the decision path); this test is about the model
    # path, so it opts in explicitly rather than relying on a default.
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    monkeypatch.setattr(
        bedrock, "converse_json", lambda *a, **k: pytest.fail("must not call Bedrock")
    )
    out = _normalise()
    assert out["bedrock"]["enabled"] is True and out["bedrock"]["attempted"] == 0
    assert out["fallback_used"]["normalise"] is True


def test_bedrock_valid_mapping_gives_identical_notices(monkeypatch, live_bedrock):
    # Bedrock is off by default (no LLM in the decision path); this test is about the model
    # path, so it opts in explicitly rather than relying on a default.
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    deterministic = cdsco_normalise.rows_to_notices(
        [HEADER, *ROWS],
        adapter="pdf",
        month="JUN-2025",
        pdf_s3_key=PDF_KEY,
        url=PDF_URL,
        row_pages=[None, *PAGES],
    )
    calls: list[str] = []
    monkeypatch.setattr(bedrock, "converse_json", _fake_converse_json(calls))
    out = _normalise()
    assert len(calls) == 1
    assert "N = 5" in calls[0] and '"Batch No."' in calls[0]
    assert out["bedrock"] == {"enabled": True, "attempted": 1, "used": 1, "error": None}
    assert out["fallback_used"] == {"extract": False, "normalise": False}
    assert out["notices"] == deterministic
    assert out["counts"]["created"] == 5


def test_bedrock_invalid_batch_falls_back_and_stops(monkeypatch, live_bedrock):
    # Bedrock is off by default (no LLM in the decision path); this test is about the model
    # path, so it opts in explicitly rather than relying on a default.
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    rows = _synthetic_rows(60)
    pages = [1 + i // 20 for i in range(60)]
    calls: list[str] = []
    monkeypatch.setattr(bedrock, "converse_json", _fake_converse_json(calls, drop_last=True))
    out = _normalise(_extract(rows, pages))
    assert len(calls) == 1, "the first invalid batch must stop further batches"
    assert out["bedrock"]["attempted"] == 1 and out["bedrock"]["used"] == 0
    assert "not a valid mapping" in out["bedrock"]["error"]
    assert out["fallback_used"]["normalise"] is True
    assert len(out["notices"]) == 60
    assert out["notices"][59]["batches"] == ["B060"] and out["notices"][59]["row_ref"]["page"] == 3


def test_bedrock_partial_success_maps_the_rest_deterministically(monkeypatch, live_bedrock):
    """Batch 1 valid, batch 2 unusable: rows 26+ still map through the header keywords."""
    # Bedrock is off by default (no LLM in the decision path); this test is about the model
    # path, so it opts in explicitly rather than relying on a default.
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    rows = _synthetic_rows(40)
    pages = [1] * 40
    valid = _fake_converse_json([])
    calls: list[str] = []

    def fake(kind, prompt, **kw):
        calls.append(prompt)
        return valid(kind, prompt, **kw) if len(calls) == 1 else None

    monkeypatch.setattr(bedrock, "converse_json", fake)
    out = _normalise(_extract(rows, pages))
    assert len(calls) == 2
    assert out["bedrock"]["attempted"] == 2 and out["bedrock"]["used"] == 1
    assert out["fallback_used"]["normalise"] is True
    assert [n["batches"] for n in out["notices"]] == [[f"B{i + 1:03d}"] for i in range(40)]
    assert out["notices"][30]["brand"] == "Maker Thirtyone Pharma"


def test_bedrock_error_from_converse_is_contained(monkeypatch, live_bedrock):
    # Bedrock is off by default (no LLM in the decision path); this test is about the model
    # path, so it opts in explicitly rather than relying on a default.
    monkeypatch.setenv("BEDROCK_ENABLED", "true")

    def boom(*a, **k):
        raise bedrock.BedrockError("ap-south-1: Operation not allowed")

    monkeypatch.setattr(bedrock, "converse_json", boom)
    out = _normalise()
    assert out["bedrock"]["attempted"] == 1 and out["bedrock"]["used"] == 0
    assert "Operation not allowed" in out["bedrock"]["error"]
    assert len(out["notices"]) == 5 and out["fallback_used"]["normalise"] is True


# --------------------------------------------------------------------------- fixture PDF


def test_full_fixture_pdf_yields_at_least_55_notices_with_batches():
    extracted = cdsco_extract.extract_rows(FIXTURE_PDF.read_bytes())
    out = _normalise({**extracted, "adapter": "cdsco_pdf"})
    notices = out["notices"]
    assert len(notices) >= 55
    assert all(n["batches"] and n["batches"][0] for n in notices)
    assert all(n["product"] for n in notices)
    assert {n["published_at"] for n in notices} == {"2025-06-01"}
    assert {n["row_ref"]["page"] for n in notices} == {1, 2, 3, 4, 5, 6}
    assert {n["source_confidence"] for n in notices} == {"primary-official"}
    assert all("JUN-2025" in n["title"] for n in notices)
    assert out["counts"]["created"] == len(notices)


# --------------------------------------------------------------------------- handler


def test_handler_pdf_state_reads_extract_and_writes_the_run_record():
    arn = "arn:aws:states:ap-south-1:1:execution:recallindia-ingest-1:norm-1"
    state = {
        "adapter": "pdf",
        "run": {"execution_arn": arn, "execution_name": "norm-1"},
        "fetch": {
            "adapter": "cdsco_pdf",
            "title": "CDSCO NSQ ALERT FOR THE MONTH OF June 2025",
            "month": None,
            "pdf_url": PDF_URL,
            "pdf_s3_key": PDF_KEY,
            "degraded": False,
        },
        "extract": _extract(),
    }
    out = cdsco_normalise.handler(state, None)
    assert not out["degraded"], out
    assert out["adapter"] == "cdsco_pdf" and out["month"] == "JUN-2025"
    assert out["rows_in"] == 5 and out["notices_out"] == 5
    assert out["pdf_s3_key"] == PDF_KEY and out["pdf_url"] == PDF_URL
    assert out["counts"]["created"] == 5
    assert out["source_confidence"] == "primary-official" and out["run_id"] == "norm-1"
    assert out["fallback_used"] == {"extract": False, "normalise": True}
    run = read_run("norm-1")
    assert run["step"] == "normalise" and run["status"] == "done"
    assert run["notices_out"] == 5 and run["counts"]["created"] == 5


def test_handler_month_falls_back_to_header_then_default():
    state = {"adapter": "pdf", "extract": _extract()}
    assert cdsco_normalise.handler(state, None)["month"] == "JUN-2025"
    state = {"adapter": "pdf", "fetch": {"month": "may-2025"}, "extract": _extract()}
    out = cdsco_normalise.handler(state, None)
    assert out["month"] == "MAY-2025"
    assert {n["published_at"] for n in dynamo.scan_all("notices") if "MAY-2025" in n["pk"]} == {
        "2025-05-01"
    }


def test_handler_canonicalises_month_and_prefers_fetch_over_the_request(monkeypatch):
    """ "June 2025" and "JUN-2025" must name the same notices, never two sets of pks."""
    state = {"adapter": "pdf", "month": "June 2025", "extract": _extract()}
    out = cdsco_normalise.handler(state, None)
    assert out["month"] == "JUN-2025" and out["counts"]["created"] == 5
    again = cdsco_normalise.handler({**state, "month": "JUN-2025"}, None)
    assert again["counts"]["created"] == 0 and again["counts"]["unchanged"] == 5
    assert _prefixes() == {"cdsco_nsq#JUN-2025"}
    # the ISO spelling works too; $.fetch.month (canonical, from the listing) beats the request
    assert cdsco_normalise.handler({**state, "month": "2025-06"}, None)["month"] == "JUN-2025"
    fetch = {"adapter": "cdsco_pdf", "month": "MAY-2025", "pdf_url": PDF_URL}
    out = cdsco_normalise.handler({**state, "fetch": fetch, "month": "June 2025"}, None)
    assert out["month"] == "MAY-2025"
    # an unrecognisable month is a degraded step, not a new pk prefix
    bad = cdsco_normalise.handler({**state, "month": "sometime"}, None)
    assert bad["degraded"] is True and "unrecognised month" in bad["error"]
    assert _prefixes() == {"cdsco_nsq#JUN-2025", "cdsco_nsq#MAY-2025"}


def _prefixes() -> set[str]:
    """The ``cdsco_nsq#<MONTH>`` pk prefixes in the store (meta / ingest rows excluded)."""
    return {
        n["pk"].rsplit("-cdsco_pdf-", 1)[0]
        for n in dynamo.scan_all("notices")
        if n["pk"].startswith("cdsco_nsq#")
    }


def test_handler_refuses_a_degraded_upstream_step(monkeypatch):
    monkeypatch.setattr(cdsco_normalise, "fetch_bytes", lambda *a, **k: pytest.fail("downloaded"))
    degraded_fetch = {"adapter": "cdsco_pdf", "degraded": True, "error": "UpstreamError: 503"}
    out = cdsco_normalise.handler({"adapter": "pdf", "fetch": degraded_fetch}, None)
    assert out["degraded"] is True and out["error"].endswith("fetch degraded: UpstreamError: 503")
    fetch = {"adapter": "cdsco_pdf", "pdf_s3_key": PDF_KEY, "degraded": False}
    extract = {"adapter": "cdsco_pdf", "degraded": True, "error": "RuntimeError: both engines"}
    out = cdsco_normalise.handler({"adapter": "pdf", "fetch": fetch, "extract": extract}, None)
    assert out["degraded"] is True and "extract degraded: RuntimeError: both" in out["error"]
    # a fetch without a PDF and no rows anywhere: nothing to map, no default PDF
    out = cdsco_normalise.handler({"adapter": "pdf", "fetch": {"adapter": "cdsco_pdf"}}, None)
    assert out["degraded"] is True and "neither pdf_s3_key nor pdf_url" in out["error"]
    assert _prefixes() == set()


def test_row_ref_row_is_the_extract_row_index_after_a_continuation_merge():
    """A wrapped-manufacturer row merges into its predecessor: later notices keep the
    extractor's row numbers (the /ingest/rows join key) instead of shifting by one."""
    continuation = ["", "", "", "", "", "Plot 7, Baddi (H.P.)", "", ""]
    rows = [ROWS[0], continuation, ROWS[1], ROWS[2]]
    pages = [1, 1, 1, 2]
    out = _normalise(_extract(rows, pages))
    notices = out["notices"]
    assert [n["row_ref"]["row"] for n in notices] == [1, 3, 4]
    assert [n["row_ref"]["page"] for n in notices] == [1, 1, 2]
    assert [n["notice_id"] for n in notices] == [f"JUN-2025-cdsco_pdf-{r}" for r in (1, 3, 4)]
    assert notices[0]["brand"] == "Tam-Bran Pharmaceuticals Pvt. Ltd."
    assert "Plot 7, Baddi" in notices[0]["raw_excerpt"]
    assert "row 3" in notices[1]["title"]
    ids = cdsco_normalise.row_ids_from_extract(_extract(rows, pages))
    assert ids == [None, 1, 2, 3, 4]
    # plain list rows carry no index: the record counter is used as before
    legacy = {"rows": [HEADER, *rows], "row_pages": [1, *pages]}
    assert cdsco_normalise.row_ids_from_extract(legacy) == [None] * 5
    assert [n["row_ref"]["row"] for n in _normalise(legacy)["notices"]] == [1, 2, 3]


def test_handler_portal_default_and_degraded_paths(monkeypatch):
    out = cdsco_normalise.handler({}, None)
    assert out["adapter"] == "cdsco_portal" and out["month"] == "JUL-2026"
    assert out["rows_in"] == out["notices_out"] == 239
    assert out["counts"]["created"] == 239 and out["pdf_s3_key"] is None
    assert out["fallback_used"] == {"extract": False, "normalise": True}
    assert out["run_id"].startswith("local-")

    monkeypatch.setattr(
        cdsco_normalise.cdsco_fetch, "fetch_portal_rows", lambda m: 1 / 0
    )  # upstream blows up
    bad = cdsco_normalise.handler({"adapter": "portal", "execution_arn": "x:norm-bad"}, None)
    assert bad["degraded"] is True and "ZeroDivisionError" in bad["error"]
    assert read_run("norm-bad")["status"] == "failed"
