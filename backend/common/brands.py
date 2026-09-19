"""``brand_key`` -- the one normalisation behind the ``brand_lc`` GSI key.

A notice's display ``brand`` is kept exactly as the source wrote it ("Finecure Pharmaceuticals
Ltd."). The *lookup key* must be the same string however the company was spelled -- by the
regulator ("Pvt. Ltd." / "Pvt.Ltd." / "Private Limited" / "(P) Ltd.") or by a person reading a
medicine strip ("Finecure Pharmaceuticals"). ``brand_key`` is used on BOTH sides: when a notice
is written (``schemas.Notice`` sets ``brand_lc = brand_key(brand)`` unconditionally) and when
candidates query the index, so the two can never drift apart. Deterministic, stdlib only.

Why over-merging is the cheap error here: a key only nominates *candidates*. A candidate still
has to pass the verifier (brand + product or a listed identifier) and the deterministic range
check before anything alerts. A key that is too strict, by contrast, hides a real hit silently.
"""

from __future__ import annotations

import re
import unicodedata

# Legal-form and noise tokens that carry no brand identity. "laboratories" / "pharmaceuticals"
# / "healthcare" are deliberately NOT here: they distinguish real companies.
NOISE_TOKENS: frozenset[str] = frozenset(
    {
        "m/s", "ms", "ltd", "limited", "pvt", "private", "llp", "llc", "inc", "co", "company",
        "corp", "corporation", "industries", "plc", "gmbh",
    }
)  # fmt: skip

_MS_PREFIX = re.compile(r"\bm\s*/\s*s\b\.?")  # "M/s." / "M / S" -- before "/" is stripped
_DOTTED_LL = re.compile(r"\bl\.\s*l\.\s*([cp])\b\.?")  # "L.L.C." / "L. L. P." -> "llc" / "llp"
# "P Ltd" / "P. Limited" is "(P) Ltd." written without the parentheses: the P means Private.
_PRIVATE_P = re.compile(r"\bp\.?\s+(?=(?:ltd|limited)\b)")
_PARENTHETICAL = re.compile(
    r"\([^)]*\)"
)  # "(P)" = Private, "(India)", "(Unit-II)" -- so no bare "p" token is needed
_APOSTROPHES = re.compile(r"['’ʼ`]")  # "Reddy's" -> "reddys", not "reddy s"
_DASHES = re.compile(r"[‐‑‒–—−]")  # unicode hyphens -> "-"
_NOT_KEY_CHARS = re.compile(r"[^a-z0-9\- ]+")  # everything else (dots, commas, slashes) -> space


def _join_initials(tokens: list[str]) -> list[str]:
    """``["j", "b", "chemicals"]`` -> ``["jb", "chemicals"]`` so "J.B." == "JB" == "J B"."""
    out: list[str] = []
    run: list[str] = []
    for tok in tokens:
        if len(tok) == 1 and tok.isalpha():
            run.append(tok)
            continue
        if run:
            out.append("".join(run))
            run = []
        out.append(tok)
    if run:
        out.append("".join(run))
    return out


def _tokens(text: str) -> list[str]:
    text = unicodedata.normalize("NFKC", text).lower()
    text = _MS_PREFIX.sub(" ", text)
    text = _DOTTED_LL.sub(lambda m: " ll" + m.group(1) + " ", text)
    text = _PRIVATE_P.sub(" ", text)
    text = _PARENTHETICAL.sub(" ", text)
    text = _APOSTROPHES.sub("", text)
    text = _DASHES.sub("-", text).replace("&", " and ")
    text = _NOT_KEY_CHARS.sub(" ", text)
    return [tok.strip("-") for tok in text.split() if tok.strip("-")]


def brand_key(s: str | None) -> str:
    """Lookup key for a brand: lower-case, punctuation stripped, legal-form / noise tokens dropped.

    ``"M/s. Tam-Bran Pharmaceuticals Pvt. Ltd."`` -> ``"tam-bran pharmaceuticals"``;
    ``"IPCA Laboratories Limited"`` -> ``"ipca laboratories"``;
    ``"J.B. Chemicals & Pharmaceuticals Ltd."`` -> ``"jb chemicals and pharmaceuticals"``.
    Inner hyphens survive. A name made only of noise tokens ("Pvt. Ltd.") and a blank input both
    return ``""``: callers treat that as "no brand" (the verifier must never call two
    all-legal-words strings a brand match) and ``schemas.Notice`` stores "unknown", because
    DynamoDB rejects an empty GSI key.
    """
    tokens = _tokens(str(s or ""))
    kept = _join_initials([tok for tok in tokens if tok not in NOISE_TOKENS])
    return " ".join(kept)
