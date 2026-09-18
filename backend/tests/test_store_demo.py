"""Demo-mode dynamo (JSON file store) and s3 (local files) round-trips."""

from pathlib import Path

from common import dynamo, s3


def test_dynamo_put_get_query_scan_delete(tmp_path: Path) -> None:
    n1 = {"pk": "cdsco_nsq#1", "brand_lc": "forgo", "product": "Paracetamol", "score": 0.5}
    n2 = {"pk": "cdsco_nsq#2", "brand_lc": "forgo", "product": "Dolo"}
    n3 = {"pk": "cpsc#3", "brand_lc": "prestige", "product": "Cooker"}
    for n in (n1, n2, n3):
        dynamo.put("notices", n)

    assert dynamo.get("notices", "cdsco_nsq#1") == n1
    assert dynamo.get("notices", "missing") is None
    assert {r["pk"] for r in dynamo.query_brand("forgo")} == {"cdsco_nsq#1", "cdsco_nsq#2"}
    assert len(dynamo.query_brand("forgo", limit=1)) == 1
    assert dynamo.query_brand("nobody") == []
    assert len(dynamo.scan_all("notices")) == 3
    assert len(dynamo.scan_all("notices", limit=2)) == 2

    dynamo.delete("notices", "cdsco_nsq#1")
    dynamo.delete("notices", "cdsco_nsq#1")  # idempotent
    assert dynamo.get("notices", "cdsco_nsq#1") is None
    assert len(dynamo.scan_all("notices")) == 2

    # tables are independent files under DEMO_STORE_DIR
    dynamo.put("items", {"pk": "user#i1", "kind": "medicine"})
    assert dynamo.scan_all("items") == [{"pk": "user#i1", "kind": "medicine"}]
    store = tmp_path / "demo_store"
    assert (store / "notices.json").is_file() and (store / "items.json").is_file()
    assert not list(store.glob("*.tmp"))


def test_table_and_bucket_names_from_env(monkeypatch) -> None:
    assert dynamo.table_name("cases") == "recallindia-cases"
    monkeypatch.setenv("CASES_TABLE", "recallindia-cases-dev")
    assert dynamo.table_name("cases") == "recallindia-cases-dev"
    assert s3.bucket_name("evidence") == "recallindia-evidence"
    monkeypatch.setenv("EVIDENCE_BUCKET", "ev-dev")
    assert s3.bucket_name("evidence") == "ev-dev"


def test_s3_round_trip_and_file_url(tmp_path: Path) -> None:
    key = s3.put_bytes("raw", "cdsco/nsq_latest.pdf", b"%PDF-1.7 demo", "application/pdf")
    assert key == "cdsco/nsq_latest.pdf"
    assert s3.get_bytes("raw", key) == b"%PDF-1.7 demo"
    url = s3.presigned_url("raw", key)
    assert url.startswith("file://")
    local = Path(url.removeprefix("file://"))
    assert local.read_bytes() == b"%PDF-1.7 demo"
    assert local.is_relative_to(tmp_path / "demo_store" / "s3" / "recallindia-raw")
