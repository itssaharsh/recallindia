"""The 15-item demo world (SPEC.md §Demo world) — the one definition seed and validate share.

``expected`` lives here, not on the item: ``schemas.Item`` forbids unknown fields, and what we
expect of an item is a property of the demo, not of the thing the user owns.
"""

from __future__ import annotations

ALERT_BRAND_LC = "forgo pharmaceuticals"
ALERT_BATCH = "FT5427"
NEAR_MISS_BATCH = "FT5428"  # the listed batch with its last character incremented
PURCHASE_OFFSET_DAYS = 11  # bought after the notice was published -> sold_after_notice

# purchase_date for the alert item is filled in at seed time from the notice's published_at
ALERT = {
    "item_id": "demo-alert",
    "expected": "alert",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": ALERT_BATCH,
}
NEAR_MISS = {
    "item_id": "demo-nearmiss",
    "expected": "dismiss",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": NEAR_MISS_BATCH,
}
VEHICLE = {
    "item_id": "demo-vehicle",
    "expected": "vehicle",  # alert or hold
    "kind": "vehicle",
    "name": "Jeep Compass",
    "brand": "Jeep",
    "make": "jeep",
    "model": "compass",
    "year": 2022,
    "reg_no": "MH12AB1234",
}

_CLEAR = [
    {
        "kind": "appliance",
        "name": "Prestige Deluxe Plus Pressure Cooker 5L",
        "brand": "Prestige",
        "model": "Deluxe Plus 5L",
    },
    {
        "kind": "other",
        "name": "Milton Thermosteel Flip Lid Flask 1000ml",
        "brand": "Milton",
        "model": "Thermosteel 1000",
    },
    {
        "kind": "appliance",
        "name": "Havells Efficiencia Neo Ceiling Fan 1200mm",
        "brand": "Havells",
        "model": "Efficiencia Neo",
    },
    {
        "kind": "other",
        "name": "boAt Airdopes 141 Earbuds",
        "brand": "boAt",
        "model": "Airdopes 141",
    },
    {"kind": "medicine", "name": "Dolo 650", "brand": "Micro Labs", "batch": "ZZ0000"},
    {
        "kind": "appliance",
        "name": "Bajaj Majesty DX-6 Dry Iron",
        "brand": "Bajaj",
        "model": "Majesty DX-6",
    },
    {
        "kind": "appliance",
        "name": "Crompton Arno Neo Storage Geyser 15L",
        "brand": "Crompton",
        "model": "Arno Neo 15",
    },
    {
        "kind": "appliance",
        "name": "Hawkins Contura Hard Anodised Cooker 3L",
        "brand": "Hawkins",
        "model": "Contura 3L",
    },
    {
        "kind": "appliance",
        "name": "Pigeon Cruise Induction Cooktop 1800W",
        "brand": "Pigeon",
        "model": "Cruise 1800",
    },
    {
        "kind": "appliance",
        "name": "Butterfly Smart Glass 3 Burner Gas Stove",
        "brand": "Butterfly",
        "model": "Smart Glass 3B",
    },
    {
        "kind": "vehicle",
        "name": "Maruti Suzuki Swift",
        "brand": "Maruti Suzuki",
        "make": "maruti",
        "model": "swift",
        "year": 2023,
        "reg_no": "DL8CAF5031",
    },
    {"kind": "medicine", "name": "Crocin Advance 500mg Tablets", "brand": "GSK", "batch": "CA0000"},
]
CLEAR = [
    {"item_id": f"demo-clear-{n:02d}", "expected": "clear", **fields}
    for n, fields in enumerate(_CLEAR, start=1)
]

DEMO_ITEMS: list[dict] = [ALERT, NEAR_MISS, VEHICLE, *CLEAR]
assert len(DEMO_ITEMS) == 15 and len(CLEAR) == 12


def item_fields(entry: dict) -> dict:
    """The entry without ``expected`` (what actually goes on the Item)."""
    return {k: v for k, v in entry.items() if k != "expected"}
