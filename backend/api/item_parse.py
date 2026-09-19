"""Deterministic readers for the two ways an item arrives as text (P06 add-item sheet).

* ``parse_strip`` -- the printed lines of a medicine-strip photo (Textract ``DetectDocumentText``
  LINE blocks): batch after "B.No" / "Batch" / "Lot", Mfg and Exp dates after their labels, the
  manufacturer after "Mfd. by" / "Manufactured by", and the product line (the generic name, which
  strips print largest, preferring a dosage-form word such as "Tablets IP").
* ``parse_paste_line`` -- one pasted line ("Pantoprazole Tablets IP Finecure Pharmaceuticals
  PEP5001"): Amazon Comprehend's ORGANIZATION span is the brand, regexes find the batch / model /
  year / registration, and what remains is the product name.

No model decides anything here (no LLM in the decision path): Comprehend only marks spans, every
field is taken verbatim from the text, and each result carries a confidence plus
``needs_confirm`` so the UI asks for one tap whenever a field is missing or uncertain. Nothing
is saved: the UI posts the confirmed rows to ``POST /items``.
"""

from __future__ import annotations

import re
from typing import Any

try:  # local / tests: backend/ is the source root
    from common.cdsco import brand_from_manufacturer
except ModuleNotFoundError:  # pragma: no cover - the layer always ships common
    brand_from_manufacturer = None  # type: ignore[assignment]

CONFIRM_BELOW = 0.8  # a row / field under this confidence needs a tap in the UI
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1
)}  # fmt: skip

# --- vocabularies ------------------------------------------------------------------------------

_MEDICINE = re.compile(
    r"\b(tablets?|tabs?|capsules?|caps|syrup|suspension|injection|infusion|drops|ointment|cream"
    r"|gel|lotion|inhaler|sachets?|powder for oral|ip|bp|usp|i\.p\.?)\b"
    r"|\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ml|iu|%\s*w/[vw])\b",
    re.IGNORECASE,
)
_APPLIANCE = re.compile(
    r"\b(fan|cooker|iron|geyser|heater|stove|cooktop|induction|mixer|grinder|kettle|charger"
    r"|earbuds|earphones|headphones|airdopes|bottle|flask|refrigerator|fridge|washing machine"
    r"|microwave|oven|air conditioner|purifier|toaster|trimmer|dryer|lamp|power bank|helmet"
    r"|stroller|toy|chair|cot|crib)\b",
    re.IGNORECASE,
)
# Makes a person in India types for a car/two-wheeler (the NHTSA watchlist makes plus locals).
VEHICLE_MAKES: dict[str, str] = {
    "maruti": "maruti", "suzuki": "suzuki", "hyundai": "hyundai", "tata": "tata",
    "mahindra": "mahindra", "honda": "honda", "toyota": "toyota", "kia": "kia", "jeep": "jeep",
    "volkswagen": "volkswagen", "vw": "volkswagen", "skoda": "skoda", "renault": "renault",
    "nissan": "nissan", "mg": "mg", "ford": "ford", "bmw": "bmw", "mercedes": "mercedes-benz",
    "audi": "audi", "hero": "hero", "bajaj": "bajaj", "tvs": "tvs", "royal enfield":
    "royal enfield", "yamaha": "yamaha", "ktm": "ktm", "citroen": "citroen", "byd": "byd",
}  # fmt: skip
# The last word of a company name in Indian pharma / manufacturing -- the no-Comprehend
# fallback for spotting the brand ("Finecure Pharmaceuticals", "Micro Labs").
_COMPANY_TAIL = re.compile(
    r"\b(pharmaceuticals?|pharma|labs?|laboratories|healthcare|health care|biotech|biotechnics"
    r"|lifesciences?|life sciences?|remedies|formulations?|drugs|medicare|biocare|biogenetics?"
    r"|industries|enterprises|appliances|electricals?|electronics|motors|ltd|limited|pvt|llp"
    r"|inc|corporation|corp)\b\.?",
    re.IGNORECASE,
)
_LABEL_WORDS = re.compile(
    r"\b(b\.?\s*no|batch(?:\s*no)?|lot(?:\s*no)?|mfg|mfd|exp|expiry|m\.?r\.?p|price|rs|lic)\b\.?",
    re.IGNORECASE,
)

# --- identifiers -------------------------------------------------------------------------------

