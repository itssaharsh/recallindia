"""P01 smoke test: every Lambda handler imports and answers a dict in DEMO_MODE."""

from __future__ import annotations

import importlib
import json
import os

import pytest

HANDLER_MODULES = [
    "pollers.cpsc",
    "pollers.nhtsa",
    "pollers.openfda",
    "ingest.cdsco_fetch",
    "ingest.cdsco_extract",
    "ingest.cdsco_normalise",
    "matcher.candidates",
    "matcher.verify",
    "matcher.range_check",
    "matcher.notify",
    "matcher.claim",
    "matcher.evidence",
    "api.app",
]


@pytest.fixture(autouse=True)
def _demo_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("DEMO_STORE_DIR", str(tmp_path / "store"))
    monkeypatch.delenv("RAW_BUCKET", raising=False)


def _api_event(method: str, path: str, qs: dict | None = None) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "queryStringParameters": qs or {},
        "requestContext": {"http": {"method": method, "path": path}},
    }


@pytest.mark.parametrize("module_name", HANDLER_MODULES)
def test_every_handler_returns_dict(module_name):
    module = importlib.import_module(module_name)
    assert callable(module.handler)
    out = module.handler({}, None)
    assert isinstance(out, dict), module_name
    assert not out.get("degraded"), f"{module_name} degraded: {out.get('error')}"


def test_cpsc_fetched_count():
    from pollers import cpsc

    out = cpsc.handler({}, None)
    assert out["source"] == "cpsc"
    assert out["fetched"] == 451
    assert out["degraded"] is False
    assert cpsc.count_records([1, 2, 3]) == 3


def test_nhtsa_empty_result_is_not_degraded():
    from pollers import nhtsa

    out = nhtsa.handler({}, None)
    assert out["fetched"] == 0
    assert out["degraded"] is False
    assert nhtsa.count_records({"Count": 0, "results": []}) == 0
    accord = nhtsa.handler({"make": "honda", "model": "accord", "modelYear": 2024}, None)
    assert accord["fetched"] == 3


def test_openfda_sorted_newest_first():
    from pollers import openfda

    assert "sort=report_date:desc" in openfda.build_url()
    out = openfda.handler({}, None)
    assert out["fetched"] == 25
    assert out["degraded"] is False


def test_cdsco_fetch_portal():
    from ingest import cdsco_fetch

    out = cdsco_fetch.handler({}, None)
    assert out["adapter"] == "cdsco_portal"
    assert out["month"] == "JUL-2026"
    assert out["rows_in"] == 239


def test_cdsco_fetch_pdf_adapter_stores_bytes():
    from ingest import cdsco_fetch

    out = cdsco_fetch.handler({"adapter": "pdf"}, None)
    assert out["adapter"] == "cdsco_pdf"
    assert out["pdf_s3_key"].startswith("cdsco/")
    assert out["bytes"] > 100_000


def test_cdsco_normalise_portal_rows_to_notices():
    from ingest import cdsco_normalise

    out = cdsco_normalise.handler({}, None)
    assert out["adapter"] == "cdsco_portal"
    assert out["rows_in"] == 239
    assert out["notices_out"] == 239
    assert out["fallback_used"] == {"extract": False, "normalise": True}

    rows = [
        {
            "str_product_name": "Paracetamol Tablets IP 650mg",
            "str_batch_no": "FT5427",
            "dt_manufacturing_date": "Mar-2025",
            "dt_expiry_date": "Feb-2027",
            "str_manufactured_by": "Forgo Pharmaceuticals",
            "str_nsq_result": "Dissolution",
            "str_reporting_source": "CDSCO Lab",
            "str_reported_by_lab_or_state": "CDL, Kolkata",
            "dt_reporting_month_year": "JUL-2026",
        }
    ]
    notices = cdsco_normalise.rows_to_notices(rows, adapter="portal", month="JUL-2026")
    n = notices[0]
    assert n["source"] == "cdsco_nsq" and n["adapter"] == "cdsco_portal"
    assert n["pk"] == "cdsco_nsq#JUL-2026-cdsco_portal-1"
    assert n["batches"] == ["FT5427"] and n["brand_lc"] == "forgo pharmaceuticals"
    assert n["published_at"] == "2026-07-01"
    assert n["row_ref"] == {"page": None, "row": 1, "month": "JUL-2026"}
    assert "failed CDSCO quality test" in n["title"] and ("recall" + "ed") not in n["title"]


def test_cdsco_normalise_pdf_rows_header_mapping():
    from ingest import cdsco_normalise

    rows = [
        [
            "S.No",
            "Product/Drug Name",
            "Batch No.",
            "Manufacturing Date",
            "Expiry Date",
            "Manufactured By",
            "NSQ Result",
            "Reported by CDSCO Laboratory",
        ],
        [
            "9.",
            "Calcium Gluconate Injection I.P. 10 ml.",
            "MV24B36",
            "02/2024",
            "01/2026",
            "M/s. Martin & Brown Bio-Sciences Pvt.Ltd., Baddi, HP",
            "Particulate Matter, Extractable Volume and Description",
            "CDL, Kolkata",
        ],
    ]
    notices = cdsco_normalise.rows_to_notices(
        rows,
        adapter="pdf",
        month="JUN-2025",
        pdf_s3_key="cdsco/nsq_latest.pdf",
        url="https://x/y.pdf",
    )
    assert len(notices) == 1
    n = notices[0]
    assert n["adapter"] == "cdsco_pdf" and n["pdf_s3_key"] == "cdsco/nsq_latest.pdf"
    assert n["product"].startswith("Calcium Gluconate") and n["batches"] == ["MV24B36"]
    assert n["brand"] == "Martin & Brown Bio-Sciences Pvt.Ltd." and n["lab"] == "CDL, Kolkata"
    assert n["brand_lc"] == "martin & brown bio-sciences pvt.ltd."
    assert "M/s. Martin & Brown Bio-Sciences Pvt.Ltd., Baddi, HP" in n["raw_excerpt"]
    assert n["row_ref"] == {"page": None, "row": 1, "month": None}
    assert n["mfg_date"] == "02/2024" and n["exp_date"] == "01/2026"
    assert n["published_at"] == "2025-06-01"


