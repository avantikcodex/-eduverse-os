from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

router = APIRouter(prefix="/ai", tags=["AI"])


class AskRequest(BaseModel):
    material_id: str | None = None
    question: str = Field(min_length=2, max_length=4000)
    mode: Literal["learn", "exam", "notes", "quick"] = "learn"


def get_models() -> list[str]:
    primary = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    fallback_text = os.getenv(
        "GEMINI_FALLBACK_MODELS",
        "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash-lite",
    )

    models = [primary]

    for model in fallback_text.split(","):
        model = model.strip()
        if model and model not in models:
            models.append(model)

    return models


def should_use_web(question: str) -> bool:
    q = question.lower()

    web_triggers = [
        "latest",
        "current",
        "today",
        "yesterday",
        "tomorrow",
        "recent",
        "news",
        "2026",
        "now",
        "price",
        "stock",
        "weather",
        "score",
        "match",
        "winner",
        "president",
        "result",
        "announcement",
        "update",
        "what happened",
    ]

    return any(trigger in q for trigger in web_triggers)


def build_prompt(
    question: str,
    mode: str,
    has_material: bool,
    web_enabled: bool,
) -> str:
    if has_material:
        source_rule = """
The student provided a learning document.
Treat the uploaded material as the primary source for document-specific facts.
Do not invent facts that are not supported by the document.
If the document does not contain enough information, clearly say so.
"""
    else:
        source_rule = """
No personal learning document was provided.
Answer from your general knowledge.
Never pretend that a PDF or personal document was supplied.
"""

    web_rule = (
        """
Web research is enabled for this question.
Use current web information when needed.
Prefer reliable and relevant sources.
Use the retrieved sources to support time-sensitive claims.
"""
        if web_enabled
        else
        """
Do not perform web research unless the system explicitly enables it.
"""
    )

    mode_rules = {
        "learn": """
Format the answer like this:

## 1. Main Idea
Direct answer in simple language.

## 2. Step-by-Step Explanation
Use numbered steps.

## 3. Simple Example
Give an easy real-world or coding example when useful.

## 4. Important Points
Use concise bullet points.

## 5. Remember This
Give one short takeaway or memory trick.

## 6. Check Yourself
Give one practice question.
""",
        "exam": """
Format the answer like this:

## 1. Definition

## 2. Explanation

## 3. Key Points

## 4. Example

## 5. Exam Answer

## 6. Practice Question
""",
        "notes": """
Format the answer like this:

## 1. Topic

## 2. Core Concepts

## 3. Important Definitions

## 4. Examples

## 5. Quick Revision

## 6. Practice Question
""",
        "quick": """
Format the answer like this:

## Answer

## Example

## Key Point
""",
    }

    return f"""
You are EduVerse OS, a universal AI Learning Brain.

You help students:
- understand difficult topics
- learn programming
- solve conceptual questions
- prepare for exams
- create notes
- practice
- analyze their learning material

CORE RULES:
- Answer the actual question first.
- Be accurate and clear.
- Match the student's language whenever practical.
- Preserve programming keywords, formulas, technical terms, and code syntax.
- For Java, Python, C++, JavaScript, TypeScript, SQL and other programming questions,
  include correct examples when useful.
- For mathematics and science, explain reasoning step by step.
- Never fabricate document facts.
- Never claim a source was used when it was not.
- Use proper Markdown headings and numbered lists.
- Do not output raw formatting instructions.

{source_rule}

{web_rule}

LEARNING MODE:
{mode_rules[mode]}

STUDENT QUESTION:
{question}
"""


def is_retryable_error(error: Exception) -> bool:
    message = str(error).lower()

    retry_terms = (
        "503",
        "service unavailable",
        "unavailable",
        "high demand",
        "overloaded",
        "429",
        "resource exhausted",
        "too many requests",
        "timeout",
    )

    return any(term in message for term in retry_terms)


def extract_sources(response) -> list[dict]:
    sources: list[dict] = []

    try:
        grounding = response.candidates[0].grounding_metadata

        if not grounding or not grounding.grounding_chunks:
            return sources

        for chunk in grounding.grounding_chunks:
            if chunk.web:
                sources.append(
                    {
                        "title": chunk.web.title or "Web source",
                        "url": chunk.web.uri,
                    }
                )
    except Exception:
        pass

    # Remove duplicates while keeping order.
    unique = []
    seen = set()

    for source in sources:
        key = source["url"]

        if key not in seen:
            seen.add(key)
            unique.append(source)

    return unique


@router.post("/ask")
def ask_ai(request: AskRequest):
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured",
        )

    pdf_path: Path | None = None

    if request.material_id:
        candidate = Path("uploads") / f"{request.material_id}.pdf"

        if not candidate.is_file():
            raise HTTPException(
                status_code=404,
                detail="Material PDF not found",
            )

        pdf_path = candidate

    use_web = should_use_web(request.question)

    prompt = build_prompt(
        question=request.question,
        mode=request.mode,
        has_material=pdf_path is not None,
        web_enabled=use_web,
    )

    client = genai.Client(api_key=api_key)

    uploaded_file = None

    try:
        if pdf_path is not None:
            uploaded_file = client.files.upload(file=pdf_path)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to prepare learning material: {exc}",
        ) from exc

    errors = []

    for model in get_models():
        try:
            config = None

            if use_web:
                config = types.GenerateContentConfig(
                    tools=[
                        types.Tool(
                            google_search=types.GoogleSearch()
                        )
                    ]
                )

            if uploaded_file is not None:
                contents = [prompt, uploaded_file]
            else:
                contents = prompt

            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )

            answer = (response.text or "").strip()

            if not answer:
                raise RuntimeError(
                    f"{model} returned an empty response"
                )

            return {
                "answer": answer,
                "grounded": pdf_path is not None,
                "web_researched": use_web,
                "source": (
                    "Uploaded learning material"
                    if pdf_path is not None
                    else "AI knowledge + web research when required"
                ),
                "material_id": request.material_id,
                "mode": request.mode,
                "model_used": model,
                "web_sources": extract_sources(response),
            }

        except Exception as exc:
            errors.append(f"{model}: {exc}")

            if not is_retryable_error(exc):
                raise HTTPException(
                    status_code=502,
                    detail=f"AI service error: {exc}",
                ) from exc

    raise HTTPException(
        status_code=503,
        detail=(
            "EduVerse Brain could not reach an available AI model. "
            "Automatic fallback was attempted. Please retry shortly."
        ),
    )
