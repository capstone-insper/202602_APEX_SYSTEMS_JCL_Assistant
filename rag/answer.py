"""Answer a JCL or abend question with citations, using Claude on Amazon Bedrock.

Returns the /ask response shape: {answer, codes[], citations[{source, locator, snippet}]}.
Run: python -m rag.answer "STEP15 in POSTTRAN ended with S0C7, why?"

AWS credentials come from boto3's default chain (the EC2 instance role on the server); there
is no key in the code. JCL_ASSISTANT_STUB=1 returns a fixed answer, for UI work without AWS.
"""

import json
import os
import re
import sys

from rag.codes import find_codes, lookup_code
from rag.search import search_docs

MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
REGION = os.environ.get("AWS_REGION", "us-east-1")
MAX_TURNS = 4  # model calls per question: caps cost if it keeps asking for tools
ENTRY_CHARS = 6000  # long IBM entries (0Cx, EC6) are cut to this before going to the model
SNIPPET_CHARS = 400

SYSTEM = """You are a mainframe support assistant. You explain CardDemo JCL jobs and IBM z/OS abend \
codes and messages, and you suggest fixes.

Rules:
- Use only the numbered sources given to you in this conversation. Never use outside knowledge \
for facts about codes, messages or the CardDemo jobs.
- Cite every factual sentence with its source number in brackets, like [1] or [2][3].
- If the sources do not answer the question, reply exactly: Not found in the docs.
- Use the tools when the sources you have are not enough: lookup_code for an exact code or \
message id, search_docs for anything else. search_docs takes corpus "jcl" for CardDemo jobs \
and "ibm" for the IBM manuals.
- Be short: cause first, then the fix. Plain English, no headings."""

TOOLS = [
    {"toolSpec": {
        "name": "lookup_code",
        "description": "Exact IBM entry for an abend code or message id, e.g. S0C7, SB37, S806, IEF450I.",
        "inputSchema": {"json": {"type": "object", "properties": {"code": {"type": "string"}},
                                 "required": ["code"]}}}},
    {"toolSpec": {
        "name": "search_docs",
        "description": "Semantic search. corpus 'jcl' = CardDemo JCL jobs and steps; "
                       "'ibm' = IBM MVS System Codes and Messages manuals.",
        "inputSchema": {"json": {"type": "object", "properties": {
            "query": {"type": "string"}, "corpus": {"type": "string", "enum": ["jcl", "ibm"]}},
            "required": ["query", "corpus"]}}}},
]

STUB = {"answer": "Stub answer. The RAG is not connected yet.", "codes": [], "citations": []}


def _bedrock():
    import boto3
    from botocore.config import Config
    return boto3.client("bedrock-runtime", region_name=REGION,
                        config=Config(read_timeout=60, retries={"max_attempts": 3}))


def _focus(text: str, code: str, size: int) -> str:
    """Up to size chars of an entry, around the sub-code (0C7 inside the shared 0Cx entry)."""
    if len(text) <= size:
        return text
    sub = code[1:] if re.fullmatch(r"S[0-9A-F]{3}", code) else code
    i = text.find(f"\n{sub}\n")
    if i < 0 or i < size // 2:
        return text[:size]
    return text[:size // 3] + "\n...\n" + text[i + 1:i + 1 + size - size // 3]


def _entry_hits(code: str) -> list[dict]:
    hits = []
    for c in lookup_code(code):
        hits.append({"source": c["source"], "locator": f"{c['code']}, p. {c['page']}",
                     "text": _focus(c["text"], code, ENTRY_CHARS),
                     "snippet": _focus(c["text"], code, SNIPPET_CHARS)})
    return hits


class _Sources:
    """Numbered sources shown to the model; [n] in the answer maps back to a citation."""

    def __init__(self):
        self.items = []

    def add(self, hits: list[dict]) -> str:
        if not hits:
            return "No results."
        out = []
        for h in hits:
            self.items.append(h)
            out.append(f"[{len(self.items)}] {h['source']} | {h['locator']}\n{h.get('text', h['snippet'])}")
        return "\n\n".join(out)

    def cited(self, text: str) -> list[dict]:
        nums = dict.fromkeys(int(n) for n in re.findall(r"\[(\d+)\]", text))
        return [{"source": self.items[n - 1]["source"], "locator": self.items[n - 1]["locator"],
                 "snippet": self.items[n - 1]["snippet"][:SNIPPET_CHARS]}
                for n in nums if 1 <= n <= len(self.items)]

    def drop_unknown(self, text: str) -> str:
        """Remove [n] markers that point at no source."""
        return re.sub(r"\[(\d+)\]", lambda m: m.group(0) if 1 <= int(m.group(1)) <= len(self.items) else "", text)


def _run_tool(name: str, args: dict, sources: _Sources, codes: list[str]) -> str:
    if name == "lookup_code":
        code = args.get("code", "")
        hits = _entry_hits(code)
        if hits and code.upper() not in codes:
            codes.append(code.upper())
        return sources.add(hits) if hits else f"No IBM entry for {code}."
    if name == "search_docs":
        corpus = args.get("corpus") if args.get("corpus") in ("jcl", "ibm") else None
        return sources.add(search_docs(args.get("query", ""), corpus=corpus))
    return f"Unknown tool {name}."


def answer(question: str, client=None) -> dict:
    if os.environ.get("JCL_ASSISTANT_STUB") == "1":
        return STUB
    client = client or _bedrock()
    sources = _Sources()
    codes = find_codes(question)

    # Exact entries for the codes in the question go in up front: one model turn saved.
    found = [h for c in codes for h in _entry_hits(c)]
    missing = [c for c in codes if not _entry_hits(c)]
    context = sources.add(found) if found else "No codes detected in the question."
    if missing:
        context += "\nNo IBM entry in the corpus for: " + ", ".join(missing)
    messages = [{"role": "user", "content": [{"text": f"{question}\n\nSources:\n{context}"}]}]

    for _ in range(MAX_TURNS):
        resp = client.converse(modelId=MODEL_ID, system=[{"text": SYSTEM}], messages=messages,
                               toolConfig={"tools": TOOLS},
                               inferenceConfig={"maxTokens": 1500, "temperature": 0})
        msg = resp["output"]["message"]
        messages.append(msg)
        if resp["stopReason"] != "tool_use":
            break
        results = []
        for block in msg["content"]:
            if "toolUse" in block:
                use = block["toolUse"]
                text = _run_tool(use["name"], use.get("input", {}), sources, codes)
                results.append({"toolResult": {"toolUseId": use["toolUseId"], "content": [{"text": text}]}})
        messages.append({"role": "user", "content": results})
    else:
        return {"answer": "Not found in the docs.", "codes": codes, "citations": []}

    text = sources.drop_unknown("".join(b.get("text", "") for b in msg["content"]).strip())
    if resp["stopReason"] == "max_tokens":
        text += " (answer cut short)"
    citations = sources.cited(text)
    if not citations:  # an answer with no source is not allowed
        text = "Not found in the docs."
    return {"answer": text, "codes": codes, "citations": citations}


if __name__ == "__main__":
    print(json.dumps(answer(" ".join(sys.argv[1:])), indent=2))