def test_cdsco_normalise_split_header_and_continuation_rows():
    from ingest import cdsco_normalise

    header = [
        "S.No",
        "Product/Drug Name",
        "Batch No.",
        "Manufact uring Date",
        "Expiry Date",
        "Manufactured By",
        "NSQ Result",
        "Reported by CDSCO Laboratory",
    ]
    assert cdsco_normalise.header_map(header)["mfg_date"] == 3
    rows = [
        header,
        [
            "41.",
            "Ondansetron Injection IP",
            "OI2401",
            "01/2024",
            "12/2025",
            "M/s. Example Pharma, Plot 4,",
            "Assay",
            "RDTL, Guwahati",
        ],
        ["", "", "", "", "", "Ghopa, Amingaon, North Guwahati, Assam-781031", "", ""],
        [
            "42.",
            "Dextrose Injection I.P. 5%w/v",
            "DX99",
            "02/2024",
            "01/2026",
            "M/s. Other Labs",
            "Sterility",
            "CDL, Kolkata",
        ],
    ]
    notices = cdsco_normalise.rows_to_notices(rows, adapter="pdf", month="JUN-2025")
    assert [n["row_ref"]["row"] for n in notices] == [1, 2]
    assert notices[0]["brand"] == "Example Pharma"
    assert "Plot 4, Ghopa, Amingaon, North Guwahati, Assam-781031" in notices[0]["raw_excerpt"]
    assert notices[0]["mfg_date"] == "01/2024"
    assert "Assam-781031" in notices[0]["raw_excerpt"]
    assert notices[1]["batches"] == ["DX99"]


def test_api_health_and_notices():
    from api import app

    health = app.handler(_api_event("GET", "/health"), None)
    assert health["statusCode"] == 200
    assert health["headers"]["access-control-allow-origin"] == "*"
    assert json.loads(health["body"]) == {"ok": True, "demo": True}

    notices = app.handler(_api_event("GET", "/v1/notices"), None)
    assert notices["statusCode"] == 200
    assert json.loads(notices["body"])["count"] == 0

    missing = app.handler(_api_event("GET", "/v1/notices/cdsco_nsq%23nope"), None)
    assert missing["statusCode"] == 404

    later = app.handler(_api_event("POST", "/items"), None)
    assert later["statusCode"] == 501
    assert json.loads(later["body"])["prompt"] == "P04"

    assert app.handler(_api_event("GET", "/nope"), None)["statusCode"] == 404
    assert app.handler({}, None)["statusCode"] == 400


def test_api_notices_after_upsert_filters():
    from api import app
    from common import dynamo
    from ingest import cdsco_normalise

    rows = [
        {
            "str_product_name": "Pantoprazole Tablets IP",
            "str_batch_no": "PEP5001",
            "str_manufactured_by": "Finecure",
            "str_nsq_result": "Dissolution test",
            "dt_reporting_month_year": "JUL-2026",
        }
    ]
    for n in cdsco_normalise.rows_to_notices(rows, adapter="portal", month="JUL-2026"):
        dynamo.put("notices", n)
    body = json.loads(
        app.handler(_api_event("GET", "/v1/notices", {"source": "cdsco_nsq"}), None)["body"]
    )
    assert body["count"] == 1
    body = json.loads(
        app.handler(_api_event("GET", "/v1/notices", {"since": "2026-08-01"}), None)["body"]
    )
    assert body["count"] == 0
    one = app.handler(_api_event("GET", "/v1/notices/cdsco_nsq%23JUL-2026-cdsco_portal-1"), None)
    assert one["statusCode"] == 200
    assert json.loads(one["body"])["batches"] == ["PEP5001"]


def test_check_batch_rule():
    from matcher.range_check import check_batch

    near_miss = check_batch("DL-4472", ["DL-4471", "DL-4468"])
    assert near_miss == {"inside": False, "listed": ["DL-4471", "DL-4468"], "yours": "DL-4472"}
    assert check_batch("dl-4471", ["DL-4471"])["inside"] is True
    assert check_batch("DL 4471", ["DL-4471"])["inside"] is False  # hyphen is significant
    assert check_batch("DL4471", ["DL 4471"])["inside"] is True  # spaces are not
    assert check_batch("", ["DL-4471"])["inside"] is None
    assert check_batch("DL-4471", [])["inside"] is None


def test_verify_quote_guard():
    from matcher.verify import quote_is_verbatim

    excerpt = "Paracetamol Tablets IP 650mg | FT5427 | Dissolution test"
    assert quote_is_verbatim("FT5427 | Dissolution test", excerpt)
    assert quote_is_verbatim("FT5427  |  Dissolution\ntest", excerpt)
    assert not quote_is_verbatim("FT5428", excerpt)
    assert not quote_is_verbatim("", excerpt)


def test_matcher_placeholders_passthrough():
    from matcher import candidates, claim, evidence, notify

    for mod, prompt in ((candidates, "P04"), (notify, "P04"), (claim, "P09"), (evidence, "P09")):
        out = mod.handler({"item_id": "i1"}, None)
        assert out["status"] == "placeholder" and out["prompt"] == prompt and out["item_id"] == "i1"


def test_demo_mode_is_on():
    assert os.environ["DEMO_MODE"] == "1"
