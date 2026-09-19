"""Household scoping (UI-SPEC §7 Household): the only thing between a judge and the demo wall.

There are no accounts. Every household endpoint reads one header, ``X-Household``:

* a missing or unreadable header is the ``demo`` household, which is **read-only** -- it is what
  the video and the README link show, so nobody can add to it, check its items or approve its
  case;
* ``POST /households`` copies the demo items into a new household (``hh_`` + 8 base32 chars) and
  the browser keeps that id in localStorage.

Caps keep a public demo from turning into someone's free compute: 100 new households a UTC day
(one atomic counter row), 30 items and 5 approvals per household.
"""

from __future__ import annotations

import re
import secrets

from common import dynamo
from common.demo_mode import is_demo
from common.schemas import DEMO_HOUSEHOLD

# lowercase base32 (RFC 4648 alphabet, lowercased): no 0/1/8/9, so an id can be read aloud
ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"  # pragma: allowlist secret (an alphabet)
ID_RE = re.compile(r"^hh_[a-z2-7]{8}$")
HEADER = "x-household"

NEW_PER_DAY = 100
MAX_ITEMS = 30
MAX_APPROVALS = 5

COUNTER_PK = "meta#households"
APPROVALS_PK = "meta#approvals"


class Capped(Exception):
    """A cap was reached; the API turns this into 429 ``demo_busy``."""


def new_id() -> str:
    return "hh_" + "".join(secrets.choice(ALPHABET) for _ in range(8))


def valid(household_id: str | None) -> bool:
    return household_id == DEMO_HOUSEHOLD or bool(household_id and ID_RE.match(household_id))


def from_event(event: dict | None) -> str:
    """The household this request speaks for. Anything unreadable is the demo household."""
    headers = (event or {}).get("headers") or {}
    raw = next((v for k, v in headers.items() if str(k).lower() == HEADER), "")
    value = str(raw or "").strip()
    return value if valid(value) else DEMO_HOUSEHOLD


def is_demo_household(household_id: str | None) -> bool:
    return (household_id or DEMO_HOUSEHOLD) == DEMO_HOUSEHOLD


def owns(row: dict | None, household_id: str) -> bool:
    """Rows written before households existed belong to the demo household."""
    return bool(row) and str((row or {}).get("household_id") or DEMO_HOUSEHOLD) == household_id


def readable(row: dict | None, household_id: str) -> bool:
    """A demo row is readable from any household (the video's case is a demo row)."""
    owner = str((row or {}).get("household_id") or DEMO_HOUSEHOLD)
    return owns(row, household_id) or is_demo_household(owner)


def take_daily_slot(day: str) -> int:
    """Atomically count one new household for ``day`` (UTC date); raises ``Capped`` past the cap.

    One row, ``meta#households``, one counter per day: `ADD` is atomic, so two requests in the
    same millisecond cannot both take the last slot.
    """
    if is_demo():
        data = dynamo._load("cases")
        row = data.setdefault(COUNTER_PK, {"pk": COUNTER_PK, "rk": "meta", "ts": day})
        used = int(row.get(day, 0)) + 1
        if used > NEW_PER_DAY:
            raise Capped(day)
        row[day] = used
        dynamo._save("cases", data)
        return used
    table = dynamo._table("cases")
    try:
        resp = table.update_item(
            Key={"pk": COUNTER_PK},
            UpdateExpression="SET #rk = :meta, #ts = :day ADD #day :one",
            ConditionExpression="attribute_not_exists(#day) OR #day < :cap",
            ExpressionAttributeNames={"#day": day, "#rk": "rk", "#ts": "ts"},
            ExpressionAttributeValues={
                ":one": 1,
                ":cap": NEW_PER_DAY,
                ":meta": "meta",
                ":day": day,
            },
            ReturnValues="UPDATED_NEW",
        )
    except Exception as exc:
        if "ConditionalCheckFailed" in type(exc).__name__ or "ConditionalCheckFailed" in str(exc):
            raise Capped(day) from None
        raise
    return int((resp.get("Attributes") or {}).get(day, 0))


def take_approval_slot(household_id: str) -> int:
    """Atomically count one approval for a household; raises ``Capped`` past ``MAX_APPROVALS``.

    Approving costs a KMS signature, an Object Lock PUT and a PDF, so a household gets five.
    """
    attr = household_id.replace("-", "_")
    if is_demo():
        data = dynamo._load("cases")
        row = data.setdefault(APPROVALS_PK, {"pk": APPROVALS_PK, "rk": "meta", "ts": ""})
        used = int(row.get(attr, 0)) + 1
        if used > MAX_APPROVALS:
            raise Capped(household_id)
        row[attr] = used
        dynamo._save("cases", data)
        return used
    table = dynamo._table("cases")
    try:
        resp = table.update_item(
            Key={"pk": APPROVALS_PK},
            UpdateExpression="SET #rk = :meta, #ts = :blank ADD #hh :one",
            ConditionExpression="attribute_not_exists(#hh) OR #hh < :cap",
            ExpressionAttributeNames={"#hh": attr, "#rk": "rk", "#ts": "ts"},
            ExpressionAttributeValues={
                ":one": 1,
                ":cap": MAX_APPROVALS,
                ":meta": "meta",
                ":blank": "0000-00-00T00:00:00Z",
            },
            ReturnValues="UPDATED_NEW",
        )
    except Exception as exc:
        if "ConditionalCheckFailed" in type(exc).__name__ or "ConditionalCheckFailed" in str(exc):
            raise Capped(household_id) from None
        raise
    return int((resp.get("Attributes") or {}).get(attr, 0))
