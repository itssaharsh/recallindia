"""Match pipeline step ``verify`` (SPEC §Match pipeline step 2; P04).

Answers one question per candidate: is this notice about the item's product from the item's
brand? It never decides whether the item's batch / serial / year is inside a listed range --
that is RangeCheck's deterministic job -- and never sets alert/hold/dismiss (Decide does).

Three paths, chosen by ``verify``. Bedrock quotas are held at 0 on this account for the
hackathon (``BEDROCK_ENABLED`` defaults to false), so the deterministic verifier is the
PRIMARY path and the model is opt-in:

* **deterministic** -- ``BEDROCK_ENABLED`` false (the default), ``BedrockUnavailable``, or
  demo mode without a fixture for the notice (so the demo world never needs one fixture per
  notice): brand equality (``common.matching.brands_match``) plus product similarity
  (``textmatch.product_score >= 90`` / ``textmatch.vehicle_matches``) or a shared identifier
  (batch / serial / model). Its quote is the notice row's own text (``quote_from_excerpt``)
  and its reasoning is one human-readable line of "; "-joined segments: "brand 'Forgo
  Pharmaceuticals' matches; product 'Paracetamol Tablets IP 650mg' fuzzy 100; batch FT5427 in
  listed [FT5427]; quoted: '...'" -- the identifier clause reports token overlap only, the
  range DECISION is RangeCheck's.
* **bedrock** -- ``BEDROCK_ENABLED`` true and either live, or demo mode with a per-notice
  fixture ``fixtures/bedrock/verify/notice-<pk>.json`` (``fixture_key_for``): Claude Haiku 4.5
  (``MODEL_VERIFY`` through ``common.bedrock``, temperature 0, strict JSON) reads the notice
  ``raw_excerpt`` + structured fields and the item fields.
* **none** -- ``BedrockError`` (both regions failed) or the notice / item cannot be loaded:
  ``covers_item`` null so Decide answers hold, never alert or dismiss.

Quote guard: whatever the path, ``quoted_sentence`` MUST be a verbatim substring of
``raw_excerpt`` (``quote_is_verbatim``: whitespace collapsed, case and punctuation exact). A
model reply whose quote is not in the source is downgraded to ``covers_item`` null with
reasoning "quote not found in source" -- the card flip highlights the quote inside the
rendered excerpt, so a paraphrase would highlight nothing. Wording: never "recalled" for a
CDSCO NSQ hit, never "safe"; the handler never raises.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from common import bedrock, dynamo
from common.bedrock import BedrockError, BedrockUnavailable
from common.demo_mode import FixtureMissing, fixture_path, is_demo
from common.matching import brands_match, identifier_tokens
from common.schemas import Item

try:
    from matcher import textmatch
except ModuleNotFoundError:  # Lambda package: backend/matcher is the root
    import textmatch  # type: ignore[no-redef]

STEP = "verify"
PROMPT = "P04"
log = logging.getLogger("matcher.verify")

RAW_EXCERPT_MAX = 4096
PRODUCT_THRESHOLD = 90
FALLBACK_QUOTE_CHARS = 240
MAX_LINE_QUOTE_CHARS = 400  # a widened single-needle quote is cut at a sentence end
MAX_TOKENS = 400

QUOTE_NOT_FOUND = "quote not found in source"
BEDROCK_ERROR = "verification unavailable (Bedrock error)"
UNPARSEABLE = "unparseable model reply"
UNAVAILABLE = "verification unavailable"
NOTICE_NOT_FOUND = "notice not found"
ITEM_NOT_FOUND = "item not found"

SYSTEM_PROMPT = (
    "You verify whether a product-safety notice covers one specific item a person owns. "
    'Reply with ONE JSON object only: {"covers_item": true|false|null, '
    '"quoted_sentence": "...", "confidence": 0.0-1.0, "reasoning": "one sentence"}. '
    "quoted_sentence must be copied character-for-character from NOTICE TEXT; covers_item is "
    "null only when the text cannot settle it. Do not decide whether the item's "
    "batch/serial/year is inside a listed range — a deterministic check does that; only "
    "judge whether the notice is about this product from this brand."
)

NOTICE_SUMMARY_KEYS = ("product", "model", "brand", "source", "published_at", "title", "adapter")
_SENTENCE_SPLIT = re.compile(r"\. |\r?\n| \| ")
_KEY_UNSAFE = re.compile(r"[^A-Za-z0-9_-]+")


# --- quote guard --------------------------------------------------------------------


def quote_is_verbatim(quoted: str, raw_excerpt: str) -> bool:
    """True when ``quoted`` is a non-empty verbatim substring of ``raw_excerpt``.

    Whitespace runs are collapsed on both sides so a line-wrapped PDF excerpt
    still matches; casing and punctuation must match exactly.
    """
    q = " ".join(str(quoted or "").split())
    src = " ".join(str(raw_excerpt or "").split())
    return bool(q) and q in src


def _find_span(needle: Any, haystack: str) -> tuple[int, int] | None:
    """``(start, end)`` of ``needle`` in ``haystack``: case-sensitive first, then
    case-insensitive (the span is always in the original text). Whitespace runs are
    flexible so a needle stored clean still finds its line-wrapped source."""
    tokens = str(needle or "").split()
    if not tokens:
        return None
    pattern = r"\s+".join(re.escape(tok) for tok in tokens)
    for flags in (0, re.IGNORECASE):
        match = re.search(pattern, haystack, flags)
        if match:
            return match.start(), match.end()
    return None


def quote_from_excerpt(notice: dict, item: dict) -> str:
    """The notice row's own words for this item -- always a verbatim substring of
    ``raw_excerpt`` (empty only when the excerpt is empty).

    Locates the notice product, its first listed batch and ``hazard_or_failed_test`` in the
    excerpt and returns the span from the first to the last of those found ("Paracetamol
    Tablets IP 650mg | FT5427 | ... | The sample does not conforms ... Dissolution Test.");
    else the first sentence (split on ". ", newline, " | ") naming the item (name, brand,
    make, model, then the first word of its name); else the first 240 characters.
    """
    raw = str(notice.get("raw_excerpt") or "")
    if not raw.strip():
        return ""
    batches = [b for b in (notice.get("batches") or []) if b]
    needles = (
        notice.get("product"),
        batches[0] if batches else None,
        notice.get("hazard_or_failed_test"),
    )
    spans = [span for span in (_find_span(n, raw) for n in needles) if span]
    if len(spans) > 1:
        return raw[min(s[0] for s in spans) : max(s[1] for s in spans)]
    if spans:
        # Only the bare product name matched (an NHTSA notice has no batch, and its hazard field
        # is prefixed with a component name that never appears in the excerpt). "Jeep Compass"
        # alone is verbatim but says nothing, so widen to the source's own line around it -- the
        # summary carrying the defect text -- still character-for-character from the excerpt.
        return _line_around(raw, spans[0])
    names = [" ".join(str(item.get(k) or "").split()) for k in ("name", "brand", "make", "model")]
    first_word = next((n.split()[0] for n in names[:1] if n and len(n.split()[0]) >= 4), "")
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(raw) if s.strip()]
    for needle in [n for n in names if n] + ([first_word] if first_word else []):
        low = needle.lower()
        for sentence in sentences:
            if low in sentence.lower():
                return sentence
    return raw[:FALLBACK_QUOTE_CHARS].strip() or raw.strip()[:FALLBACK_QUOTE_CHARS]


def _line_around(raw: str, span: tuple[int, int], limit: int = MAX_LINE_QUOTE_CHARS) -> str:
    """The newline-delimited line of ``raw`` containing ``span``, cut at a sentence end.

    Always a verbatim substring: it is a slice of ``raw``, and when the line is longer than
    ``limit`` it is cut back to the last ``". "`` that still keeps the matched span inside.
    """
    start = raw.rfind("\n", 0, span[0]) + 1
    end = raw.find("\n", span[1])
    end = len(raw) if end == -1 else end
    line = raw[start:end]
    if len(line) > limit:
        cut = line.rfind(". ", span[1] - start, limit)
        line = line[: cut + 1] if cut != -1 else line[:limit]
    return line.strip() or raw[span[0] : span[1]]


def fixture_key_for(notice_pk: str | None) -> str:
    """Demo fixture name for a notice: ``notice-<pk>`` with anything outside ``[A-Za-z0-9_-]``
    replaced by ``_`` and capped at 80 characters after the prefix."""
    return "notice-" + _KEY_UNSAFE.sub("_", str(notice_pk or ""))[:80]


def notice_summary(notice: dict) -> dict:
    """The small notice summary Decide / Notify need (never the 4 KB excerpt)."""
    summary = {key: notice.get(key) for key in NOTICE_SUMMARY_KEYS}
    summary["batches"] = [str(b) for b in (notice.get("batches") or []) if b]
    return summary


def _field(value: Any) -> str:
    text = " ".join(str(value if value is not None else "").split())
    return text or "-"


# --- deterministic path (primary while Bedrock is unavailable) -----------------------


def _item_brand(item: dict) -> str:
    brand = item.get("brand")
    if not brand and item.get("kind") == "vehicle":
        brand = item.get("make")
    return " ".join(str(brand or "").split())


def _listed_identifier(item: dict, notice: dict) -> tuple[str, str] | None:
    """``(label, value)`` of the first item identifier the notice lists, e.g. ``("batch",
    "FT5427")``; hyphen/space/case-insensitive (``common.matching.identifier_tokens``)."""
    listed = identifier_tokens(
        *(notice.get("batches") or []), *(notice.get("serial_ranges") or []), notice.get("model")
    )
    for label in ("batch", "serial", "model"):
        value = item.get(label)
        if value and identifier_tokens(value) & listed:
            return label, str(value)
    return None


def _bracketed(values: list) -> str:
    return "[" + ", ".join(str(v) for v in values if v) + "]"


def _identifier_clause(item: dict, notice: dict) -> str:
    """Token-overlap report only (the range DECISION is RangeCheck's): "batch FT5427 in listed
    [FT5427]" / "batch FT5428 not in listed [FT5427]" / "serial S1 vs listed [A12-A99]" /
    "no batch or serial on the item" (plus "model X listed" when the notice model matches)."""
    batches = [b for b in (notice.get("batches") or []) if b]
    ranges = [r for r in (notice.get("serial_ranges") or []) if r]
    parts: list[str] = []
    batch = item.get("batch")
    if batch:
        if not batches:
            parts.append(f"batch {batch}; notice lists no batches")
        elif identifier_tokens(batch) & identifier_tokens(*batches):
            parts.append(f"batch {batch} in listed {_bracketed(batches)}")
        else:
            parts.append(f"batch {batch} not in listed {_bracketed(batches)}")
    serial = item.get("serial")
    if serial:
        parts.append(f"serial {serial} vs listed {_bracketed(ranges)}")
    if not parts:
        parts.append("no batch or serial on the item")
    model, notice_model = item.get("model"), notice.get("model")
    if model and notice_model and identifier_tokens(model) & identifier_tokens(notice_model):
        parts.append(f"model {model} listed")
    return "; ".join(parts)


def deterministic_verify(item: dict, notice: dict) -> dict:
    """Rules-only verdict: the primary path while Bedrock is unavailable.

    ``covers_item`` = brands match AND (product similar OR an item identifier is listed);
    confidence 0.95 with a listed identifier, 0.85 on product alone, 0.9 for a brand mismatch
    (or no brand), 0.8 for brand-only. ``reasoning`` is one line of "; "-joined segments:
    brand, product (or vehicle), identifier overlap, then ``quoted: '<quoted_sentence>'``.
    """
    brand = _item_brand(item)
    notice_brand = " ".join(str(notice.get("brand") or "").split())
    brand_ok = brands_match(brand, notice_brand)
    score = textmatch.product_score(item, notice)
    vehicle_ok = textmatch.vehicle_matches(item, notice)
    product_ok = score >= PRODUCT_THRESHOLD or vehicle_ok
    ident = _listed_identifier(item, notice)
    # A photographed strip usually carries no maker, and `brands_match` reads a blank brand as a
    # mismatch -- which dismissed exact batch hits from the scan. No brand is unknown, not wrong:
    # the pair then has to be specific on its own, so the product must match AND the notice must
    # list this exact identifier.
    covers = bool(brand_ok and (product_ok or ident is not None)) or bool(
        not brand and product_ok and ident is not None
    )

    if covers and ident is not None:
        confidence = 0.95
    elif covers:
        confidence = 0.85
    elif not brand_ok:
        confidence = 0.9
    else:
        confidence = 0.8

    if not brand:
        brand_clause = f"no brand on the item (notice brand '{notice_brand}')"
    elif brand_ok:
        brand_clause = f"brand '{brand}' matches"
    else:
        brand_clause = f"brand '{brand}' does not match '{notice_brand}'"
    if vehicle_ok:
        make = " ".join(str(item.get("make") or "").lower().split())
        model = " ".join(str(item.get("model") or "").lower().split())
        product_clause = f"vehicle {make} {model} listed"
    else:
        product_clause = f"product '{_field(item.get('name'))}' fuzzy {score}"
    quoted = quote_from_excerpt(notice, item)
    reasoning = "; ".join(
        (brand_clause, product_clause, _identifier_clause(item, notice), f"quoted: '{quoted}'")
    )
    return {
        "covers_item": covers,
        "quoted_sentence": quoted,
        "confidence": confidence,
        "reasoning": reasoning,
        "verifier": "deterministic",
    }


# --- Bedrock path (opt-in) ----------------------------------------------------------


def build_prompt(item: dict, notice: dict) -> str:
    """User turn: the notice's structured fields, ``NOTICE TEXT:`` (raw_excerpt, <= 4096
    characters) and the item's fields. The system prompt carries the rules."""
    vehicles = "; ".join(
        f"{v.get('make')} {v.get('model')} {v.get('year_from')}-{v.get('year_to')}"
        for v in (notice.get("vehicles") or [])
        if isinstance(v, dict)
    )
    notice_lines = [
        "NOTICE",
        f"source: {_field(notice.get('source'))}",
        f"title: {_field(notice.get('title'))}",
        f"product: {_field(notice.get('product'))}",
        f"brand: {_field(notice.get('brand'))}",
        f"model: {_field(notice.get('model'))}",
        f"batches: {_field(', '.join(str(b) for b in (notice.get('batches') or [])))}",
        f"serial_ranges: {_field(', '.join(str(s) for s in (notice.get('serial_ranges') or [])))}",
        f"vehicles: {_field(vehicles)}",
        f"hazard_or_failed_test: {_field(notice.get('hazard_or_failed_test'))}",
        f"published_at: {_field(notice.get('published_at'))}",
    ]
    item_lines = ["ITEM"] + [
        f"{key}: {_field(item.get(key))}"
        for key in ("kind", "name", "brand", "model", "batch", "serial", "make", "year")
    ]
    raw = str(notice.get("raw_excerpt") or "")[:RAW_EXCERPT_MAX]
    return "\n".join(notice_lines) + "\n\nNOTICE TEXT:\n" + raw + "\n\n" + "\n".join(item_lines)


def _coerce_covers(value: Any) -> bool | None:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        low = value.strip().lower()
        if low == "true":
            return True
        if low == "false":
            return False
    return None


def _coerce_confidence(value: Any) -> float:
    try:
        conf = float(value)
    except (TypeError, ValueError):
        return 0.5
    if conf != conf:  # NaN
        return 0.5
    return min(1.0, max(0.0, conf))


def _null_verdict(reasoning: str, verifier: str) -> dict:
    return {
        "covers_item": None,
        "quoted_sentence": "",
        "confidence": 0.0,
        "reasoning": reasoning,
        "verifier": verifier,
    }


def bedrock_verify(item: dict, notice: dict, *, fixture_key: str | None = None) -> dict:
    """Ask Claude Haiku 4.5 (``MODEL_VERIFY``) and validate the reply.

    ``BedrockUnavailable`` (flag off) / a missing demo fixture -> ``deterministic_verify``
    unchanged; ``BedrockError`` (both regions failed) -> covers_item null, verifier "none"; a
    reply with no JSON object -> covers_item null, "unparseable model reply". ``covers_item``
    strings ("true"/"false"/"null") are coerced, ``confidence`` is clamped to 0-1 (0.5 when
    missing) and a non-verbatim ``quoted_sentence`` voids the verdict ("quote not found in
    source"). Goes through ``common.bedrock.converse`` + ``extract_json_object`` rather than
    ``converse_json`` because the latter swallows ``BedrockError`` and the three outcomes
    above must stay distinguishable.
    """
    raw = str(notice.get("raw_excerpt") or "")
    prompt = build_prompt(item, notice)
    try:
        reply = bedrock.converse(
            "verify",
            prompt,
            system=SYSTEM_PROMPT,
            max_tokens=MAX_TOKENS,
            temperature=0.0,
            fixture_key=fixture_key,
        )
    except (BedrockUnavailable, FixtureMissing):
        return deterministic_verify(item, notice)
    except BedrockError as err:
        log.warning("verify %s: Bedrock error: %s", notice.get("pk"), err)
        return _null_verdict(BEDROCK_ERROR, "none")

    parsed = bedrock.extract_json_object(str(reply.get("text") or ""))
    if not isinstance(parsed, dict):
        return _null_verdict(UNPARSEABLE, "bedrock")
    covers = _coerce_covers(parsed.get("covers_item"))
    quoted = parsed.get("quoted_sentence")
    quoted = quoted.strip() if isinstance(quoted, str) else ""
    confidence = _coerce_confidence(parsed.get("confidence"))
    reasoning = " ".join(str(parsed.get("reasoning") or "").split())
    if covers is not None and not quote_is_verbatim(quoted, raw):
        covers, quoted, reasoning = None, "", QUOTE_NOT_FOUND
    return {
        "covers_item": covers,
        "quoted_sentence": quoted,
        "confidence": confidence,
        "reasoning": reasoning,
        "verifier": "bedrock",
    }


# --- mode selection + handler -------------------------------------------------------


def verify(item: dict, notice: dict) -> dict:
    """Pick the path (deterministic when ``BEDROCK_ENABLED`` is false -- the default; in demo
    mode the Bedrock fixture only when ``fixtures/bedrock/verify/<fixture_key_for(pk)>.json``
    exists; live Bedrock otherwise) and attach ``notice_pk``, the notice summary and
    ``degraded``."""
    notice_pk = notice.get("pk")
    if not bedrock.is_enabled():
        result = deterministic_verify(item, notice)
    elif is_demo():
        key = fixture_key_for(notice_pk)
        if fixture_path("bedrock", "verify", f"{key}.json").is_file():
            result = bedrock_verify(item, notice, fixture_key=key)
        else:
            result = deterministic_verify(item, notice)
    else:
        result = bedrock_verify(item, notice)
    return {"notice_pk": notice_pk, **result, "notice": notice_summary(notice), "degraded": False}


def _null_result(
    notice_pk: Any,
    reasoning: str,
    *,
    notice: dict | None = None,
    degraded: bool = False,
    error: str | None = None,
) -> dict:
    out = {"notice_pk": notice_pk, **_null_verdict(reasoning, "none"), "notice": notice}
    out["degraded"] = degraded
    if error:
        out["error"] = error
    return out


def _load_item(event: dict, candidate: dict) -> dict | None:
    item = event.get("item")
    if isinstance(item, dict) and item:
        return item
    item_id = event.get("item_id") or candidate.get("item_id")
    if not item_id:
        return None
    return dynamo.get("items", Item.make_pk(str(item_id)))


def handler(event: dict | None, context: object) -> dict:
    """Map iteration input ``{candidate: {notice_pk, score, matched_on}, item, run}`` (or
    ``item_id`` instead of ``item``) -> the verify record (see module docstring). Never raises:
    a missing notice / item answers covers_item null with verifier "none"; any exception
    answers the same with ``degraded`` true and ``error``."""
    notice_pk: Any = None
    try:
        event = event if isinstance(event, dict) else {}
        candidate = event.get("candidate")
        candidate = candidate if isinstance(candidate, dict) else {}
        notice_pk = candidate.get("notice_pk") or event.get("notice_pk")
        notice = dynamo.get("notices", str(notice_pk)) if notice_pk else None
        if not isinstance(notice, dict) or not notice:
            return _null_result(notice_pk, NOTICE_NOT_FOUND)
        item = _load_item(event, candidate)
        if not item:
            return _null_result(notice_pk, ITEM_NOT_FOUND, notice=notice_summary(notice))
        return verify(item, notice)
    except Exception as err:
        log.exception("verify failed for %s", notice_pk)
        return _null_result(
            notice_pk, UNAVAILABLE, degraded=True, error=f"{type(err).__name__}: {err}"
        )
