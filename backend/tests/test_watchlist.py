"""pollers.watchlist: the default 20 Indian-market cars and the US-name rule."""

from __future__ import annotations

from pollers import watchlist
from pollers.watchlist import (
    DEFAULT_WATCHLIST,
    DEFAULT_YEARS,
    WatchEntry,
    dedupe,
    expand,
    from_items,
    lookup,
    skipped,
)

US_MATCHES = {
    ("Hyundai", "Venue"): ("hyundai", "venue"),
    ("Kia", "Seltos"): ("kia", "seltos"),
    ("Jeep", "Compass"): ("jeep", "compass"),
    ("Volkswagen", "Tiguan"): ("volkswagen", "tiguan"),
    ("Hyundai", "Tucson"): ("hyundai", "tucson"),
    ("Toyota", "Camry"): ("toyota", "camry"),
}


def test_exactly_twenty_unique_entries() -> None:
    assert len(DEFAULT_WATCHLIST) == 20
    assert len({e.key() for e in DEFAULT_WATCHLIST}) == 20
    assert all(isinstance(e, WatchEntry) for e in DEFAULT_WATCHLIST)
    names = {(e.make, e.model) for e in DEFAULT_WATCHLIST}
    for required in (
        ("Maruti", "Swift"),
        ("Maruti", "Baleno"),
        ("Maruti", "Brezza"),
        ("Hyundai", "Creta"),
        ("Hyundai", "i20"),
        ("Tata", "Nexon"),
        ("Tata", "Punch"),
        ("Mahindra", "XUV700"),
        ("Mahindra", "Scorpio"),
        ("Honda", "City"),
        ("Honda", "Amaze"),
        ("Toyota", "Innova"),
        ("Toyota", "Fortuner"),
        ("Kia", "Sonet"),
        *US_MATCHES,
    ):
        assert required in names, required


def test_us_match_only_where_the_same_car_is_sold() -> None:
    for entry in DEFAULT_WATCHLIST:
        expected = US_MATCHES.get((entry.make, entry.model))
        if expected:
            assert (entry.us_make, entry.us_model) == expected, entry
            assert entry.has_us_match
        else:
            assert entry.us_make is None and entry.us_model is None, entry
            assert entry.note, f"{entry.make} {entry.model} needs a note"
    # look-alikes are not equivalents
    city = lookup("honda", "city")
    assert city is not None and not city.has_us_match and "Civic" in city.note
    creta = lookup("Hyundai", "CRETA")
    assert creta is not None and not creta.has_us_match and "Kona" in creta.note


def test_expand_yields_six_by_five_lower_case_tuples() -> None:
    assert list(DEFAULT_YEARS) == [2021, 2022, 2023, 2024, 2025]
    tuples = expand()
    assert len(tuples) == 30
    assert len(set(tuples)) == 30
    for make, model, year in tuples:
        assert make == make.lower() and model == model.lower()
        assert isinstance(year, int) and 2021 <= year <= 2025
    assert ("hyundai", "venue", 2023) in tuples
    assert ("jeep", "compass", 2022) in tuples
    assert not any(model == "city" for _, model, _ in tuples)
    assert expand(years=[2024]) == [
        ("hyundai", "venue", 2024),
        ("kia", "seltos", 2024),
        ("jeep", "compass", 2024),
        ("volkswagen", "tiguan", 2024),
        ("hyundai", "tucson", 2024),
        ("toyota", "camry", 2024),
    ]


def test_skipped_has_fourteen() -> None:
    skipped_entries = skipped()
    assert len(skipped_entries) == 14
    assert all(not e.has_us_match for e in skipped_entries)
    assert ("Honda", "City") in {(e.make, e.model) for e in skipped_entries}


def test_from_items_maps_known_pairs_and_passes_unknown_through() -> None:
    items = [
        {"kind": "vehicle", "make": "Hyundai", "model": "Venue", "year": 2023},
        {"kind": "vehicle", "make": "Ford", "model": "Mustang", "year": "2021"},
        {"kind": "vehicle", "make": "Honda", "model": "City", "year": 2024},  # no US match
        {"kind": "medicine", "make": "Kia", "model": "Seltos", "year": 2023},  # not a vehicle
        {"kind": "vehicle", "make": "Kia", "model": "Seltos"},  # no year
        {"kind": "vehicle", "make": "", "model": "Seltos", "year": 2022},  # no make
        {"kind": "vehicle", "make": "Kia", "model": "Seltos", "year": "unknown"},
        "not a dict",
    ]
    assert from_items(items) == [("hyundai", "venue", 2023), ("ford", "mustang", 2021)]
    assert from_items([]) == []


def test_dedupe_is_stable() -> None:
    assert dedupe([("a", "b", 1), ("c", "d", 2), ("a", "b", 1)]) == [("a", "b", 1), ("c", "d", 2)]
    assert watchlist.dedupe(expand() + expand()) == expand()
