"""Chunk CardDemo JCL and PROCs: one chunk per step, plus one for the job card.

Run: python -m ingest.jcl   (clones CardDemo into data/raw if missing, writes data/chunks/jcl.jsonl)
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

CARDDEMO_URL = "https://github.com/aws-samples/aws-mainframe-modernization-carddemo"
CARDDEMO_SHA = "59cc6c2fd7ebd7ef7925cad552a01a4b8b6e4d5e"
JCL_DIRS = ["app/jcl", "app/proc", "app/app-authorization-ims-db2-mq/jcl",
            "app/app-transaction-type-db2/jcl", "samples/jcl", "samples/proc"]

RAW = Path("data/raw/carddemo")
OUT = Path("data/chunks/jcl.jsonl")

EXEC_RE = re.compile(r"^//([A-Z0-9@#$]*)\s+EXEC\s+(\S+)")
HEAD_RE = re.compile(r"^//([A-Z0-9@#$]+)\s+(JOB|PROC)\b")


def chunk_jcl(text: str, source: str) -> list[dict]:
    # Columns 73-80 are the JCL sequence field, ignored by the system.
    lines = [line[:72].rstrip() for line in text.splitlines()]

    # The Apache license banner is noise for retrieval.
    license_lines = set()
    start = next((i for i, l in enumerate(lines) if "Copyright" in l), None)
    end = next((i for i, l in enumerate(lines) if "language governing" in l), None)
    if start is not None and end is not None and start <= end:
        license_lines = set(range(start, end + 1))

    head = next((HEAD_RE.match(l) for l in lines if HEAD_RE.match(l)), None)
    job = head.group(1) if head else Path(source).stem.upper()

    # A step starts at its EXEC line, pulled up over the comments right above it.
    starts = []
    for i, line in enumerate(lines):
        m = EXEC_RE.match(line)
        if not m:
            continue
        s = i
        while s > 0 and lines[s - 1].startswith("//*") and s - 1 not in license_lines:
            s -= 1
        operand = m.group(2)
        program = operand.split(",")[0].split("=")[-1]  # PGM=X, PROC=X or a bare proc name
        starts.append((s, i, m.group(1), program))

    def text_of(a, b):
        return "\n".join(lines[k] for k in range(a, b) if k not in license_lines)

    chunks = []
    first = starts[0][0] if starts else len(lines)
    if first > 0:
        chunks.append({"source": source, "kind": "jcl_job", "job": job, "step": None,
                       "program": None, "start_line": 1, "end_line": first,
                       "text": text_of(0, first)})
    for n, (s, _, step, program) in enumerate(starts):
        e = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        chunks.append({"source": source, "kind": "jcl_step", "job": job, "step": step or None,
                       "program": program, "start_line": s + 1, "end_line": e,
                       "text": text_of(s, e)})
    for c in chunks:
        c["id"] = f"{c['source']}:{c['start_line']}"
    return chunks


def fetch():
    if RAW.exists():
        return
    try:
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--sparse", "--no-checkout",
                        CARDDEMO_URL, str(RAW)], check=True)
        subprocess.run(["git", "-C", str(RAW), "sparse-checkout", "set", *JCL_DIRS], check=True)
        subprocess.run(["git", "-C", str(RAW), "checkout", "-q", CARDDEMO_SHA], check=True)
    except BaseException:
        shutil.rmtree(RAW, ignore_errors=True)  # a half clone would be skipped on the next run
        raise


def main():
    fetch()
    chunks = []
    for d in JCL_DIRS:
        for path in sorted((RAW / d).iterdir()):
            if path.suffix.lower() in {".jcl", ".prc"}:
                source = "carddemo/" + path.relative_to(RAW).as_posix()
                chunks += chunk_jcl(path.read_text(encoding="utf-8", errors="replace"), source)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c) + "\n")
    print(f"{len(chunks)} chunks -> {OUT}")


if __name__ == "__main__":
    main()
