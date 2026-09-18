"""Regex extraction of serial ranges, lot/batch/date codes and model numbers from free text.

CPSC keeps every identifier in the top-level ``Description`` narrative and openFDA in
``code_info`` (P00). These helpers are pure functions, deliberately conservative: a token is
only returned when it follows an explicit keyword ("serial numbers", "Lot #", "batch code",
"model number", "SKU" ...) and looks like a code (contains a digit, 2-24 characters, or is a
quoted upper-case code). Better to miss than to invent -- the deterministic range check in the
matcher trusts these lists. Callers keep the raw text in ``raw_excerpt`` regardless.
"""

from __future__ import annotations

import re

MAX_TOKEN = 24
MAX_HITS = 60

# A code token: starts alphanumeric, may carry _ and - inside, "." only before a digit and "/"
# only before another alphanumeric (NC185424, 0FD2251-3B, AMG005197_12_Q_GLT, 24003xx, 09/2024)
# so "VF54399999.The" stops at the sentence end.
_TOKEN = r"[A-Za-z0-9](?:[A-Za-z0-9_\-]|\.(?=\d)|/(?=[A-Za-z0-9]))*"
_TOKEN_RE = re.compile(_TOKEN)
_DIGIT_RE = re.compile(r"\d")
_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})
_PAREN_RE = re.compile(r"\([^()]*\)")
_NBSP_RE = re.compile(r"[  ‑]")

# separators between listed codes: ", " / "; " / " and " / " or " / whitespace
_SEP = r"(?:\s*,\s*|\s*;\s*|\s+(?:and|or|&)\s+|\s+)"
_RANGE_JOIN = r"(?:\s*[-–—]\s*|\s+(?:through|thru|to)\s+)"

_BATCH_KEYWORD = re.compile(
    r"\b(?:lot|lots|batch|batches|date\s*codes?)\b"
    r"(?:\s*(?:numbers|number|nos\.?|no\.?|codes|code)\b)?"
    r"\s*[#:]*\s*(?:(?:of|is|are|include|includes|including)\s+)?",
    re.IGNORECASE,
)
_SERIAL_KEYWORD = re.compile(
    r"\bserial\s*(?:numbers|number|nos\.?|no\.?|#)?\s*(?:ranges|range)?\s*[#:]*\s*"
    r"(?:(?:is|are|of|include|includes|including|listed)\s+)?",
    re.IGNORECASE,
)
_PREFIX_PHRASE = re.compile(
    r"(?:that\s+)?(?:beginning|begin|begins|starting|start|starts)\s+with\s+"
    r"(?:the\s+(?:following\s+)?prefix(?:es)?\s+)?|with\s+the\s+prefix(?:es)?\s+",
    re.IGNORECASE,
)
_BETWEEN_PHRASE = re.compile(r"(?:between|from)\s+", re.IGNORECASE)
_MODEL_KEYWORD = re.compile(
    r"\b(?:model|models|item|items|sku|skus|style|part)\b"
    r"(?:\s*(?:numbers|number|nos\.?|no\.?|codes|code|#))?\s*(?:\(s\))?"
    r"\s*[#:]*\s*(?:(?:is|are|of|include|includes|including)\s+)?",
    re.IGNORECASE,
)
_QUOTED_RE = re.compile(r'"(' + _TOKEN + r')"')
_ALL_LOTS_RE = re.compile(r"\ball\s+(?:lots?|batches|batch\s+numbers?|serial\s+numbers?)\b", re.I)
_STOP_WORDS = frozenset({"exp", "expiry", "expiration", "upc", "udi", "udi-di", "mfg", "mfd"})


def _clean(text: str) -> str:
    """Straight quotes, no parentheticals ("2510 (Oct-2025)"), no odd spaces."""
    text = _NBSP_RE.sub(" ", str(text or "").translate(_QUOTES))
    return _PAREN_RE.sub(" ", text)


def _is_code(token: str) -> bool:
    """2-24 chars with a digit; 12+ plain digits is a UPC/EAN/UDI, not a lot or model."""
    if not (2 <= len(token) <= MAX_TOKEN and _DIGIT_RE.search(token)):
        return False
    return not (token.isdigit() and len(token) >= 12)


def _is_quoted_code(token: str) -> bool:
    """A quoted token counts without a digit when it is an upper-case code with a separator."""
    if _is_code(token):
        return True
    return (
        3 <= len(token) <= MAX_TOKEN and token.upper() == token and any(ch in token for ch in "-_/")
    )


