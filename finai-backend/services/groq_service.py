"""Small Groq chat-completions client used as a cross-provider advisor fallback."""

import os
import json
import time
from types import SimpleNamespace
from typing import Callable, Optional

import requests


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-20b").strip()
GROQ_PLANNING_MODEL = os.getenv("GROQ_PLANNING_MODEL", "qwen/qwen3.8-27b").strip()
GROQ_OCR_MODEL = os.getenv("GROQ_OCR_MODEL", "qwen/qwen3.8-27b").strip()
try:
    GROQ_TIMEOUT_SECONDS = max(2.0, min(8.0, float(os.getenv("GROQ_TIMEOUT_SECONDS", "4"))))
except (TypeError, ValueError):
    GROQ_TIMEOUT_SECONDS = 4.0


class GroqProviderError(RuntimeError):
    def __init__(self, status_code: Optional[int], message: str):
        super().__init__(message)
        self.status_code = status_code


def generate_groq_response(
    messages: list[dict],
    *,
    model: str,
    temperature: float = 0.25,
    max_tokens: int = 500,
    json_mode: bool = False,
    validate: Optional[Callable] = None,
    timeout_seconds: Optional[float] = None,
    operation: str = "advisor",
):
    """Generate one bounded Groq response and return a Gemini-like text object."""
    if not GROQ_API_KEY:
        raise RuntimeError("Groq is not configured")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request_bytes = len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    print(f"[Groq][{operation}] request prepared: model={model}, payload_bytes={request_bytes}.")

    started_at = time.perf_counter()
    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=payload,
            timeout=min(GROQ_TIMEOUT_SECONDS, timeout_seconds) if timeout_seconds else GROQ_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise GroqProviderError(None, type(exc).__name__) from exc

    if not response.ok:
        # Avoid logging the response body, which may contain request details.
        raise GroqProviderError(response.status_code, f"Groq HTTP {response.status_code}")

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise GroqProviderError(response.status_code, "Groq returned an invalid response shape") from exc
    if not isinstance(content, str) or not content.strip():
        raise GroqProviderError(response.status_code, "Groq returned an empty response")

    result = SimpleNamespace(text=content.strip())
    if validate:
        validate(result)
    duration_ms = round((time.perf_counter() - started_at) * 1000)
    print(f"[Groq][{operation}] response succeeded: {model} in {duration_ms}ms.")
    return result, model
