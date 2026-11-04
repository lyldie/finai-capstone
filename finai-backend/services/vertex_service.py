"""Vertex AI (Gemini Enterprise Agent Platform) fallback client."""

import os
import time
from typing import Callable, Optional

from google import genai
from google.genai import types


VERTEX_AI_ENABLED = os.getenv("VERTEX_AI_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
VERTEX_AI_PROJECT_ID = os.getenv("VERTEX_AI_PROJECT_ID", "").strip()
VERTEX_AI_LOCATION = os.getenv("VERTEX_AI_LOCATION", "global").strip() or "global"
VERTEX_AI_MODEL = os.getenv("VERTEX_AI_MODEL", "gemini-3.8-flash").strip()
try:
    VERTEX_AI_TIMEOUT_SECONDS = max(2.0, min(15.0, float(os.getenv("VERTEX_AI_TIMEOUT_SECONDS", "8"))))
except (TypeError, ValueError):
    VERTEX_AI_TIMEOUT_SECONDS = 8.0


def is_vertex_configured() -> bool:
    return VERTEX_AI_ENABLED and bool(VERTEX_AI_PROJECT_ID and VERTEX_AI_MODEL)


def generate_vertex_response(
    contents,
    config=None,
    *,
    validate: Optional[Callable] = None,
    operation: str = "advisor",
):
    """Generate one response using Cloud Run's attached service account ADC."""
    if not is_vertex_configured():
        raise RuntimeError("Vertex AI is not configured")

    client = genai.Client(
        vertexai=True,
        project=VERTEX_AI_PROJECT_ID,
        location=VERTEX_AI_LOCATION,
        http_options=types.HttpOptions(
            api_version="v1",
            timeout=round(VERTEX_AI_TIMEOUT_SECONDS * 1000),
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )
    started_at = time.perf_counter()
    print(f"[Vertex AI][{operation}] attempt started: model={VERTEX_AI_MODEL}, location={VERTEX_AI_LOCATION}.")
    try:
        response = client.models.generate_content(
            model=VERTEX_AI_MODEL,
            contents=contents,
            config=config,
        )
        if not (getattr(response, "text", None) or "").strip():
            raise RuntimeError("Vertex AI returned an empty response")
        if validate:
            validate(response)
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        print(f"[Vertex AI][{operation}] succeeded in {duration_ms}ms.")
        return response, VERTEX_AI_MODEL
    except Exception as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        print(
            f"[Vertex AI][{operation}] failed in {round((time.perf_counter() - started_at) * 1000)}ms "
            f"(error={type(exc).__name__}, code={code or 'n/a'})."
        )
        raise
    finally:
        client.close()