_VALUE = r"([A-Z0-9][A-Z0-9\-/]{1,19})"
_BATCH_LABEL = re.compile(
    r"\b(?:b\.?\s*no|batch\s*(?:no|number)?|lot\s*(?:no|number)?|b/n)\b\.?\s*[:.#\-]?\s*" + _VALUE,
    re.IGNORECASE,
)
_BATCH_LABEL_ONLY = re.compile(
    r"\b(?:b\.?\s*no|batch\s*(?:no|number)?|lot\s*(?:no|number)?)\b\.?\s*[:.#\-]?\s*$",
    re.IGNORECASE,
)
_STRENGTH = re.compile(
    r"^\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|%|w/v|w/w|mm|cm|l|w|v|mah|kg)$", re.IGNORECASE
)
_YEAR = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
_REG_NO = re.compile(r"\b([A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{4})\b")
_MODEL_TOKEN = re.compile(r"^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$")

_DATE_VALUE = (
    r"((?:[A-Za-z]{3,9}\.?\s*[\-/]?\s*(?:\d{4}|\d{2}))|(?:\d{1,2}\s*[/.\-]\s*(?:\d{4}|\d{2})))"
)
_MFG_LABEL = re.compile(
    r"\b(?:mfg|mfd|manufactur(?:ing|ed))\.?\s*(?:date|dt)?\.?\s*(?:on)?\s*[:.\-]?\s*" + _DATE_VALUE,
    re.IGNORECASE,
)
_EXP_LABEL = re.compile(
    r"\b(?:exp(?:iry)?|use\s+before|best\s+before)\.?\s*(?:date|dt)?\.?\s*[:.\-]?\s*" + _DATE_VALUE,
    re.IGNORECASE,
)
# The maker, as CDSCO lists it ("Manufactured By"), wins over the marketer: a strip often names
# both ("Marketed by: Meyer Organics" / "Manufactured in India by: Acme Generics LLP").
_MAKER_LABEL = re.compile(
    r"\b(?:mfd\.?\s*by|mfg\.?\s*by|manufactured\s+(?:in\s+[a-z]+\s+)?(?:for\s+\S+\s+)?by"
    r"|made\s+(?:in\s+[a-z]+\s+)?by)\b\s*[:.\-]?\s*(.*)$",
    re.IGNORECASE,
)
_MARKETER_LABEL = re.compile(
    r"\b(?:mkt\.?\s*by|mkd\.?\s*by|marketed\s+by|distributed\s+by)\b\s*[:.\-]?\s*(.*)$",
    re.IGNORECASE,
)
# Inside an edge band the stamp's "B." is often lost ("No.446AG710"); accept a bare "No." there,
# never after a licence / registration prefix ("M.L. No. MNB/15/880" is the manufacturing licence).
_EDGE_NO = re.compile(r"(?<![A-Za-z])no\.?\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/]{2,19})", re.IGNORECASE)
_NOT_A_BATCH_PREFIX = re.compile(
    r"\b(m\.?\s*l|lic(?:en[cs]e)?|reg(?:n|d)?|plot|khasra)\.?\s*$", re.I
)
_SMALL_PRINT = re.compile(
    r"\b(each|contains|composition|store|keep|dosage|directions|schedule|warning|caution"
    r"|rx|only|protect|lic|licen[cs]e|m\.?r\.?p|incl|taxes|price|rs\.?|₹|pin|dist|road|plot"
    r"|sector|village|phase|industrial|area|tel|www|email)\b",
    re.IGNORECASE,
)
_STRENGTH_LINE = re.compile(r"^\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu)\b\.?$", re.IGNORECASE)


def _clean(text: Any) -> str:
    return " ".join(str(text or "").split())


def normalise_month(raw: str | None) -> str | None:
    """``"11/2025"`` / ``"NOV.2025"`` / ``"Nov-25"`` -> ``"2025-11"``; None when unparseable."""
    text = _clean(raw).lower().replace(".", " ")
    m = re.match(r"^(\d{1,2})\s*[/\-\s]\s*(\d{4}|\d{2})$", text)
    if m:
        month, year = int(m.group(1)), int(m.group(2))
    else:
        m = re.match(r"^([a-z]{3})[a-z]*\s*[/\-\s]?\s*(\d{4}|\d{2})$", text)
        if not m or m.group(1) not in _MONTHS:
            return None
        month, year = _MONTHS[m.group(1)], int(m.group(2))
    year = year + 2000 if year < 100 else year
    if not 1 <= month <= 12 or not 1990 <= year <= 2099:
        return None
    return f"{year:04d}-{month:02d}"


