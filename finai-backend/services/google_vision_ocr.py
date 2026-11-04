"""Google Cloud Vision text detection using Application Default Credentials."""

import base64
from typing import List, Optional

import google.auth
from google.auth.transport.requests import AuthorizedSession


VISION_ANNOTATE_URL = "https://vision.googleapis.com/v1/images:annotate"
VISION_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


def extract_text_from_images(images: List[bytes], timeout_seconds: float = 20.0) -> Optional[str]:
    """Return OCR text for receipt images, authenticating with the runtime identity.

    Cloud Run's attached service account is discovered through ADC; no downloaded
    service-account key or client-side API key is needed.
    """
    if not images:
        return None

    credentials, _ = google.auth.default(scopes=[VISION_SCOPE])
    requests = [{
        "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
        "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
    } for image_bytes in images]
    with AuthorizedSession(credentials) as session:
        response = session.post(
            VISION_ANNOTATE_URL,
            json={"requests": requests},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()

    text_parts = []
    for result in payload.get("responses", []):
        if result.get("error"):
            message = result["error"].get("message", "Vision OCR request failed")
            raise RuntimeError(message[:240])
        full_text = (result.get("fullTextAnnotation") or {}).get("text", "").strip()
        if full_text:
            text_parts.append(full_text)
    return "\n".join(text_parts) or None
