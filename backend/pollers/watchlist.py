"""Default vehicle watchlist for the NHTSA poller (SPEC §Sources, id ``nhtsa``).

NHTSA's ``recallsByVehicle`` API is keyed by US-market make/model/year, so the poller can
only ask about cars that are sold in the US **under the same name**. The rule for
``us_make``/``us_model`` is strict: it is set only when the Indian-market car *is* the US
car (Hyundai Venue, Kia Seltos, Jeep Compass, Volkswagen Tiguan, Hyundai Tucson, Toyota
Camry). Look-alikes are not equivalents -- the Honda City is not the Civic, the Hyundai
Creta is not the Kona, the Maruti Swift is not sold in the US at all -- so those entries
carry ``us_make = us_model = None`` and a ``note`` saying why.

Entries without a US match are kept on purpose: they feed the SIAM (India) poller in P10
and the item wall / demo seed, and ``skipped()`` lets the poller report how many of the
default 20 it could not query so the feed never silently looks "complete".

Vehicle items a user adds (``items`` table, ``kind == "vehicle"``) are mapped through the
same table by ``from_items``; an unknown make/model pair is passed through lower-cased so a
user with a genuinely US-market car still gets a real query.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class WatchEntry:
    """One Indian-market car and, when the same car is sold in the US, its NHTSA name."""

    make: str
    model: str
    us_make: str | None
    us_model: str | None
    note: str = ""

    @property
    def has_us_match(self) -> bool:
        return bool(self.us_make and self.us_model)

    def key(self) -> tuple[str, str]:
        return (self.make.lower().strip(), self.model.lower().strip())


_NOT_IN_US = "Not sold in the US under any name"

DEFAULT_WATCHLIST: list[WatchEntry] = [
    WatchEntry("Maruti", "Swift", None, None, _NOT_IN_US),
    WatchEntry("Maruti", "Baleno", None, None, _NOT_IN_US),
    WatchEntry("Maruti", "Brezza", None, None, _NOT_IN_US),
    WatchEntry("Hyundai", "Creta", None, None, "Not sold in the US; Kona is a different car"),
    WatchEntry("Hyundai", "i20", None, None, _NOT_IN_US),
    WatchEntry("Hyundai", "Venue", "hyundai", "venue", "Same car in the US"),
    WatchEntry("Tata", "Nexon", None, None, _NOT_IN_US),
    WatchEntry("Tata", "Punch", None, None, _NOT_IN_US),
    WatchEntry("Mahindra", "XUV700", None, None, _NOT_IN_US),
    WatchEntry("Mahindra", "Scorpio", None, None, _NOT_IN_US),
    WatchEntry("Honda", "City", None, None, "Not sold in the US; Civic is a different car"),
    WatchEntry("Honda", "Amaze", None, None, _NOT_IN_US),
    WatchEntry("Toyota", "Innova", None, None, "Not sold in the US; Sienna is a different car"),
    WatchEntry("Toyota", "Fortuner", None, None, "Not sold in the US; 4Runner is a different car"),
    WatchEntry("Kia", "Seltos", "kia", "seltos", "Same car in the US"),
    WatchEntry("Kia", "Sonet", None, None, _NOT_IN_US),
    WatchEntry("Jeep", "Compass", "jeep", "compass", "Same car in the US"),
    WatchEntry("Volkswagen", "Tiguan", "volkswagen", "tiguan", "Same car in the US"),
    WatchEntry("Hyundai", "Tucson", "hyundai", "tucson", "Same car in the US"),
    WatchEntry("Toyota", "Camry", "toyota", "camry", "Same car in the US"),
]

DEFAULT_YEARS = range(2021, 2026)

_BY_KEY: dict[tuple[str, str], WatchEntry] = {e.key(): e for e in DEFAULT_WATCHLIST}

VehicleTuple = tuple[str, str, int]


def lookup(make: str, model: str) -> WatchEntry | None:
    """The default-watchlist entry for ``make``/``model`` (case-insensitive), or None."""
    return _BY_KEY.get((str(make).lower().strip(), str(model).lower().strip()))


def expand(
    entries: Iterable[WatchEntry] = DEFAULT_WATCHLIST, years: Iterable[int] = DEFAULT_YEARS
) -> list[VehicleTuple]:
    """``(us_make, us_model, year)`` for every entry with a US match x every year, lower-cased."""
    years = list(years)
    out: list[VehicleTuple] = []
    for entry in entries:
        if not entry.has_us_match:
            continue
        for year in years:
            out.append((str(entry.us_make).lower(), str(entry.us_model).lower(), int(year)))
    return out


def skipped(entries: Iterable[WatchEntry] = DEFAULT_WATCHLIST) -> list[WatchEntry]:
    """Entries the NHTSA poller cannot query because the car has no US-market name."""
    return [e for e in entries if not e.has_us_match]


def _year(value: object) -> int | None:
    try:
        year = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return year if 1900 < year < 2100 else None


def from_items(items: Iterable[dict]) -> list[VehicleTuple]:
    """Query tuples for the user's vehicle items.

    Only ``kind == "vehicle"`` items with make, model and a usable year count. A pair that
    is in the default watchlist is mapped to its US name (and dropped when the watchlist
    says the car has no US match); any other pair is passed through lower-cased.
    """
    out: list[VehicleTuple] = []
    for item in items:
        if not isinstance(item, dict) or item.get("kind") != "vehicle":
            continue
        make = str(item.get("make") or "").strip()
        model = str(item.get("model") or "").strip()
        year = _year(item.get("year"))
        if not make or not model or year is None:
            continue
        entry = lookup(make, model)
        if entry is None:
            out.append((make.lower(), model.lower(), year))
        elif entry.has_us_match:
            out.append((str(entry.us_make).lower(), str(entry.us_model).lower(), year))
    return out


def dedupe(tuples: Iterable[VehicleTuple]) -> list[VehicleTuple]:
    """Stable de-duplication of ``(make, model, year)`` tuples."""
    seen: set[VehicleTuple] = set()
    out: list[VehicleTuple] = []
    for t in tuples:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out