def looks_like_batch(token: str) -> bool:
    """A batch / lot code: 4-16 chars, has a digit, not a strength / year / short number."""
    tok = token.strip(".,;:()[]")
    if not 4 <= len(tok) <= 16 or not any(ch.isdigit() for ch in tok):
        return False
    if _STRENGTH.match(tok) or _YEAR.fullmatch(tok):
        return False
    core = tok.replace("-", "").replace("/", "")
    if not core.isalnum():
        return False
    if core.isdigit():
        return len(core) >= 5 or "-" in tok  # "230145", "1-3098"; never "650"
    return True


_VEHICLE_WORDS = re.compile(
    r"\b(car|suv|bike|scooter|motorcycle|motorbike|sedan|hatchback)\b", re.I
)


def detect_kind(text: str) -> str:
    """``medicine`` / ``vehicle`` / ``appliance`` / ``other`` from the words in the text.

    A vehicle needs a make AND a model year, a registration number or a vehicle word ("car"):
    "Bajaj Majesty Iron" is an appliance even though Bajaj also makes motorcycles.
    """
    if _MEDICINE.search(text):
        return "medicine"
    low = f" {text.lower()} "
    has_make = any(f" {word} " in low for word in VEHICLE_MAKES)
    vehicle_hint = _YEAR.search(text) or _REG_NO.search(text.upper()) or _VEHICLE_WORDS.search(text)
    if has_make and vehicle_hint and not _APPLIANCE.search(text):
        return "vehicle"
    if _APPLIANCE.search(text):
        return "appliance"
    return "other"


# --- paste lines ---------------------------------------------------------------------------------


def _best_entity(entities: list[dict], kind: str, minimum: float = 0.5) -> dict | None:
    hits = [
        e for e in entities or [] if e.get("Type") == kind and float(e.get("Score", 0)) >= minimum
    ]
    return max(hits, key=lambda e: float(e.get("Score", 0)), default=None)


def _company_fallback(line: str) -> str | None:
    """The run of capitalised words ending in a company word ("Finecure Pharmaceuticals")."""
    words = line.split()
    for i, word in enumerate(words):
        if _COMPANY_TAIL.fullmatch(word.strip(",.;")):
            start = i
            while (
                start > 0
                and words[start - 1][:1].isupper()
                and not _MEDICINE.fullmatch(words[start - 1].strip(",.;"))
                and not looks_like_batch(words[start - 1])
            ):
                start -= 1
            if start < i:
                return " ".join(w.strip(",;") for w in words[start : i + 1]).rstrip(".")
    return None


def _remove(text: str, part: str | None) -> str:
    if not part:
        return text
    return re.sub(re.escape(part), " ", text, count=1, flags=re.IGNORECASE)


def _overlaps(a: str, b: str) -> bool:
    x, y = a.lower(), b.lower()
    return x in y or y in x


def _brand_evidence(text: str, entities: list[dict], kind: str) -> tuple[str | None, float, str]:
    """``(brand, confidence, why)`` from two independent signals.

    A company-word run ("Finecure Pharmaceuticals", "Micro Labs") and Comprehend's ORGANIZATION
    span. Agreeing, they are strong. Disagreeing, the company-word run wins: Comprehend often
    tags a trade name ("Dolo") or the drug ("Pantoprazole") as the organisation. With neither,
    an appliance's first word is a guess worth one tap; a medicine gets no brand.
    """
    org = _best_entity(entities, "ORGANIZATION")
    company = _company_fallback(text)
    if company and org and _overlaps(company, org["Text"]):
        longer = max((company, _clean(org["Text"]).rstrip(",.")), key=len)
        return longer, max(0.95, float(org["Score"])), "brand: company name and Comprehend agree"
    if company and org:
        return (
            company,
            0.8,
            (
                f"brand: company name '{company}' (Comprehend's ORGANIZATION was "
                f"'{_clean(org['Text'])}')"
            ),
        )
    if company:
        return company, 0.9, "brand: company name"
    if org:
        score = float(org["Score"])
        return (
            _clean(org["Text"]).rstrip(",."),
            score,
            f"brand: Comprehend ORGANIZATION ({score:.2f})",
        )
    if kind in ("appliance", "other"):
        first = text.split()[0].strip(",.;") if text.split() else ""
        if first and not looks_like_batch(first) and not _STRENGTH.match(first):
            return first, 0.6, "brand guessed from the first word"
    return None, 0.4, "no brand found"


def _tagged(entities: list[dict], token: str) -> bool:
    return any(
        e.get("Type") in ("COMMERCIAL_ITEM", "OTHER") and token.lower() in str(e["Text"]).lower()
        for e in entities
    )