def _dedupe(tokens: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for tok in tokens:
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out[:MAX_HITS]


def _match_token(text: str, pos: int) -> tuple[str, int] | None:
    """Token at exactly ``pos`` (quotes allowed around it) -> (token, end) or None."""
    quoted = text.startswith('"', pos)
    m = _TOKEN_RE.match(text, pos + 1 if quoted else pos)
    if not m:
        return None
    end = m.end()
    if quoted:
        if not text.startswith('"', end):
            return None
        end += 1
    return m.group(0).rstrip("-_"), end


def _code_list(text: str, pos: int, *, quoted_ok: bool = False) -> tuple[list[str], int]:
    """Consume ``TOKEN (, | and | or | ;) TOKEN ...`` from ``pos``; stop at the first non-code."""
    out: list[str] = []
    sep = re.compile(_SEP)
    cur = pos
    while True:
        got = _match_token(text, cur)
        if not got:
            break
        tok, end = got
        was_quoted = text.startswith('"', cur)
        ok = _is_quoted_code(tok) if (was_quoted and quoted_ok) else _is_code(tok)
        if not ok or tok.lower().rstrip(".") in _STOP_WORDS:
            break
        out.append(tok)
        cur = end
        m = sep.match(text, cur)
        if not m or m.end() == cur:
            break
        cur = m.end()
    return out, cur


def extract_batches(text: str) -> list[str]:
    """Lot / batch / date-code tokens following their keyword, deduped, in order.

    ``"Lot # NC185424, Exp Date: 2/12/2027; Lot # NC185479"`` -> ``["NC185424", "NC185479"]``;
    ``"batch code 0925"`` -> ``["0925"]``; ``"lot numbers and manufacturing dates"`` -> ``[]``.
    """
    text = _clean(text)
    found: list[str] = []
    pos = 0
    while True:
        m = _BATCH_KEYWORD.search(text, pos)
        if not m:
            break
        tokens, end = _code_list(text, m.end())
        found.extend(tokens)
        pos = max(end, m.end())
    return _dedupe(found)


def _range_or_token(text: str, pos: int) -> tuple[str | None, int]:
    """``A - B`` / ``A through B`` -> ``"A-B"``; a lone hyphenated numeric pair also splits."""
    got = _match_token(text, pos)
    if not got:
        return None, pos
    first, end = got
    join = re.compile(_RANGE_JOIN).match(text, end)
    if join:
        second = _match_token(text, join.end())
        if second and _is_code(first) and _is_code(second[0]):
            return f"{first}-{second[0]}", second[1]
    if not _is_code(first) or first.lower().rstrip(".") in _STOP_WORDS:
        return None, pos
    if first.count("-") == 1:
        a, b = first.split("-")
        if len(a) >= 3 and len(b) >= 3 and _is_code(a) and _is_code(b):
            return f"{a}-{b}", end
    return first, end


def extract_serial_ranges(text: str) -> list[str]:
    """Serial-number ranges and prefixes as normalised strings.

    ``"serial numbers 4000 through 5200"`` -> ``["4000-5200"]``;
    ``"serial numbers between A12 and A99"`` -> ``["A12-A99"]``;
    ``"serial numbers beginning with 24"`` -> ``["starting with 24"]``;
    ``"serial number WF2236430065"`` -> ``["WF2236430065"]``;
    ``"no serial numbers are affected"`` -> ``[]``.
    """
    text = _clean(text)
    found: list[str] = []
    sep = re.compile(_SEP)
    pos = 0
    while True:
        m = _SERIAL_KEYWORD.search(text, pos)
        if not m:
            break
        cur = m.end()
        prefix = _PREFIX_PHRASE.match(text, cur)
        if prefix:
            tokens, cur = _code_list(text, prefix.end(), quoted_ok=True)
            found.extend(f"starting with {t}" for t in tokens)
            pos = max(cur, m.end())
            continue
        between = _BETWEEN_PHRASE.match(text, cur)
        if between:
            cur = between.end()
            pair = re.compile(
                rf"({_TOKEN})\s+(?:and|to|through)\s+({_TOKEN})", re.IGNORECASE
            ).match(text, cur)
            if pair and _is_code(pair.group(1)) and _is_code(pair.group(2)):
                found.append(f"{pair.group(1)}-{pair.group(2)}")
                cur = pair.end()
            pos = max(cur, m.end())
            continue
        while True:
            item, cur = _range_or_token(text, cur)
            if item is None:
                break
            found.append(item)
            s = sep.match(text, cur)
            if not s or s.end() == cur:
                break
            cur = s.end()
        pos = max(cur, m.end())
    return _dedupe(found)


def extract_models(text: str) -> list[str]:
    """Model / item / SKU numbers: quoted codes anywhere plus code lists after the keyword.

    ``'model number "HDFS400" appears'`` -> ``["HDFS400"]``; ``"model number XR-8801"`` ->
    ``["XR-8801"]``; ``"model number is located on the back"`` -> ``[]``.
    """
    text = _clean(text)
    found: list[str] = []
    pos = 0
    while True:
        m = _MODEL_KEYWORD.search(text, pos)
        if not m:
            break
        tokens, end = _code_list(text, m.end(), quoted_ok=True)
        found.extend(tokens)
        pos = max(end, m.end())
    found.extend(t for t in _QUOTED_RE.findall(text) if _is_quoted_code(t))
    return _dedupe(found)


def mentions_all_lots(text: str) -> bool:
    """True for "all lots" / "all batches" / "all serial numbers" phrasing (no list to keep)."""
    return bool(_ALL_LOTS_RE.search(str(text or "")))
