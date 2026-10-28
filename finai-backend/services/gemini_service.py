"""Shared Gemini model selection and one-step model fallback."""

import json
import os
import re
import time
from typing import Callable, Optional


GEMINI_PRIMARY_MODEL = os.getenv("GEMINI_PRIMARY_MODEL", "gemini-3.8-flash").strip()
GEMINI_BACKUP_MODEL = os.getenv("GEMINI_BACKUP_MODEL", "gemini-3.6-flash").strip()


class InvalidModelOutputError(ValueError):
    """The request succeeded but the model returned unusable output."""


def validate_json_response(response) -> dict:
    """Raise for malformed JSON so the alternate model can get one attempt."""
    text = (getattr(response, "text", None) or "").strip()
    text = re.sub(r"```json\s*|\s*```", "", text, flags=re.IGNORECASE)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    candidate = match.group(0) if match else text
    try:
        parsed = json.loads(candidate)
    except (TypeError, ValueError) as exc:
        raise InvalidModelOutputError("AI provider returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise InvalidModelOutputError("AI provider JSON output was not an object")
    return parsed


def generate_content_for_model(
    client,
    model: str,
    contents,
    config=None,
    *,
    validate: Optional[Callable] = None,
    operation: str = "unspecified",
):
    """Generate once with a specific model so callers can interleave providers."""
    if client is None:
        raise RuntimeError("Gemini client is not configured")
    if not model:
        raise RuntimeError("No Gemini model is configured")

    started_at = time.perf_counter()
    print(f"[Gemini][{operation}] attempt started: {model}.")
    try:
        response = client.models.generate_content(model=model, contents=contents, config=config)
        if not (getattr(response, "text", None) or "").strip():
            raise InvalidModelOutputError("Gemini returned an empty response")
        if validate:
            validate(response)
        print(f"[Gemini][{operation}] succeeded: {model} in {round((time.perf_counter() - started_at) * 1000)}ms.")
        return response, model
    except Exception as exc:
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        print(
            f"[Gemini][{operation}] failed: {model} in {round((time.perf_counter() - started_at) * 1000)}ms "
            f"(error={type(exc).__name__}, code={code or 'n/a'})."
        )
        raise


def _retryable_provider_error(exc: Exception) -> bool:
    if isinstance(exc, (TimeoutError, ConnectionError)):
        return True
    if "timeout" in type(exc).__name__.lower() or "connection" in type(exc).__name__.lower():
        return True

    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    try:
        if int(code) in {408, 429, 500, 502, 503, 504}:
            return True
    except (TypeError, ValueError):
        pass

    message = f"{code or ''} {exc}".upper()
    return any(marker in message for marker in (
        "408", "429", "500", "502", "503", "504",
        "RESOURCE_EXHAUSTED", "UNAVAILABLE", "DEADLINE_EXCEEDED",
        "INTERNAL SERVER ERROR", "SERVICE UNAVAILABLE", "TIMED OUT",
    ))


def generate_content_with_fallback(
    client,
    contents,
    config=None,
    *,
    validate: Optional[Callable] = None,
    operation: str = "unspecified",
):
    """Try primary first, then backup only for transient/quota or invalid output."""
    if client is None:
        raise RuntimeError("Gemini client is not configured")

    models = list(dict.fromkeys(model for model in (GEMINI_PRIMARY_MODEL, GEMINI_BACKUP_MODEL) if model))
    if not models:
        raise RuntimeError("No Gemini model is configured")

    for index, model in enumerate(models):
        attempt = "primary" if index == 0 else "backup"
        started_at = time.perf_counter()
        print(f"[Gemini][{operation}] {attempt} attempt started: {model}.")
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            if not (getattr(response, "text", None) or "").strip():
                raise InvalidModelOutputError("Gemini returned an empty response")
            if validate:
                validate(response)
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            print(f"[Gemini][{operation}] {attempt} attempt succeeded: {model} in {duration_ms}ms.")
            if index > 0:
                print(f"[Gemini] Backup model succeeded: {model}.")
            return response, model
        except Exception as exc:
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            print(
                f"[Gemini][{operation}] {attempt} attempt failed: {model} in {duration_ms}ms "
                f"(error={type(exc).__name__}, code={code or 'n/a'})."
            )
            if index == 0 and len(models) > 1 and (
                isinstance(exc, InvalidModelOutputError) or _retryable_provider_error(exc)
            ):
                print(f"[Gemini] Primary model {model} failed ({type(exc).__name__}); trying backup {models[1]}.")
                continue
            raise