def parse_paste_line(line: str, entities: list[dict] | None = None) -> dict:
    """One pasted line -> an item row with ``confidence`` and ``needs_confirm``.

    ``entities`` are Comprehend spans for this line (``[]`` when none were found or recorded).
    The brand comes from ``_brand_evidence``; the batch is a labelled value ("batch FT5427") or
    the last batch-shaped token; a vehicle's make / model / year / registration are read from
    the whole line; what is left is the name. Every value is verbatim from the line.
    """
    text = _clean(line)
    entities = entities or []
    kind = detect_kind(text)
    row: dict[str, Any] = {"line": text, "kind": kind, "name": "", "brand": None, "model": None,
                           "batch": None, "make": None, "year": None, "reg_no": None}  # fmt: skip
    brand, brand_conf, brand_why = _brand_evidence(text, entities, kind)
    why = [brand_why]
    confidence = brand_conf

    if kind == "vehicle":
        low = text.lower()
        make_word = next((w for w in VEHICLE_MAKES if re.search(rf"\b{re.escape(w)}\b", low)), None)
        row["make"] = VEHICLE_MAKES.get(make_word or "")
        row["brand"] = (
            brand
            if brand and make_word and _overlaps(brand, make_word)
            else (make_word.title() if make_word else brand)
        )
        year = _YEAR.search(text)
        row["year"] = int(year.group(1)) if year else None
        reg = _REG_NO.search(text.upper())
        row["reg_no"] = reg.group(1).replace(" ", "") if reg else None
        after = (
            re.split(rf"\b{re.escape(make_word)}\b", text, maxsplit=1, flags=re.I)[-1]
            if (make_word)
            else text
        )
        words = [w for w in after.split()
                 if not _YEAR.fullmatch(w) and not _REG_NO.fullmatch(w.upper())]  # fmt: skip
        row["model"] = words[0].lower() if words else None
        row["name"] = " ".join(w.title() for w in (make_word, row["model"]) if w)
        confidence = max(confidence, 0.9) if make_word else confidence
        if not row["year"]:
            confidence *= 0.7
            why.append("no model year: the range check needs one")
        if not row["model"]:
            confidence *= 0.6
            why.append("no model")
    else:
        row["brand"] = brand
        rest = _remove(text, brand)
        labelled = _BATCH_LABEL.search(rest)
        if labelled:
            batch, batch_conf = labelled.group(1).upper(), 1.0
            rest = rest[: labelled.start()] + " " + rest[labelled.end() :]
        else:
            shaped = [t.strip(".,;:()") for t in rest.split() if looks_like_batch(t)]
            batch = shaped[-1].upper() if shaped else None
            batch_conf = (0.95 if _tagged(entities, shaped[-1]) else 0.9) if shaped else 0.5
            rest = _remove(rest, shaped[-1]) if shaped else rest
        if batch and _MODEL_TOKEN.match(batch) and kind != "medicine":
            row["model"] = batch  # "DX-6": an appliance model number, not a batch
        elif batch:
            row["batch"] = batch
            confidence *= batch_conf
        elif kind == "medicine":
            confidence *= batch_conf
            why.append("no batch: add it so the check can compare it")
        row["name"] = _clean(_LABEL_WORDS.sub(" ", rest)).strip(" ,;|-/")

    if not row["name"]:
        confidence *= 0.3
        why.append("no product name left")
    row["confidence"] = round(confidence, 2)
    row["needs_confirm"] = (
        confidence < CONFIRM_BELOW
        or not row["brand"]
        or not row["name"]
        or (kind == "medicine" and not row["batch"])
    )
    row["why"] = why
    return row


# --- strip photos --------------------------------------------------------------------------------


def _first_match(lines: list[dict], pattern: re.Pattern[str]) -> tuple[str | None, float]:
    for line in lines:
        m = pattern.search(line["text"])
        if m:
            return m.group(1), float(line.get("confidence", 0.0))
    return None, 0.0


def _edge_batch(line: dict) -> str | None:
    """A bare "No. <code>" read inside an edge band, unless it follows a licence prefix."""
    for m in _EDGE_NO.finditer(line["text"]):
        if _NOT_A_BATCH_PREFIX.search(line["text"][: m.start()]):
            continue
        if looks_like_batch(m.group(1)):
            return m.group(1).upper()
    return None


