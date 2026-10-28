"""Exact lookup of abend codes and messages, so S0C7 never gets confused with S0C4.

Built in memory from data/chunks/ibm.jsonl; no separate table to keep in sync.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"  # rag-llm/data, whatever the working directory

IBM_CHUNKS = DATA / "chunks/ibm.jsonl"

# In questions: S0C7, SOC7 (letter O typo), SB37, S806-04, "abend 0C4", "ABEND=S322", IEF450I.
SYSTEM_RE = re.compile(r"\bS([0-9A-F]{3})(?:-[0-9A-F]{2})?\b")
TYPO_RE = re.compile(r"\bSOC([0-9A-F])\b")
BARE_RE = re.compile(r"\b(?:ABEND(?:\s+CODE)?|COMPLETION\s+CODE)\s*[=:]?\s*S?((?=[0-9A-F]*\d)[0-9A-F]{3})\b")  # not "return code 100", not "abend bad"
MESSAGE_RE = re.compile(r"\b(I[EFG][A-Z]{1,3}\d{3,5}[A-Z])\b")


def find_codes(text: str) -> list[str]:
    """Codes mentioned in a question, normalized (S0C7, IEF450I), in order, no repeats."""
    up = text.upper()
    found = []
    for m in SYSTEM_RE.finditer(up):
        if any(ch.isdigit() for ch in m.group(1)):  # skips words like SADD, SFED
            found.append((m.start(), "S" + m.group(1)))
    found += [(m.start(), "S0C" + m.group(1)) for m in TYPO_RE.finditer(up)]
    found += [(m.start(), "S" + m.group(1)) for m in BARE_RE.finditer(up)]
    found += [(m.start(), m.group(1)) for m in MESSAGE_RE.finditer(up)]
    return list(dict.fromkeys(code for _, code in sorted(found)))


@lru_cache(maxsize=1)
def _entries(path: Path = IBM_CHUNKS) -> dict[str, list[dict]]:
    entries: dict[str, list[dict]] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            chunk = json.loads(line)
            entries.setdefault(chunk["code"], []).append(chunk)
    return entries


def lookup_code(code: str, path: Path = IBM_CHUNKS) -> list[dict]:
    """IBM entries for a code: 'S0C7', '0C7' and 'IEF450I' all work. Empty list if unknown."""
    entries = _entries(path)
    key = code.upper().strip()
    if re.fullmatch(r"S[0-9A-F]{3}", key):
        key = key[1:]
    # 0C1-0CF share the "0Cx" entry; same for other families IBM groups by last digit.
    return entries.get(key) or entries.get(key[:-1] + "x", [])
