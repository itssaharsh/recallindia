"""P05b regression: the brand may be typed with or without its legal suffix.

Found in P05: 70% of CDSCO manufacturers are stored with a legal suffix ("Finecure
Pharmaceuticals Ltd."), and the candidates lookup was an exact match on the raw lower-cased
string -- so a person typing "Finecure Pharmaceuticals" with the EXACT listed batch was told
"no match in 4 sources". These tests run the real chain (candidates -> verify -> range check ->
decide -> notify) through the API on the saved July 2026 portal rows.
"""

from __future__ import annotations

import json

import pytest

from api import app
from common import dynamo
from pollers import cdsco_portal

PRODUCT = "Pantoprazole Tablets IP"
BATCH = "PEP5001"
STORED_BRAND = "Finecure Pharmaceuticals Ltd."


@pytest.fixture
def portal(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("BEDROCK_ENABLED", "false")  # the product default
    cdsco_portal.handler({}, None)
    rows = dynamo.query_brand("finecure pharmaceuticals")
    assert rows, "the Finecure row must be findable by its brand key"
    notice = next(r for r in rows if BATCH in r["batches"])
    assert notice["brand"] == STORED_BRAND and notice["product"] == PRODUCT
    return notice


def _call(method: str, path: str, body: dict | None = None) -> dict:
    event = {"requestContext": {"http": {"method": method}}, "rawPath": path}
    if body is not None:
        event["body"] = json.dumps(body)
    return json.loads(app.handler(event, None)["body"])


def _check(brand: str, batch: str = BATCH, name: str = PRODUCT) -> dict:
    item = _call(
        "POST", "/items", {"kind": "medicine", "name": name, "brand": brand, "batch": batch}
    )
    return _call("POST", f"/items/{item['items'][0]['item_id']}/check")


@pytest.mark.parametrize(
    "typed",
    [
        "Finecure Pharmaceuticals",  # the P05 false negative: no suffix
        "Finecure Pharmaceuticals Ltd.",  # exactly as the notice spells it
        "finecure pharmaceuticals ltd",
        "M/s. Finecure Pharmaceuticals Limited",
        "Finecure Pharmaceuticals Pvt. Ltd.",  # a different legal form of the same name
    ],
)
def test_the_listed_batch_alerts_however_the_brand_is_typed(portal, typed: str) -> None:
    result = _check(typed)
    assert result["decision"] == "alert", (typed, result.get("reason"))
    assert result["decide"]["notice_pk"] == portal["pk"]
    assert result["decide"]["verifier"] == "deterministic"
    assert BATCH in result["decide"]["quoted_sentence"]


def test_the_fix_did_not_loosen_the_batch_rule(portal) -> None:
    result = _check("Finecure Pharmaceuticals", batch="PEP5002")
    assert result["decision"] == "dismiss"
    assert result["reason"] == "batch PEP5002 not in listed batches [PEP5001]"


def test_another_manufacturer_is_not_pulled_in_by_the_shared_word(portal) -> None:
    """ "Pharmaceuticals" is identity, not noise: a different firm must not match Finecure's row."""
    result = _check("Zenith Pharmaceuticals")
    assert result["decision"] != "alert"
    assert result["decide"].get("notice_pk") != portal["pk"]


def test_a_brand_of_only_legal_words_finds_nothing(portal) -> None:
    result = _check("Pvt. Ltd.")
    assert result["decision"] == "clear"