def _batch_from_lines(lines: list[dict]) -> tuple[str | None, float]:
    for index, line in enumerate(lines):
        m = _BATCH_LABEL.search(line["text"])
        if m and any(ch.isdigit() for ch in m.group(1)):
            return m.group(1).upper(), float(line.get("confidence", 0.0))
        if line.get("edge"):
            edge = _edge_batch(line)
            if edge:
                return edge, float(line.get("confidence", 0.0))
        if _BATCH_LABEL_ONLY.search(line["text"]) and index + 1 < len(lines):
            nxt = lines[index + 1]["text"].split()
            if nxt and looks_like_batch(nxt[0]):
                return nxt[0].upper(), float(lines[index + 1].get("confidence", 0.0)) * 0.9
    return None, 0.0


def _maker_from_lines(lines: list[dict]) -> tuple[str | None, float]:
    for label in (_MAKER_LABEL, _MARKETER_LABEL):  # the manufacturer first, then the marketer
        found = _company_after(lines, label)
        if found[0]:
            return found
    return None, 0.0


def _company_after(lines: list[dict], label: re.Pattern[str]) -> tuple[str | None, float]:
    for index, line in enumerate(lines):
        m = label.search(line["text"])
        if not m:
            continue
        value = m.group(1).strip()
        source = line
        if not value and index + 1 < len(lines):
            source = lines[index + 1]
            value = source["text"]
        if value:
            brand = brand_from_manufacturer(value) if brand_from_manufacturer else value
            return brand.strip(" ,.:"), float(source.get("confidence", 0.0))
    return None, 0.0


def _product_from_lines(lines: list[dict]) -> tuple[str | None, float]:
    tallest = max((line["height"] for line in lines), default=0.0) or 1.0
    best: tuple[float, int] | None = None
    for index, line in enumerate(lines):
        text = line["text"]
        if (_BATCH_LABEL.search(text) or _MFG_LABEL.search(text) or _EXP_LABEL.search(text)
                or _MAKER_LABEL.search(text) or _MARKETER_LABEL.search(text)
                or _SMALL_PRINT.search(text) or line.get("edge")):  # fmt: skip
            continue
        words = [w for w in re.findall(r"[A-Za-z]{3,}", text)]
        if not words:
            continue
        score = 2.0 * line["height"] / tallest
        if _MEDICINE.search(text):
            score += 1.5
        if line["top"] < 0.4:
            score += 0.3
        if best is None or score > best[0]:
            best = (score, index)
    if best is None:
        return None, 0.0
    index = best[1]
    name = lines[index]["text"]
    conf = float(lines[index].get("confidence", 0.0))
    nxt = lines[index + 1]["text"] if index + 1 < len(lines) else ""
    if _STRENGTH_LINE.match(nxt) and not re.search(r"\d\s*(mg|mcg|ml|iu)\b", name, re.I):
        name = f"{name} {nxt}"  # "Paracetamol Tablets IP" + "650 mg" printed on the next line
    return name, conf


def parse_strip(lines: list[dict]) -> dict:
    """Printed lines of a strip photo -> prefilled item fields with per-field confidence.

    ``lines`` are ``aws_ai.textract_lines`` rows. Returns ``{fields: {kind, name, brand, batch,
    mfg_date, exp_date}, confidence: {field: 0-1}, needs_confirm, missing}``; a field's
    confidence is the Textract confidence of the line it came from.
    """
    batch, batch_conf = _batch_from_lines(lines)
    mfg_raw, mfg_conf = _first_match(lines, _MFG_LABEL)
    exp_raw, exp_conf = _first_match(lines, _EXP_LABEL)
    brand, brand_conf = _maker_from_lines(lines)
    name, name_conf = _product_from_lines(lines)
    fields = {
        "kind": "medicine",
        "name": name or "",
        "brand": brand,
        "batch": batch,
        "mfg_date": normalise_month(mfg_raw) or (_clean(mfg_raw) or None),
        "exp_date": normalise_month(exp_raw) or (_clean(exp_raw) or None),
    }
    confidence = {
        "name": round(name_conf, 2),
        "brand": round(brand_conf, 2),
        "batch": round(batch_conf, 2),
        "mfg_date": round(mfg_conf, 2),
        "exp_date": round(exp_conf, 2),
    }
    missing = [f for f in ("name", "batch", "brand") if not fields[f]]
    uncertain = [f for f, c in confidence.items() if fields.get(f) and c < 0.9]
    return {
        "fields": fields,
        "confidence": confidence,
        "missing": missing,
        "uncertain": uncertain,
        "needs_confirm": True,  # a photo read is always confirmed by the person holding the strip
    }
