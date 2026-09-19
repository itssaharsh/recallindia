"""Deterministic text / brand / identifier normalisation shared by the match pipeline.

Standard library only: this module ships in the common layer and is imported by the API and
every matcher Lambda. Fuzzy scoring (rapidfuzz) lives in ``backend/matcher/textmatch.py``,
which is the only place allowed to depend on it.

* ``normalise_text`` -- the one canonical form for fuzzy comparison.
* ``normalise_brand`` / ``brand_variants`` / ``brands_match`` -- brand equality that survives
  the legal-form noise CDSCO rows carry ("M/s. Forgo Pharmaceuticals Pvt. Ltd." is the same
  brand as "Forgo Pharmaceuticals") while keeping the tokens that distinguish brands
  ("Pharmaceuticals", "Industries", "Labs" stay).
* ``identifier_tokens`` / ``norm_identifier`` -- whitespace- and hyphen-insensitive keys for
  batch / serial / model strings ("DL-4471" and "dl 4471" are both ``DL4471``).
"""

from __future__ import annotations

import unicodedata

# Legal-form tokens only (compared after normalise_text, so "Pvt." is "pvt", "M/s." is "m/s").
# Never trade names or sector words: "pharmaceuticals", "industries", "labs" distinguish brands.
CORP_SUFFIXES: tuple[str, ...] = (
    "m/s",
    "ms",
    "pvt",
    "private",
    "ltd",
    "limited",
    "llp",
    "inc",
    "co",
    "corp",
    "corporation",
    "plc",
    "gmbh",
)
_CORP_SET = frozenset(CORP_SUFFIXES)
# Punctuation kept when it sits inside a token: "bio-sciences", "m/s", "i.p", "650mg."->"650mg".
_KEEP_INNER = "-/."
# Apostrophes are deleted rather than split on: "Reddy's" -> "reddys", not "reddy s".
_DROP = "'’ʼ"
_HYPHENS = "-‐‑‒–—−"


def normalise_text(s: str | None) -> str:
    """Lower-case NFKC text, whitespace collapsed, punctuation stripped except ``- / .`` inside
    tokens.

    ``"Paracetamol Tablets I.P. 650mg, (Forgo)"`` -> ``"paracetamol tablets i.p 650mg forgo"``.
    """
    text = unicodedata.normalize("NFKC", str(s or "")).lower()
    for ch in _DROP:
        text = text.replace(ch, "")
    out: list[str] = []
    for raw in text.split():
        chars = [ch if (ch.isalnum() or ch in _KEEP_INNER) else " " for ch in raw]
        for tok in "".join(chars).split():
            tok = tok.strip(_KEEP_INNER)
            if tok:
                out.append(tok)
    return " ".join(out)


def _is_corp_token(tok: str) -> bool:
    """``pvt`` / ``ltd`` / ``m/s`` ... and dotted compounds of them (``pvt.ltd`` -> pvt + ltd)."""
    if tok in _CORP_SET:
        return True
    parts = [p for p in tok.split(".") if p]
    return bool(parts) and all(p in _CORP_SET for p in parts)


def normalise_brand(s: str | None) -> str:
    """``normalise_text`` minus the legal-form tokens in ``CORP_SUFFIXES``.

    ``"M/s. Forgo Pharmaceuticals Pvt. Ltd."`` -> ``"forgo pharmaceuticals"``;
    ``"Martin & Brown Bio-Sciences Pvt.Ltd."`` -> ``"martin brown bio-sciences"``.
    A brand made only of legal-form tokens normalises to ``""`` (callers treat that as no brand).
    """
    return " ".join(tok for tok in normalise_text(s).split() if not _is_corp_token(tok))


def brand_variants(brand: str | None) -> list[str]:
    """Ordered, deduped lookup keys for a brand: as typed (lower), normalised, first token.

    ``brand_variants("Forgo Pharmaceuticals Pvt. Ltd.")`` ->
    ``["forgo pharmaceuticals pvt. ltd.", "forgo pharmaceuticals", "forgo"]``. Candidates tries
    each against the ``brand_lc`` GSI in this order; empties are dropped.
    """
    normalised = normalise_brand(brand)
    first = normalised.split()[0] if normalised else ""
    out: list[str] = []
    for variant in (str(brand or "").lower().strip(), normalised, first):
        if variant and variant not in out:
            out.append(variant)
    return out


def brands_match(a: str | None, b: str | None) -> bool:
    """True when two brand strings name the same brand after normalisation.

    Equal after ``normalise_brand``; or one token set contains the other (>= 1 token, so
    "Zenith Drugs" covers "Zenith Drugs Ltd." and a bare "Forgo" covers "Forgo
    Pharmaceuticals"); or the first tokens are equal and at least 4 characters long. Two
    brands that normalise to nothing never match.
    """
    na, nb = normalise_brand(a), normalise_brand(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    ta, tb = set(na.split()), set(nb.split())
    if ta <= tb or tb <= ta:
        return True
    first_a, first_b = na.split()[0], nb.split()[0]
    return first_a == first_b and len(first_a) >= 4


def norm_identifier(s: str | None) -> str:
    """Whitespace- and hyphen-insensitive upper-case key: ``"DL-4471"`` / ``"dl 4471"`` ->
    ``"DL4471"``. Other punctuation is significant (``"A/12"`` stays ``"A/12"``)."""
    text = unicodedata.normalize("NFKC", str(s or "")).upper()
    for ch in _HYPHENS:
        text = text.replace(ch, "")
    return "".join(text.split())


def identifier_tokens(*values: str | None) -> set[str]:
    """Set of ``norm_identifier`` keys of every non-empty value (batch, serial, model ...)."""
    out: set[str] = set()
    for value in values:
        key = norm_identifier(value)
        if key:
            out.add(key)
    return out
