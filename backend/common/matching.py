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

from common.brands import brand_key

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


def normalise_brand(s: str | None) -> str:
    """The brand lookup key. Delegates to ``common.brands.brand_key`` so that what is stored in
    ``brand_lc``, what candidates query, and what the verifier compares are one definition.

    ``"M/s. Forgo Pharmaceuticals Pvt. Ltd."`` -> ``"forgo pharmaceuticals"``;
    ``"Martin & Brown Bio-Sciences Pvt.Ltd."`` -> ``"martin and brown bio-sciences"``.
    """
    return brand_key(s)


def brand_variants(brand: str | None) -> list[str]:
    """Ordered, deduped ``brand_lc`` lookup keys: ``brand_key(brand)``, then its first token.

    ``brand_variants("Finecure Pharmaceuticals Ltd.")`` -> ``["finecure pharmaceuticals",
    "finecure"]`` -- the same as for "Finecure Pharmaceuticals", which is the point. The
    first-token query only ever hits notices whose whole key is that one word ("jeep").
    """
    key = brand_key(brand)
    first = key.split()[0] if key else ""
    out: list[str] = []
    for variant in (key, first):
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
