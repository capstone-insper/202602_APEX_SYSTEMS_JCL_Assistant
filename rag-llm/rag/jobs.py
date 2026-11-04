"""Steps of the CardDemo jobs named in a question, so an abend answer can use the job's own JCL.

Built in memory from data/chunks/jcl.jsonl, like rag.codes.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"  # rag-llm/data, whatever the working directory

JCL_CHUNKS = DATA / "chunks/jcl.jsonl"
MAX_JOBS = 2  # some job names are also DD names (XREFFILE), so a question can match more than it means
WORD_RE = re.compile(r"[A-Z0-9@#$]+")


@lru_cache(maxsize=1)
def _jobs(path: Path = JCL_CHUNKS) -> dict[str, list[dict]]:
    """Step chunks by job name. A name found in two files (REPROC) keeps the first file."""
    jobs: dict[str, list[dict]] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            chunk = json.loads(line)
            if chunk["kind"] == "jcl_step":
                steps = jobs.setdefault(chunk["job"], [])
                if not steps or steps[0]["source"] == chunk["source"]:
                    steps.append(chunk)
    return jobs


def find_steps(text: str, path: Path = JCL_CHUNKS) -> list[dict]:
    """Steps of the jobs in a question, in order: only the named step when the question has one."""
    jobs = _jobs(path)
    words = WORD_RE.findall(text.upper())
    found = []
    for name in list(dict.fromkeys(w for w in words if w in jobs))[:MAX_JOBS]:
        found += [s for s in jobs[name] if s["step"] in words] or jobs[name]
    return found
