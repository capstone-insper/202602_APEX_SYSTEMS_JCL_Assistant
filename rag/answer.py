"""Answer a JCL or abend question with citations.

Returns the /ask response shape: {answer, codes[], citations[{source, locator, snippet}]}.
"""


def answer(question: str) -> dict:
    # ponytail: fixed stub so the UI and eval can start; replaced by retrieval + Claude in T6.
    return {
        "answer": "Stub answer. The RAG is not connected yet.",
        "codes": [],
        "citations": [],
    }
