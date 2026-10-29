"""Run the test set against POST /ask, the same API the chat uses, and score each answer.

Two scores per scenario:
  source_ok  every expected source is among the citations (for not_found: no citations)
  answer_ok  the answer has a term of every keyword group (for not_found: "Not found in the docs.")

Run from the repo root, with the API up (stub or real). /ask needs a session, so the script
signs in first with an account made by python -m api.users:
  export JCL_EVAL_EMAIL=eval@company.com
  read -s JCL_EVAL_PASSWORD && export JCL_EVAL_PASSWORD     # not in the shell history
  python eval/run_eval.py                                  # http://localhost:8000
  python eval/run_eval.py --url http://<ec2-host> --only abend-s0c7-posttran

Writes one CSV row per scenario to eval/results/ and prints the totals. Each real question
costs about $0.04 on Bedrock.
"""

import argparse
import csv
import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
NOT_FOUND = "Not found in the docs"
TIMEOUT_S = 130  # same as the chat (frontend/src/api.js)

# Keeps the session cookie from /auth/login for every /ask, like the browser does.
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def post(url: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(url.rstrip("/") + path, method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=TIMEOUT_S) as r:
        return json.load(r)


def sign_in(url: str) -> None:
    email, password = os.environ.get("JCL_EVAL_EMAIL"), os.environ.get("JCL_EVAL_PASSWORD")
    if not (email and password):
        raise SystemExit("Set JCL_EVAL_EMAIL and JCL_EVAL_PASSWORD (an account from python -m api.users).")
    try:
        post(url, "/auth/login", {"email": email, "password": password})
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Sign-in failed ({e.code}): {e.read().decode(errors='replace')}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise SystemExit(f"Cannot reach {url}: {getattr(e, 'reason', e)}") from None


def ask(url: str, question: str) -> dict:
    return post(url, "/ask", {"question": question})


def cites(expected: dict, citation: dict) -> bool:
    """A JCL file matches by path; an IBM entry by book and code. 0C7 also matches 0Cx."""
    if citation["source"] != expected["source"]:
        return False
    code = expected.get("code")
    if not code:
        return True
    cited = citation["locator"].split(",")[0].strip().upper()
    return cited in {code.upper(), code.upper()[:-1] + "X"}


def score(scenario: dict, result: dict) -> dict:
    answer, citations = result["answer"], result["citations"]
    if scenario.get("not_found"):
        return {"source_ok": not citations, "answer_ok": answer.startswith(NOT_FOUND), "missing": ""}
    missing_sources = [s.get("code") or s["source"] for s in scenario["sources"]
                       if not any(cites(s, c) for c in citations)]
    text = answer.lower()
    missing_terms = [" | ".join(g) for g in scenario["keywords"]
                     if not any(str(term).lower() in text for term in g)]
    return {"source_ok": not missing_sources, "answer_ok": not missing_terms,
            "missing": "; ".join(missing_sources + missing_terms)}


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--url", default="http://localhost:8000")
    p.add_argument("--scenarios", type=Path, default=HERE / "scenarios.yaml")
    p.add_argument("--only", action="append", help="scenario id; repeat for several")
    p.add_argument("--out", type=Path, help="CSV path (default: eval/results/<date>-<time>.csv)")
    args = p.parse_args()

    sign_in(args.url)
    scenarios = yaml.safe_load(args.scenarios.read_text(encoding="utf-8"))["scenarios"]
    if args.only:
        scenarios = [s for s in scenarios if s["id"] in args.only]
    out = args.out or HERE / "results" / f"{datetime.now():%Y-%m-%d-%H%M}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for s in scenarios:
        start = time.perf_counter()
        try:
            result = ask(args.url, s["question"])
            row = score(s, result)
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            # One failed call should not lose the others; it counts as wrong on both scores.
            result = {"answer": "", "codes": [], "citations": []}
            row = {"source_ok": False, "answer_ok": False, "missing": f"error: {e}"}
        rows.append({"id": s["id"], "kind": s["kind"], **row,
                     "seconds": round(time.perf_counter() - start, 1),
                     "codes": " ".join(result["codes"]),
                     "citations": " | ".join(f"{c['source']} ({c['locator']})" for c in result["citations"]),
                     "question": s["question"], "expected_cause": s["expected_cause"],
                     "answer": result["answer"]})
        print(f"{s['id']:<24} source {'ok' if row['source_ok'] else '--'}  "
              f"answer {'ok' if row['answer_ok'] else '--'}  {row['missing']}")

    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    n = len(rows)
    print(f"\nsource {sum(r['source_ok'] for r in rows)}/{n}   "
          f"answer {sum(r['answer_ok'] for r in rows)}/{n}   -> {out}")


if __name__ == "__main__":
    main()
