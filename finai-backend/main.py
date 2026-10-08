from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form, Depends
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from passlib.context import CryptContext
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import random
import string
import os
import cv2
import numpy as np
import re
import easyocr
import json
import asyncio
from google import genai
from google.genai import types
from dotenv import load_dotenv
import uvicorn

# I-IMPORT ANG DB MULA SA DATABASE.PY
from database import db, ensure_indexes
from email_utils import send_otp_email

# JWT session creation for user and admin authentication.
from auth import create_access_token, get_current_user

# I-IMPORT ANG ROUTERS
from routers import budgets, categories, accounts, goal_types, goals, notifications,users,logs,advisor,export
from services.budget_service import create_crossed_threshold_notifications, ph_today

app = FastAPI(title="FinAi Backend", version="1.0")


# 0. Startup â€” ensure required DB indexes exist (e.g. the unique index on budgets that
# prevents duplicate user/category/period budgets from a double-tapped save). Wrapped in
# try/except so a startup-time issue (like leftover duplicate data from before the index
# existed) logs an error instead of blocking the entire app from booting.
@app.on_event("startup")
async def on_startup():
    try:
        await ensure_indexes()
        print("[Startup] Database indexes ready.")
    except Exception as e:
        print(f"[Startup] Could not create indexes (check for duplicate data): {e}")


# 1. Terminal Truth - Error Debugger
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    fields = {
        str(issue.get("loc", [])[-1])
        for issue in errors
        if issue.get("loc")
    }
    has_missing_fields = any(issue.get("type") == "missing" for issue in errors)
    has_invalid_email = any(
        issue.get("loc") and str(issue["loc"][-1]) == "email" and issue.get("type") != "missing"
        for issue in errors
    )
    if has_invalid_email:
        detail = "Enter a valid email address."
    elif "otp" in fields:
        detail = "Enter the verification code from your email."
    elif "pin" in fields:
        detail = "Enter a valid PIN."
    elif has_missing_fields:
        detail = "Complete all required fields and try again."
    else:
        detail = "Please check the information you entered and try again."

    print(f"[Validation] {request.method} {request.url.path} rejected invalid fields: {', '.join(sorted(fields)) or 'request'}.")
    return JSONResponse(
        status_code=422,
        content={"detail": detail},
    )


# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 3. Security, Gemini Client & Email Config
load_dotenv()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
try:
    # The Google GenAI SDK enforces a 10-second minimum HTTP timeout.
    GEMINI_OCR_TIMEOUT_SECONDS = max(10, min(20, float(os.getenv("GEMINI_OCR_TIMEOUT_SECONDS", "10"))))
except (TypeError, ValueError):
    GEMINI_OCR_TIMEOUT_SECONDS = 10.0

# A single SDK attempt plus a network timeout keeps quota retries from making
# the receipt endpoint wait much longer than its configured deadline.
ai_client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(
        timeout=int(GEMINI_OCR_TIMEOUT_SECONDS * 1000),
        retry_options=types.HttpRetryOptions(attempts=1),
    ),
) if GEMINI_API_KEY else None


# --- 4. EASYOCR INITIALIZATION ---
# EasyOCR remains available as an optional local utility, but the scan flow
# uses Gemini as its primary extractor and does not silently substitute OCR.
reader = None


# --- 5. EXPANDED LOCAL MERCHANT & ITEM MATCHING DICTIONARY ---
MERCHANT_CATEGORY_MAP = {
    "Food & Dining": [
        "jollibee", "mcdonalds", "mcdo", "chowking", "mang inasal", "kfc",
        "starbucks", "greenwich", "tokyo tokyo", "shakeys", "pizza hut",
        "bonchon", "burger king", "popeyes", "7-eleven", "uncle johns",
        "lugawan", "lugaw", "silog", "porksilog", "tapsilog", "chicksilog", "bangsilog",
        "karinderya", "eatery", "canteen", "bistro", "grill", "samgyupsal",
        "milktea", "coffee", "cafe", "bakery", "bakeshop", "kitchen", "diner", "resto", "eats"
    ],
    "Groceries": [
        "puregold", "sm supermarket", "savemore", "robinsons supermarket",
        "waltermart", "dali", "alfamart", "landers", "snr", "super8", "hypermarket",
        "mart", "grocery", "supermarket", "wholesaler", "convenience"
    ],
    "Shopping & Personal Care": [
        "watsons", "unql", "uniqlo", "bench", "penser", "cetaphil",
        "miniso", "mr.diy", "mr diy", "h&m", "department store", "boutique", "apparel"
    ],
    "Utilities & Bills": [
        "meralco", "maynilad", "manila water", "pldt", "globe", "smart", "dito", "electric", "water"
    ],
    "Transportation & Fuel": [
        "shell", "petron", "caltex", "seaoil", "cleanfuel", "grab", "angkas", "joyride", "gasoline", "expressway", "toll"
    ]
}

CODE_REJECTION_PATTERNS = [
    "git pull", "git push", "git commit", "uvicorn", "http://", "https://",
    "port 8000", "npm start", "expo start", "#backend", "#frontend",
    "import react", "const ", "function()", "localhost", "def ", "class "
]

# Mga salitang lagi kasama sa "TOTAL" line ng resibo (priority order, pinaka-mataas priority sa una)
TOTAL_KEYWORDS = ["grand total", "total amount due", "total amt due", "total due", "amount due", "total"]
SUBTOTAL_KEYWORDS = ["subtotal", "sub-total", "sub total", "vatable sale", "vat sales", "less discount"]

# Mga salitang hindi puwedeng maging "merchant name" (headers/noise lang ito)
MERCHANT_BLACKLIST_TOKENS = [
    "official receipt", "sales invoice", "invoice", "receipt", "resibo",
    "tin", "vat reg", "non-vat", "or#", "or no", "cashier", "thank you",
    "salamat", "date", "time", "qty", "particulars", "articles"
]

# FIX: FinAI is a Philippines-only app. datetime.now() reflects whatever timezone the
# SERVER's operating system is configured with -- almost always UTC on a cloud host, which
# is 8 hours behind Philippine time. Explicitly computing PH time here means date logic
# (e.g. "is this receipt date in the future") is correct regardless of server deployment,
# instead of only working by accident on a machine whose clock happens to be set to PH time.
PH_TZ = ZoneInfo("Asia/Manila")

MONTH_NAME_MAP = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def resize_image_if_needed(img_np: np.ndarray, max_dim: int = 1024) -> np.ndarray:
    """I-downscale ang sobrang laking image para mabilis ma-process ng OCR."""
    h, w = img_np.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(img_np, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return img_np


def enhance_image_for_ocr(img_np: np.ndarray) -> np.ndarray:
    """Contrast + sharpening pass para tumaas ang detection rate ng EasyOCR,
    lalo na sa maliliit na font tulad ng TOTAL line sa mahabang resibo."""
    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    contrasted = clahe.apply(gray)
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    sharpened = cv2.filter2D(contrasted, -1, sharpen_kernel)
    return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)


def _order_receipt_corners(points: np.ndarray) -> np.ndarray:
    """Return quadrilateral points as top-left, top-right, bottom-right, bottom-left."""
    corners = points.reshape(4, 2).astype("float32")
    ordered = np.zeros((4, 2), dtype="float32")
    sums = corners.sum(axis=1)
    diffs = np.diff(corners, axis=1).reshape(-1)
    ordered[0] = corners[np.argmin(sums)]
    ordered[2] = corners[np.argmax(sums)]
    ordered[1] = corners[np.argmin(diffs)]
    ordered[3] = corners[np.argmax(diffs)]
    return ordered


def detect_and_straighten_receipt(img_np: np.ndarray) -> tuple[np.ndarray, bool]:
    """Crop the largest paper-like quadrilateral; safely keep the original if uncertain."""
    height, width = img_np.shape[:2]
    image_area = height * width
    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:15]:
        area = cv2.contourArea(contour)
        if area < image_area * 0.18:
            break
        perimeter = cv2.arcLength(contour, True)
        quadrilateral = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(quadrilateral) != 4 or not cv2.isContourConvex(quadrilateral):
            continue

        top_left, top_right, bottom_right, bottom_left = _order_receipt_corners(quadrilateral)
        output_width = int(max(np.linalg.norm(bottom_right - bottom_left), np.linalg.norm(top_right - top_left)))
        output_height = int(max(np.linalg.norm(top_right - bottom_right), np.linalg.norm(top_left - bottom_left)))
        if output_width < 180 or output_height < 280:
            continue

        destination = np.array([[0, 0], [output_width - 1, 0], [output_width - 1, output_height - 1], [0, output_height - 1]], dtype="float32")
        transform = cv2.getPerspectiveTransform(np.array([top_left, top_right, bottom_right, bottom_left]), destination)
        return cv2.warpPerspective(img_np, transform, (output_width, output_height)), True

    return img_np, False


def _try_parse_date_parts(v1: int, v2: int, v3: int, current_year: int, today: Optional[datetime] = None):
    """Subukan lahat ng posibleng pagkakaayos (YMD, MDY, DMY) at tignan alin
    ang valid na buwan/araw/taon. Returns (year, month, day) o None.

    STANDARD DATE-DISAMBIGUATION RULES (applied when a numeric date like
    09/12/2025 is genuinely ambiguous between MM/DD and DD/MM):
      1. A receipt can never be legitimately dated in the future relative to
         `today` -> future-dated readings are rejected outright, not just
         deprioritized.
      2. When more than one ordering (e.g. both MDY and DMY) produces a real
         calendar date, prefer whichever one is NOT in the future instead of
         always defaulting to MDY.
      3. If both orderings land in the past (still ambiguous), fall back to
         the first valid candidate in priority order (MDY before DMY) as a
         documented, consistent default rather than an accidental one.
    """
    candidates = []

    if v1 > 1000:  # v1 = year
        candidates.append((v1, v2, v3))  # YMD
        candidates.append((v1, v3, v2))  # YDM
    elif v3 > 1000:  # v3 = year
        candidates.append((v3, v1, v2))  # MDY
        candidates.append((v3, v2, v1))  # DMY
    elif v3 < 100:  # 2-digit year sa dulo
        year = 2000 + v3
        candidates.append((year, v1, v2))  # MDY
        candidates.append((year, v2, v1))  # DMY
    elif v1 < 100:  # 2-digit year sa una
        year = 2000 + v1
        candidates.append((year, v2, v3))  # YMD

    valid_candidates = []
    for year, month, day in candidates:
        # Rule 1: never accept a year beyond the current year. A purchase
        # receipt cannot be dated next year, so the old "current_year + 1"
        # leniency is what let future-dated misreads slip through.
        if 2000 <= year <= current_year:
            try:
                parsed = datetime(year, month, day)  # Reject impossible dates such as February 31.
                valid_candidates.append((year, month, day, parsed))
            except ValueError:
                continue

    if not valid_candidates:
        return None

    # Rule 2: prefer the non-future interpretation when ambiguous.
    reference = today or datetime.now()
    non_future = [c for c in valid_candidates if c[3].date() <= reference.date()]
    if non_future:
        year, month, day, _ = non_future[0]
        return year, month, day

    # Rule 3: consistent, documented fallback (first candidate in priority order).
    year, month, day, _ = valid_candidates[0]
    return year, month, day


def sanitize_and_parse_date(extracted_texts: List[str], allow_missing_year: bool = False) -> Optional[str]:
    """I-validate ang month, day, at year para maiwasan ang maling petsa.
    By default, incomplete dates stay unknown instead of receiving today's year."""
    date_pattern = r"\b(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})\b"
    month_day_pattern = r"\b(\d{1,2})[-/.](\d{1,2})\b"
    month_name_pattern = r"\b(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{1,2}),?\s+(\d{2,4})\b"
    month_day_without_year_pattern = r"\b(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{1,2})\b"
    month_day_year_pattern = r"\b(\d{1,2})\s+(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{2,4})\b"
    today = datetime.now(PH_TZ)
    current_year = today.year

    search_pool = [text.strip() for text in extracted_texts if text and text.strip()]
    search_pool.append(" ".join(search_pool))

    for text in search_pool:
        low = text.lower()

        # 1) Numeric date pattern (MM/DD/YYYY, DD-MM-YYYY, etc.)
        for p1, p2, p3 in re.findall(date_pattern, text):
            try:
                v1, v2, v3 = int(p1), int(p2), int(p3)
            except ValueError:
                continue
            result = _try_parse_date_parts(v1, v2, v3, current_year, today=today)
            if result:
                year, month, day = result
                return f"{year:04d}-{month:02d}-{day:02d}"

        # Do not silently assign the current year to an incomplete date.
        if allow_missing_year:
            for p1, p2 in re.findall(month_day_pattern, text):
                try:
                    left, right = int(p1), int(p2)
                except ValueError:
                    continue
                for month, day in ((left, right), (right, left)):
                    try:
                        return datetime(current_year, month, day).strftime("%Y-%m-%d")
                    except ValueError:
                        continue

        # 3) Month-name pattern with year (e.g. "March 14, 2018")
        for month_str, day_str, year_str in re.findall(month_name_pattern, low):
            month = MONTH_NAME_MAP.get(month_str)
            try:
                day = int(day_str)
                year = int(year_str)
                if year < 100:
                    year += 2000
            except ValueError:
                continue
            if month and 2000 <= year <= (current_year + 1):
                try:
                    return datetime(year, month, day).strftime("%Y-%m-%d")
                except ValueError:
                    continue

        if allow_missing_year:
            for month_str, day_str in re.findall(month_day_without_year_pattern, low):
                month = MONTH_NAME_MAP.get(month_str)
                try:
                    day = int(day_str)
                except ValueError:
                    continue
                if month:
                    try:
                        return datetime(current_year, month, day).strftime("%Y-%m-%d")
                    except ValueError:
                        continue

        # 5) Day-month-year pattern (e.g. "14 March 2018")
        for day_str, month_str, year_str in re.findall(month_day_year_pattern, low):
            month = MONTH_NAME_MAP.get(month_str)
            try:
                day = int(day_str)
                year = int(year_str)
                if year < 100:
                    year += 2000
            except ValueError:
                continue
            if month and 2000 <= year <= (current_year + 1):
                try:
                    return datetime(year, month, day).strftime("%Y-%m-%d")
                except ValueError:
                    continue

        if allow_missing_year:
            for day_str, month_str in re.findall(r"\b(\d{1,2})\s+(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\b", low):
                month = MONTH_NAME_MAP.get(month_str)
                try:
                    day = int(day_str)
                except ValueError:
                    continue
                if month:
                    try:
                        return datetime(current_year, month, day).strftime("%Y-%m-%d")
                    except ValueError:
                        continue

    return None


def _extract_amount_candidates(text: str) -> List[float]:
    """Extract amount-like values, including split formats like '689 75' -> 689.75."""
    money_pattern = r"(?:PHP|P|â‚±)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2})?)"
    values: List[float] = []

    for n in re.findall(money_pattern, text):
        try:
            val = float(n.replace(",", ""))
        except ValueError:
            continue
        if 1.0 <= val <= 500000.0:
            values.append(val)

    for match in re.finditer(r"(?<!\d)(\d{1,3}(?:,\d{3})?|\d+)\s+(\d{1,2})(?!\d)", text):
        try:
            whole = float(match.group(1).replace(",", ""))
            cents = float(match.group(2))
        except ValueError:
            continue
        if 1.0 <= whole <= 500000.0 and 0 <= cents <= 99:
            values.append(whole + cents / 100.0)

    return values


def extract_total_amount(all_extracted_texts: List[str]) -> Optional[float]:
    """Extract an amount tied to a total label; unknown is safer than a largest-number guess."""
    money_pattern = r"(?:PHP|P|Ã¢â€šÂ±)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2})?)"
    best_candidate: Optional[tuple[int, float]] = None

    for index, text in enumerate(all_extracted_texts):
        low = text.lower().strip()
        if not low or any(keyword in low for keyword in SUBTOTAL_KEYWORDS):
            continue
        keyword = next((item for item in TOTAL_KEYWORDS if item in low), None)
        if not keyword or "change" in low or "cash tendered" in low:
            continue

        keyword_end = low.rfind(keyword) + len(keyword)
        matches = []
        for match in re.finditer(money_pattern, text, re.I):
            try:
                value = float(match.group(1).replace(",", ""))
            except ValueError:
                continue
            if 1.0 <= value <= 500000.0:
                matches.append((match.start(), value))

        # Receipts normally place the final amount immediately after the total label.
        after_label = [(position, value) for position, value in matches if position >= keyword_end]
        if after_label:
            position, value = min(after_label, key=lambda item: item[0] - keyword_end)
        elif matches:
            position, value = min(matches, key=lambda item: abs(item[0] - keyword_end))
        else:
            # OCR can put the amount on the next line. Only examine that single line.
            if index + 1 >= len(all_extracted_texts):
                continue
            next_low = all_extracted_texts[index + 1].lower()
            if any(noise in next_low for noise in ("cash", "change", "vat", "tax", "subtotal")):
                continue
            next_values = _extract_amount_candidates(all_extracted_texts[index + 1])
            if len(next_values) != 1:
                continue
            position, value = 0, next_values[0]

        score = 200 if keyword in ("grand total", "total amount due", "total amt due", "total due", "amount due") else 140
        if "payable" in low:
            score += 20
        if "vat" in low or "tax" in low:
            score -= 80
        score -= min(abs(position - keyword_end), 60)
        if best_candidate is None or score > best_candidate[0]:
            best_candidate = (score, value)

    return best_candidate[1] if best_candidate else None


def pick_merchant_line(candidate_lines: List[str]):
    """Piliin ang pinaka-malamang na business name mula sa unang ilang linya,
    sa halip na basta index[0]. Returns (merchant_text, is_fallback_guess)."""
    scored_candidates = []
    generic_tokens = ["store", "mart", "cafe", "restaurant", "coffee", "bakery", "pharmacy", "hardware", "lumber", "gas", "supermarket", "grill", "shop"]

    for idx, line in enumerate(candidate_lines[:10]):
        clean = line.strip()
        low = clean.lower()
        if not clean:
            continue
        if any(tok in low for tok in MERCHANT_BLACKLIST_TOKENS):
            continue

        alpha_chars = sum(c.isalpha() for c in clean)
        if alpha_chars < 3:
            continue

        score = 0
        if idx < 3:
            score += 30
        elif idx < 6:
            score += 10

        if len(clean.split()) <= 5:
            score += 10
        if not re.search(r"\d", clean):
            score += 5
        if len(clean) <= 60:
            score += 4
        if any(token in low for token in generic_tokens):
            score += 2

        if low in generic_tokens or low.endswith(tuple(generic_tokens)):
            score -= 12

        scored_candidates.append((score, clean))

    if scored_candidates:
        scored_candidates.sort(reverse=True)
        return scored_candidates[0][1], False

    return (candidate_lines[0] if candidate_lines else "Store Receipt"), True


def normalize_amount_value(raw_value) -> Optional[float]:
    """Normalize raw OCR/Gemini amount values into a float when possible."""
    if raw_value is None:
        return None
    if isinstance(raw_value, (int, float)):
        try:
            amount = float(raw_value)
            return amount if 1.0 <= amount <= 500000.0 else None
        except Exception:
            return None

    text = str(raw_value).strip()
    if not text:
        return None

    cleaned = text.replace("PHP", "").replace("â‚±", "").replace(",", "").strip()
    match = re.search(r"(\d+(?:\.\d{1,2})?)", cleaned)
    if not match:
        return None

    try:
        amount = float(match.group(1))
        return amount if 1.0 <= amount <= 500000.0 else None
    except Exception:
        return None


def _score_receipt_candidate(result: dict, raw_text: str) -> int:
    """Give a simple reliability score to candidate OCR results."""
    if not result:
        return 0

    score = 0
    amount = normalize_amount_value(result.get("amount"))
    if amount is not None and not result.get("amount_is_fallback", False):
        score += 80
    elif amount is not None:
        score += 20

    merchant = str(result.get("merchant", "")).strip()
    merchant_is_fallback = result.get("merchant_is_fallback", False)
    if merchant and merchant.lower() not in {"store receipt", "receipt", "store"} and not merchant_is_fallback:
        score += 40

    date_value = str(result.get("date", "")).strip()
    date_is_fallback = result.get("date_is_fallback", False)
    if date_value and not date_is_fallback:
        score += 20

    if len(raw_text) > 20:
        score += 10

    return score


def select_best_receipt_result(local_result: Optional[dict], gemini_result: Optional[dict], raw_text: str):
    """Prefer EasyOCR by default, but use Gemini as a fallback when the local OCR result is weak or fallback-like."""
    local_amount = normalize_amount_value(local_result.get("amount")) if local_result else None
    gemini_amount = normalize_amount_value(gemini_result.get("amount")) if gemini_result else None

    local_is_fallback = bool(local_result and local_result.get("amount_is_fallback", False))
    gemini_is_fallback = bool(gemini_result and gemini_result.get("amount_is_fallback", False))
    local_date = str(local_result.get("date", "")).strip() if local_result else ""
    gemini_date = str(gemini_result.get("date", "")).strip() if gemini_result else ""
    local_date_is_fallback = bool(local_result and local_result.get("date_is_fallback", False))
    gemini_date_is_fallback = bool(gemini_result and gemini_result.get("date_is_fallback", False))

    if gemini_result and gemini_amount is not None and not gemini_is_fallback:
        if not local_result or local_amount is None or local_is_fallback:
            return gemini_result, "Gemini"

        local_has_cents = local_amount is not None and abs(local_amount - round(local_amount)) > 1e-9
        gemini_has_cents = gemini_amount is not None and abs(gemini_amount - round(gemini_amount)) > 1e-9
        if not local_has_cents and gemini_has_cents:
            return gemini_result, "Gemini"

        if local_date_is_fallback and not gemini_date_is_fallback and gemini_date:
            return gemini_result, "Gemini"

    candidates = []
    if local_result:
        candidates.append(("EasyOCR", local_result, _score_receipt_candidate(local_result, raw_text)))
    if gemini_result:
        candidates.append(("Gemini", gemini_result, _score_receipt_candidate(gemini_result, raw_text)))

    if not candidates:
        return None, "None"

    best_engine, best_result, best_score = max(candidates, key=lambda item: item[2])
    if best_score <= 0:
        return None, "None"

    return best_result, best_engine


def _known_text(value) -> Optional[str]:
    text = str(value or "").strip()
    return None if text.lower() in {"", "store", "receipt", "store receipt", "none", "null"} else text


def _same_merchant(left: Optional[str], right: Optional[str]) -> bool:
    if not left or not right:
        return False
    clean = lambda value: re.sub(r"[^a-z0-9]", "", value.lower())
    left_clean, right_clean = clean(left), clean(right)
    return left_clean == right_clean or left_clean in right_clean or right_clean in left_clean


def resolve_supported_category(candidate: Optional[str], available_categories: Optional[List[str]]) -> str:
    """Return the stored category spelling, or General when no allowed match exists."""
    candidate = _known_text(candidate)
    if not candidate:
        return "General"
    if not available_categories:
        return candidate
    candidate_lower = candidate.lower()
    for category in available_categories:
        if category.lower() == candidate_lower:
            return category
    normalized_candidate = re.sub(r"[^a-z]", "", candidate_lower)
    category_aliases = {
        "foodanddining": ("food", "dining", "restaurant"), "groceries": ("grocery", "groceries"),
        "shoppingandpersonalcare": ("shopping", "personalcare"), "utilitiesandbills": ("utilities", "bills"),
        "transportationandfuel": ("transport", "transpo", "fuel"),
    }
    aliases = category_aliases.get(normalized_candidate, ())
    for category in available_categories:
        normalized_category = re.sub(r"[^a-z]", "", category.lower())
        if normalized_category in aliases or any(alias in normalized_category for alias in aliases):
            return category
    return "General"


def reconcile_receipt_fields(local_result: Optional[dict], gemini_result: Optional[dict], available_categories: Optional[List[str]] = None) -> dict:
    """Reconcile each field independently; disagreement is a review state, never a silent guess."""
    local_result, gemini_result = local_result or {}, gemini_result or {}
    fields = {}

    local_amount = normalize_amount_value(local_result.get("amount"))
    gemini_amount = normalize_amount_value(gemini_result.get("amount"))
    if local_amount is not None and gemini_amount is not None and abs(local_amount - gemini_amount) < 0.01:
        fields["amount"] = {"value": f"{gemini_amount:.2f}", "status": "confirmed", "engines": ["EasyOCR", "Gemini"]}
    elif gemini_amount is not None and local_amount is not None:
        # Gemini interprets receipt semantics (for example, "Total Amt Due"),
        # while EasyOCR can mistake an item price for the total. Keep Gemini's
        # value visible, but require the user to confirm the disagreement.
        print(f"[Reconcile] Amount conflict: EasyOCR={local_amount:.2f}, Gemini={gemini_amount:.2f}. Suggesting Gemini value for review.")
        fields["amount"] = {
            "value": f"{gemini_amount:.2f}",
            "status": "needs_review",
            "engines": ["EasyOCR", "Gemini"],
            "reason": "EasyOCR and Gemini found different amounts; Gemini's receipt-total interpretation is suggested."
        }
    elif gemini_amount is not None and local_amount is None:
        fields["amount"] = {"value": f"{gemini_amount:.2f}", "status": "needs_review", "engines": ["Gemini"]}
    elif local_amount is not None and gemini_amount is None:
        fields["amount"] = {"value": f"{local_amount:.2f}", "status": "needs_review", "engines": ["EasyOCR"]}
    else:
        fields["amount"] = {"value": None, "status": "needs_review", "engines": []}

    local_merchant = _known_text(local_result.get("merchant"))
    gemini_merchant = _known_text(gemini_result.get("merchant"))
    if _same_merchant(local_merchant, gemini_merchant):
        fields["merchant"] = {"value": gemini_merchant, "status": "confirmed", "engines": ["EasyOCR", "Gemini"]}
    elif gemini_merchant and not local_merchant:
        fields["merchant"] = {"value": gemini_merchant, "status": "needs_review", "engines": ["Gemini"]}
    elif local_merchant and not gemini_merchant:
        fields["merchant"] = {"value": local_merchant, "status": "needs_review", "engines": ["EasyOCR"]}
    else:
        fields["merchant"] = {"value": None, "status": "needs_review", "engines": []}

    local_date = local_result.get("date")
    gemini_date = gemini_result.get("date")
    if local_date and gemini_date and local_date == gemini_date:
        fields["date"] = {"value": gemini_date, "status": "confirmed", "engines": ["EasyOCR", "Gemini"]}
    elif gemini_date and not local_date:
        fields["date"] = {"value": gemini_date, "status": "needs_review", "engines": ["Gemini"]}
    elif local_date and not gemini_date:
        fields["date"] = {"value": local_date, "status": "needs_review", "engines": ["EasyOCR"]}
    else:
        fields["date"] = {"value": None, "status": "needs_review", "engines": []}

    category = resolve_supported_category(gemini_result.get("category") or local_result.get("category"), available_categories)
    fields["category"] = {"value": category,
                          "status": "suggested", "engines": ["Gemini"] if gemini_result else ["EasyOCR"]}

    needs_review = [name for name, field in fields.items() if field["status"] == "needs_review"]
    return {
        # Flat fields retain compatibility with the existing mobile client.
        "amount": fields["amount"]["value"],
        "merchant": fields["merchant"]["value"],
        "date": fields["date"]["value"],
        "category": fields["category"]["value"],
        "fields": fields,
        "needs_review": needs_review,
        "engine_summary": {"easyocr": bool(local_result), "gemini": bool(gemini_result)}
    }


def match_merchant_and_category(full_text: str, candidate_lines: List[str], available_categories: List[str] = None):
    """Rule-based keyword matching algorithm para sa Merchant at Category.
    Returns (merchant, category, merchant_is_fallback)."""
    text_lower = full_text.lower()

    # A merchant logo/header appears near the top of the receipt. Prefer a
    # known store found there over generic item words such as "cafe" or "mart"
    # that may appear much later in the purchase list.
    generic_keywords = {"mart", "cafe", "coffee", "bakery", "grill", "shop", "store", "restaurant", "gas", "supermarket"}
    for line in candidate_lines[:12]:
        line_lower = line.lower()
        for category_name, keywords in MERCHANT_CATEGORY_MAP.items():
            for kw in keywords:
                if kw in generic_keywords or kw not in line_lower:
                    continue
                matched_store = kw.title()
                if kw in ["mcdo", "mcdonalds"]:
                    matched_store = "McDonald's"
                elif kw == "7-eleven":
                    matched_store = "7-Eleven"
                elif kw in ["mr.diy", "mr diy"]:
                    matched_store = "MR.DIY"
                elif kw == "snr":
                    matched_store = "S&R Membership Shopping"
                final_category = resolve_supported_category(category_name, available_categories)
                return matched_store, final_category, False

    if available_categories:
        for user_cat in available_categories:
            if user_cat.lower() in text_lower:
                fallback_merchant, is_fallback = pick_merchant_line(candidate_lines)
                return fallback_merchant, user_cat, is_fallback

    for category_name, keywords in MERCHANT_CATEGORY_MAP.items():
        for kw in keywords:
            if kw in generic_keywords or kw not in text_lower:
                continue
            if kw in text_lower:
                matched_store = kw.title()
                if kw in ["mcdo", "mcdonalds"]:
                    matched_store = "McDonald's"
                elif kw == "7-eleven":
                    matched_store = "7-Eleven"
                elif kw in ["mr.diy", "mr diy"]:
                    matched_store = "MR.DIY"
                elif kw == "snr":
                    matched_store = "S&R Membership Shopping"

                final_category = resolve_supported_category(category_name, available_categories)

                return matched_store, final_category, False

    fallback_cat = "General"
    fallback_merchant, is_fallback = pick_merchant_line(candidate_lines)
    return fallback_merchant, fallback_cat, is_fallback


def _sort_easyocr_results_into_lines(results) -> List[str]:
    """Keep OCR reading order. EasyOCR's return order is not reliable enough for receipts."""
    positioned = []
    for box, text, confidence in results:
        if not text or confidence < 0.20:
            continue
        top = min(point[1] for point in box)
        left = min(point[0] for point in box)
        height = max(point[1] for point in box) - top
        positioned.append((top, left, max(height, 12), text.strip()))

    positioned.sort(key=lambda item: (item[0], item[1]))
    lines = []
    for top, left, height, text in positioned:
        if lines and abs(top - lines[-1]["top"]) <= max(height, lines[-1]["height"]) * 0.65:
            lines[-1]["parts"].append((left, text))
        else:
            lines.append({"top": top, "height": height, "parts": [(left, text)]})
    return [" ".join(text for _, text in sorted(line["parts"])) for line in lines]


def process_multi_photo_easyocr(images_bytes_list: List[bytes], user_categories: List[str]):
    """Run EasyOCR as a layout-aware verifier, not an unstructured text source."""
    global reader
    if reader is None:
        reader = easyocr.Reader(["en"], gpu=False)
    all_extracted_texts = []

    for img_bytes in images_bytes_list:
        try:
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            resized = resize_image_if_needed(img, max_dim=1400)

            if reader is None:
                continue

            # Use one coherent reading order. The enhanced pass is only used
            # when the original image has too little readable text, preventing
            # duplicate tokens from corrupting total/date parsing.
            results = reader.readtext(resized)
            texts = _sort_easyocr_results_into_lines(results)
            if len(" ".join(texts)) < 20:
                results = reader.readtext(enhance_image_for_ocr(resized))
                texts = _sort_easyocr_results_into_lines(results)
            all_extracted_texts.extend(texts)
        except Exception as e:
            print(f"EasyOCR image failed: {e}")

    if not all_extracted_texts:
        return {
            "amount": None,
            "merchant": None,
            "category": "General",
            "date": None,
            "raw_text": "",
            "amount_is_fallback": True,
            "merchant_is_fallback": True,
            "date_is_fallback": True,
            "is_handwritten_likely": False
        }

    full_text_block = " ".join(all_extracted_texts).lower()

    # Code rejection guardrail
    is_code = any(pattern in full_text_block for pattern in CODE_REJECTION_PATTERNS)
    if is_code:
        raise HTTPException(status_code=400, detail="This receipt is not valid. A barcode or QR code was detected instead of receipt details.")

    total_amount_value = extract_total_amount(all_extracted_texts)
    detected_amount = f"{total_amount_value:.2f}" if total_amount_value is not None else None

    detected_merchant, matched_category, merchant_is_fallback = match_merchant_and_category(
        full_text_block, all_extracted_texts, user_categories
    )

    raw_date_found = sanitize_and_parse_date(all_extracted_texts)
    detected_date = raw_date_found
    date_is_fallback = raw_date_found is None

    return {
        "amount": detected_amount,
        "merchant": detected_merchant,
        "category": matched_category,
        "date": detected_date,
        "raw_text": full_text_block,
        "amount_is_fallback": total_amount_value is None or total_amount_value <= 0.0,
        "merchant_is_fallback": merchant_is_fallback,
        "date_is_fallback": date_is_fallback,
        "is_handwritten_likely": False
    }


def gemini_extract_receipt(images_bytes_list: List[bytes], available_categories: List[str]) -> dict:
    """Vision extractor. Fields it cannot visibly read must remain null."""
    print("[OCR] Running Gemini 3.6 Flash vision extraction.")

    if not ai_client:
        raise Exception("Gemini Client is not configured. Check GEMINI_API_KEY environment variable.")

    allowed_categories = list(dict.fromkeys((available_categories or []) + ["General"]))
    categories_str = ", ".join(allowed_categories)

    prompt = f"""
    You are an expert financial receipt scanner for Philippine receipts, including handwritten ones.
    Read the image(s) carefully and extract the most likely transaction fields.
    Rules:
    1. "amount": Return the FINAL TOTAL AMOUNT DUE / GRAND TOTAL only. Ignore subtotals, VAT, discounts, unit prices, and change.
    2. "merchant": Return the business/store name only when visibly readable; otherwise null.
    3. "date": Return YYYY-MM-DD only when visibly readable. Do not use today's date and do not invent a year; otherwise null.
    4. "category": Choose EXACTLY one category from this allowed list: {categories_str}. If no listed category is supported, return "General".
    5. Never guess a value. Return null for an unreadable amount, merchant, or date.

    Output ONLY a valid JSON object with this shape:
    {{"amount": 5895.00, "merchant": "New Lite Lumber and Construction Supply", "date": "2018-03-14", "category": "Supplies"}}
    """

    contents_payload = [prompt]
    for img_bytes in images_bytes_list:
        contents_payload.append(types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"))

    response = ai_client.models.generate_content(
        model="gemini-3.6-flash",
        contents=contents_payload,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )

    raw_response = response.text.strip()
    raw_response = re.sub(r"```json\s*|\s*```", "", raw_response)
    try:
        match = re.search(r"\{.*\}", raw_response, re.S)
        if match:
            raw_response = match.group(0)
        data = json.loads(raw_response)
    except Exception as parse_error:
        print(f"[Gemini] Response JSON was invalid: {parse_error}")
        data = {}

    raw_date = str(data.get("date") or "")
    sanitized_date = sanitize_and_parse_date([raw_date]) if raw_date else None

    amount_value = normalize_amount_value(data.get("amount"))
    formatted_amount = f"{amount_value:.2f}" if amount_value is not None else None

    merchant_value = str(data.get("merchant") or "").strip() or None
    category_value = str(data.get("category", "General")).strip() or "General"

    return {
        "amount": formatted_amount,
        "merchant": merchant_value,
        "category": category_value,
        "date": sanitized_date,
        "raw_text": f"Parsed via Gemini 3.6 Flash ({len(images_bytes_list)} image frame(s))",
        "amount_is_fallback": amount_value is None,
        "merchant_is_fallback": merchant_value is None,
        "date_is_fallback": sanitized_date is None
    }


# --- 6. MODELS ---
class UserSignup(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="User's first and last name")
    email: EmailStr
    password: str = Field(..., min_length=10, description="Password must be at least 10 characters")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class OTPVerify(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)


class TransactionSchema(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0, allow_inf_nan=False)
    category: str
    title: Optional[str] = None
    item_name: Optional[str] = None
    note: Optional[str] = None
    type: str = Field(...)
    account: str
    account_id: Optional[str] = None
    to_account: Optional[str] = None
    to_account_id: Optional[str] = None
    category_id: Optional[str] = None
    date: Optional[str] = None
    goal_id: Optional[str] = None


class InitialSetupSchema(BaseModel):
    user_id: str
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    monthly_income: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    target_name: Optional[str] = Field(default=None, max_length=100)
    target_amount: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    target_date: Optional[str] = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    goal_type_id: Optional[str] = Field(default=None, min_length=24, max_length=24, pattern=r'^[0-9a-fA-F]{24}$')


class PinVerify(BaseModel):
    email: EmailStr
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


# --- 7. HELPER FUNCTIONS ---
def validate_transaction_for_storage(transaction: TransactionSchema):
    transaction.type = transaction.type.strip().title()
    transaction.account = transaction.account.strip()
    transaction.to_account = transaction.to_account.strip() if transaction.to_account else None

    if transaction.type not in {"Income", "Expense", "Transfer", "Contribution"}:
        raise HTTPException(status_code=422, detail="Invalid transaction type.")
    if not transaction.account:
        raise HTTPException(status_code=422, detail="A source payment account is required.")
    if transaction.type == "Transfer":
        if not transaction.to_account:
            raise HTTPException(status_code=422, detail="A destination payment account is required for a transfer.")
        if transaction.account == transaction.to_account:
            raise HTTPException(status_code=422, detail="Transfer source and destination accounts must be different.")
        transaction.category = "Transfer"
    elif transaction.type == "Contribution":
        if not transaction.goal_id:
            raise HTTPException(status_code=422, detail="A goal is required for a contribution.")
        transaction.category = "Goal Contribution"
        transaction.to_account = None
    else:
        transaction.to_account = None

    # FIX: two.tsx already blocks a future-dated transaction client-side, but nothing
    # previously enforced this server-side -- a direct API call had no safeguard at all.
    # Compared against PH time (not server local time) for the same reason as the OCR fix.
    if transaction.date:
        try:
            parsed_date = datetime.strptime(transaction.date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
        if parsed_date > datetime.now(PH_TZ).date():
            raise HTTPException(status_code=422, detail="Transaction date cannot be in the future.")


async def validate_transaction_references(transaction: TransactionSchema, user_id: str):
    """Resolve labels to this user's active records and persist their stable IDs."""
    for field in ("account", "to_account"):
        requested = getattr(transaction, field)
        if not requested:
            setattr(transaction, "account_id" if field == "account" else "to_account_id", None)
            continue
        account = await db.accounts.find_one({
            "is_archived": {"$ne": True}, "account_role": "user", "user_id": user_id,
            "name": {"$regex": f"^{re.escape(requested)}$", "$options": "i"},
        })
        if not account:
            account = await db.accounts.find_one({
                "is_archived": {"$ne": True}, "account_role": "admin",
                "name": {"$regex": f"^{re.escape(requested)}$", "$options": "i"},
            })
        if not account:
            raise HTTPException(status_code=422, detail=f"Choose an active {field.replace('_', ' ')} available to this user.")
        setattr(transaction, field, account["name"])
        setattr(transaction, "account_id" if field == "account" else "to_account_id", str(account["_id"]))

    if transaction.type in {"Transfer", "Contribution"}:
        transaction.category_id = None
        return
    expected_type = transaction.type.lower()
    category_match = {
        "is_archived": {"$ne": True},
        "type": {"$regex": f"^{expected_type}$", "$options": "i"},
        "name": {"$regex": f"^{re.escape(transaction.category.strip())}$", "$options": "i"},
    }
    category = await db.categories.find_one({**category_match, "category_role": "user", "user_id": user_id})
    if not category:
        category = await db.categories.find_one({**category_match, "category_role": "admin"})
    if not category:
        raise HTTPException(status_code=422, detail=f"Choose an active {expected_type} category available to this user.")
    transaction.category = category["name"]
    transaction.category_id = str(category["_id"])


async def safely_refresh_budget_notifications(user_id: str) -> list:
    """Keep a committed money transaction successful if alert delivery has a temporary failure."""
    try:
        return await create_crossed_threshold_notifications(user_id)
    except Exception as exc:
        print(f"Could not refresh budget notifications for user {user_id}: {exc}")
        return []


# --- 8. AUTH ENDPOINTS ---
@app.post("/register")
async def register(user: UserSignup):
    clean_email = user.email.lower().strip()
    password = user.password
    if len(password.encode('utf-8')) > 72:
        raise HTTPException(status_code=400, detail="Password must be no more than 72 bytes.")
    if not (re.search(r"[a-z]", password) and re.search(r"[A-Z]", password) and re.search(r"\d", password)):
        raise HTTPException(status_code=400, detail="Use uppercase and lowercase letters and at least one number in your password.")
    existing_user = await db.users.find_one({"email": clean_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="This email address is already registered.")

    otp_code = "".join(random.choices(string.digits, k=6))
    if send_otp_email(clean_email, otp_code):
        hashed_password = pwd_context.hash(password)
        # FIX: OTPs previously lived in a plain in-memory dict (otp_storage = {}).
        # That means: (1) every pending registration is lost if the server restarts,
        # and (2) if this ever runs with more than one worker process, a /register
        # request and its matching /verify-otp request can land on different workers
        # -- each with its own separate dict -- causing verification to fail even with
        # the correct code. Storing in MongoDB (with a TTL index, see database.py)
        # makes this correct regardless of server restarts or worker count.
        await db.pending_signups.update_one(
            {"email": clean_email},
            {"$set": {
                "name": user.name.strip(),
                "password": hashed_password,
                "otp": otp_code,
                "timestamp": datetime.utcnow()
            }},
            upsert=True
        )
        return {"status": "Success", "message": "OTP sent successfully!"}
    raise HTTPException(status_code=500, detail="Failed to send OTP email.")


@app.post("/verify-otp")
async def verify_otp(data: OTPVerify):
    clean_email = data.email.lower().strip()
    user_otp = data.otp.strip()

    pending = await db.pending_signups.find_one({"email": clean_email})
    if not pending:
        raise HTTPException(status_code=400, detail="No pending registration was found, or it has expired.")

    if datetime.utcnow() - pending["timestamp"] > timedelta(minutes=10):
        await db.pending_signups.delete_one({"email": clean_email})
        raise HTTPException(status_code=400, detail="This verification code has expired. Please register again.")

    if pending["otp"] == user_otp:
        new_user = {
            "name": pending["name"],
            "email": clean_email,
            "password": pending["password"],
            "role": "user",
            "onboarding_completed": False,
            "created_at": datetime.utcnow()
        }
        result = await db.users.insert_one(new_user)
        await db.pending_signups.delete_one({"email": clean_email})
        return {"status": "Success", "user_id": str(result.inserted_id), "name": new_user["name"], "role": "user", "token": create_access_token(str(result.inserted_id), "user")}

    raise HTTPException(status_code=400, detail="The verification code is incorrect.")


@app.post("/login")
async def login(user: UserLogin):
    clean_email = user.email.lower().strip()
    db_user = await db.users.find_one({"email": clean_email})

    if not db_user:
        raise HTTPException(status_code=400, detail="The email or password is incorrect.")

    # ðŸ‘‡ Inayos natin ang spacing dito para pumantay sa taas
    password_to_verify = user.password[:72]

    try:
        password_is_valid = pwd_context.verify(password_to_verify, db_user["password"])
    except Exception as e:
        print(f"Bcrypt verification error: {e}")
        raise HTTPException(status_code=500, detail="Unable to verify the password. Please try again.")
    if not password_is_valid:
        raise HTTPException(status_code=400, detail="The email or password is incorrect.")

    if db_user.get("is_archived"):
        raise HTTPException(status_code=403, detail="This account has been archived. Please contact an administrator.")

    # CHANGED: builds the response dict first, then conditionally adds a JWT token
    # (see auth.py) only when the user is an admin. Every field that was here before
    # is still here, unchanged.
    response_data = {
        "status": "Success",
        "user_id": str(db_user["_id"]),
        "name": db_user["name"],
        "email": db_user["email"],
        "role": db_user.get("role", "user"),
        "onboarding_completed": db_user.get("onboarding_completed", False),
        "has_pin": bool(db_user.get("pin"))
    }

    response_data["token"] = create_access_token(user_id=str(db_user["_id"]), role=db_user.get("role", "user"))

    return response_data


@app.post("/verify-pin")
async def verify_pin(data: PinVerify):
    clean_email = data.email.lower().strip()
    input_pin = data.pin.strip()

    user = await db.users.find_one({"email": clean_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stored_pin = str(user.get("pin", ""))

    # FIX: PINs were previously stored and compared in plaintext -- unlike passwords,
    # which already correctly use pwd_context (bcrypt). Anyone with direct database read
    # access would see every user's PIN in cleartext. New PINs are hashed at
    # /initial-setup; this verifies against that hash. The plaintext fallback below only
    # matters for PINs saved before this fix -- it upgrades them to a hash transparently
    # on first successful verification so no user has to re-enter their PIN.
    try:
        if pwd_context.verify(input_pin, stored_pin):
            return {"status": "Success"}
    except Exception:
        # stored_pin isn't a valid hash -- almost certainly a legacy plaintext PIN.
        if stored_pin and stored_pin == input_pin:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"pin": pwd_context.hash(input_pin)}})
            return {"status": "Success"}

    raise HTTPException(status_code=400, detail="The PIN is incorrect.")


# --- 9. GEMINI-FIRST OCR RECEIPT SCANNER ENDPOINT ---
@app.post("/ocr-scan")
async def ocr_scan(
    files: List[UploadFile] = File(...),
    user_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        if not files or len(files) == 0:
            raise HTTPException(status_code=400, detail="No receipt images were provided.")
        if len(files) > 4:
            raise HTTPException(status_code=413, detail="Scan up to four receipt images at a time.")
        user_id = current_user["id"]

        # Preserve enough detail for thermal-print and handwritten receipts.
        resize_cap = 1600

        processed_images_bytes = []
        receipt_crops = 0
        for file in files:
            if file.content_type and not file.content_type.startswith("image/"):
                raise HTTPException(status_code=415, detail="Receipt uploads must be image files.")
            contents = await file.read(10 * 1024 * 1024 + 1)
            await file.close()
            if len(contents) > 10 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="Each receipt image must be 10 MB or smaller.")
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is not None:
                if img.shape[0] * img.shape[1] > 30_000_000:
                    raise HTTPException(status_code=413, detail="Receipt image dimensions are too large.")
                receipt_image, was_straightened = detect_and_straighten_receipt(img)
                receipt_crops += int(was_straightened)
                img_resized = resize_image_if_needed(receipt_image, max_dim=resize_cap)
                _, encoded_img = cv2.imencode(".jpg", img_resized)
                processed_images_bytes.append(encoded_img.tobytes())

        if not processed_images_bytes:
            raise HTTPException(status_code=400, detail="Invalid image file(s).")
        print(f"[Image] Receipt crop/straighten applied to {receipt_crops}/{len(processed_images_bytes)} photo(s).")

        # Fetch categories ng user
        user_categories = []
        if user_id:
            try:
                cursor = db.categories.find({
                    "is_archived": {"$ne": True},
                    "type": {"$regex": "^expense$", "$options": "i"},
                    "$or": [
                        {"user_id": user_id, "category_role": "user"},
                        {"category_role": "admin"},
                    ],
                })
                cat_docs = await cursor.to_list(length=100)
                user_categories = [c["name"] for c in cat_docs]
            except Exception as e:
                print(f"Could not fetch user categories: {e}")

        if not ai_client:
            raise HTTPException(
                status_code=503,
                detail="Receipt scanning is temporarily unavailable. You can retry or enter the details manually.",
            )

        print(f"[OCR] Sending {len(processed_images_bytes)} receipt image(s) to Gemini.")
        try:
            gemini_result = await asyncio.wait_for(
                asyncio.to_thread(gemini_extract_receipt, processed_images_bytes, user_categories),
                timeout=GEMINI_OCR_TIMEOUT_SECONDS + 0.5,
            )
        except asyncio.TimeoutError:
            print(f"[OCR] Gemini request exceeded the {GEMINI_OCR_TIMEOUT_SECONDS:g}s deadline.")
            raise HTTPException(
                status_code=504,
                detail="Receipt scanning took too long. Please retry or enter the details manually.",
            )
        except Exception as gemini_err:
            # Preserve the provider's actionable status while stripping any
            # accidental credential echo from SDK exception text.
            safe_error = str(gemini_err).replace(GEMINI_API_KEY, "[REDACTED]").replace("\r", " ").replace("\n", " ")
            safe_error = safe_error[:500]
            error_code = getattr(gemini_err, "code", None)
            print(
                f"[OCR] Gemini request failed ({type(gemini_err).__name__}; "
                f"code={error_code}; detail={safe_error})."
            )
            raise HTTPException(
                status_code=503,
                detail="Receipt scanning is temporarily unavailable. Please retry or enter the details manually.",
            )

        extracted_fields = [field for field in ("merchant", "date", "amount") if gemini_result.get(field) is not None]
        print(f"[OCR] Gemini extraction completed. Read fields: {', '.join(extracted_fields) or 'none'}.")
        final_result = reconcile_receipt_fields(None, gemini_result, user_categories)
        final_result["raw_text"] = ""
        final_result["amount_is_fallback"] = final_result["amount"] is None
        final_result["merchant_is_fallback"] = final_result["merchant"] is None
        final_result["date_is_fallback"] = final_result["date"] is None

        return {"status": "Success", "engine": "Gemini", "data": final_result}

    except HTTPException as http_ex:
        raise http_ex
    except Exception as err:
        print(f"Scan API Fatal Error -> {err}")
        raise HTTPException(
            status_code=500,
            detail="We couldn't read the receipt. Please make sure the image is clear and try again."
        )


# --- 10. TRANSACTION ENDPOINTS ---

@app.post("/add-goal-contribution")
async def add_goal_contribution(transaction: TransactionSchema, current_user: dict = Depends(get_current_user)):
    transaction.user_id = current_user["id"]
    transaction.type = "Contribution"
    transaction.to_account = None
    validate_transaction_for_storage(transaction)

    if not transaction.goal_id:
        raise HTTPException(status_code=400, detail="A goal ID is required to make a contribution.")

    try:
        goal_oid = ObjectId(transaction.goal_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid goal ID.")
    goal = await db.goals.find_one(
        {"_id": goal_oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
    )
    if not goal:
        raise HTTPException(status_code=404, detail="The selected goal could not be found.")
    await validate_transaction_references(transaction, current_user["id"])
    account_doc = await db.accounts.find_one({"_id": ObjectId(transaction.account_id), "is_archived": {"$ne": True}})
    if not account_doc:
        raise HTTPException(status_code=409, detail="The selected account is no longer active.")
    transaction_dict = transaction.dict()
    transaction_dict["goal_id"] = str(transaction.goal_id)
    transaction_dict["created_at"] = datetime.utcnow()
    lock_id = await accounts.ensure_account_balance_lock(current_user["id"], account_doc["_id"])
    async def commit_legacy_contribution(session):
        await accounts.lock_account_balance(session, lock_id)
        if not await db.accounts.find_one(
            {"_id": account_doc["_id"], "is_archived": {"$ne": True}}, session=session
        ):
            raise HTTPException(status_code=409, detail="The selected account is no longer active.")
        available = await accounts.calculate_account_balance(
            transaction.account, current_user["id"], float(account_doc.get("initial_balance", 0) or 0),
            session=session, account_id=transaction.account_id,
        )
        if transaction.amount > available:
            raise HTTPException(status_code=409, detail="The selected account does not have enough balance for this contribution.")
        current_goal = await db.goals.find_one(
            {"_id": goal_oid, "user_id": current_user["id"], "is_archived": {"$ne": True}}, session=session
        )
        if not current_goal:
            raise HTTPException(status_code=404, detail="The selected goal could not be found.")
        inserted = await db.expenses.insert_one(transaction_dict, session=session)
        await db.goals.update_one(
            {"_id": goal_oid, "user_id": current_user["id"], "is_archived": {"$ne": True}},
            {"$inc": {"current_savings": float(transaction.amount)}}, session=session,
        )
        return inserted.inserted_id
    try:
        async with await db.client.start_session() as session:
            inserted_id = await session.with_transaction(commit_legacy_contribution)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not safely complete the contribution. Verify MongoDB transaction support and try again.") from exc

    return {"status": "Success", "id": str(inserted_id), "message": "Naihulog na sa goal!"}


@app.post("/add-expense")
async def add_expense(transaction: TransactionSchema, current_user: dict = Depends(get_current_user)):
    transaction.user_id = current_user["id"]
    if transaction.goal_id:
        raise HTTPException(status_code=422, detail="Use the savings goal contribution flow to link a transaction to a goal.")
    validate_transaction_for_storage(transaction)
    await validate_transaction_references(transaction, current_user["id"])
    transaction_dict = transaction.dict()
    transaction_dict["created_at"] = datetime.utcnow()
    if transaction.type.lower() in {"income", "expense", "transfer"}:
        source_account = await db.accounts.find_one({"_id": ObjectId(transaction.account_id), "is_archived": {"$ne": True}})
        if not source_account:
            raise HTTPException(status_code=409, detail="The selected source account is no longer active.")
        account_docs = [source_account]
        if transaction.type.lower() == "transfer":
            destination = await db.accounts.find_one({"_id": ObjectId(transaction.to_account_id), "is_archived": {"$ne": True}})
            if not destination:
                raise HTTPException(status_code=409, detail="The selected destination account is no longer active.")
            account_docs.append(destination)
        lock_ids = []
        for account_doc in account_docs:
            if account_doc:
                lock_ids.append(await accounts.ensure_account_balance_lock(current_user["id"], account_doc["_id"]))
        async def commit_spend(session):
            for lock_id in sorted(lock_ids):
                await accounts.lock_account_balance(session, lock_id)
            for account_doc in account_docs:
                if not await db.accounts.find_one(
                    {"_id": account_doc["_id"], "is_archived": {"$ne": True}}, session=session
                ):
                    raise HTTPException(status_code=409, detail="A selected account is no longer active.")
            if transaction.type.lower() in {"expense", "transfer"}:
                available = await accounts.calculate_account_balance(
                    transaction.account, current_user["id"], float((source_account or {}).get("initial_balance", 0) or 0),
                    session=session, account_id=transaction.account_id,
                )
                if transaction.amount > available:
                    raise HTTPException(
                        status_code=409,
                        detail="This transaction is more than the available balance in the selected account.",
                    )
            result = await db.expenses.insert_one(transaction_dict, session=session)
            return result.inserted_id
        try:
            async with await db.client.start_session() as session:
                inserted_id = await session.with_transaction(commit_spend)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail="We couldn't save this transaction right now. Please try again.") from exc
    else:
        result = await db.expenses.insert_one(transaction_dict)
        inserted_id = result.inserted_id

    notifications_created = []
    if transaction.type.lower() == "expense":
        # 1. Che-check ng system kung may na-hit na budget limit
        notifications_created = await safely_refresh_budget_notifications(transaction.user_id)

        # 2. ðŸš¨ EMAIL ALERT INTEGRATION ðŸš¨
    return {"status": "Success", "id": str(inserted_id), "notifications": notifications_created}


@app.put("/update-expense/{expense_id}")
async def update_expense(expense_id: str, transaction: TransactionSchema, current_user: dict = Depends(get_current_user)):
    transaction.user_id = current_user["id"]
    if transaction.goal_id:
        raise HTTPException(status_code=422, detail="Goal links can only be changed through the savings goal flow.")
    validate_transaction_for_storage(transaction)
    await validate_transaction_references(transaction, current_user["id"])
    if transaction.goal_id:
        transaction.goal_id = str(transaction.goal_id)

    # 1. Kunin ang lumang transaction para may pagbasehan ng computation
    try:
        expense_oid = ObjectId(expense_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction ID.")
    old_txn = await db.expenses.find_one({"_id": expense_oid, "user_id": current_user["id"], "is_archived": {"$ne": True}})
    if not old_txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if old_txn.get("goal_id"):
        raise HTTPException(status_code=409, detail="Goal contributions must be changed from the goal so savings stay accurate.")

    # FIX: verify ownership before allowing the update. Previously any expense_id could
    # be edited regardless of who submitted the request -- same gap fixed for budgets.
    if str(old_txn.get("user_id", "")) != str(transaction.user_id):
        raise HTTPException(status_code=403, detail="You don't have permission to edit this transaction.")

    old_goal = old_txn.get("goal_id")
    new_goal = transaction.goal_id
    old_amount = float(old_txn.get("amount", 0))
    new_amount = float(transaction.amount)

    # 2. Mag-compute at mag-adjust ng ipon sa db.goals
    if old_goal == new_goal and old_goal:
        # Same goal, nag-iba lang ng amount (e.g. 500 naging 1000)
        difference = new_amount - old_amount
        if difference != 0:
            await db.goals.update_one(
                {"_id": ObjectId(old_goal)},
                {"$inc": {"current_savings": difference}}
            )
    elif old_goal != new_goal:
        # Nilipat sa ibang goal, o kaya tinanggalan ng goal
        if old_goal:
            # Bawiin yung pera mula sa lumang target
            await db.goals.update_one({"_id": ObjectId(old_goal)}, {"$inc": {"current_savings": -old_amount}})
        if new_goal:
            # Ipasok yung pera sa bagong target
            await db.goals.update_one({"_id": ObjectId(new_goal)}, {"$inc": {"current_savings": new_amount}})

    # 3. I-save yung bagong transaction data
    update_query = {"_id": expense_oid, "user_id": current_user["id"], "is_archived": {"$ne": True}}
    update_data = {"$set": {**transaction.dict(), "updated_at": datetime.utcnow()}}
    async def load_account(account_id: Optional[str], name: Optional[str]):
        if account_id and ObjectId.is_valid(account_id):
            account_doc = await db.accounts.find_one({"_id": ObjectId(account_id)})
            if account_doc:
                return account_doc
        if not name:
            return None
        account_doc = await db.accounts.find_one({
            "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            "user_id": current_user["id"], "account_role": "user",
        })
        if not account_doc:
            account_doc = await db.accounts.find_one({
                "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "account_role": "admin",
            })
        return account_doc

    locked_accounts = {}
    resolved_account_refs = {}
    account_refs = [
        (transaction.account_id, transaction.account),
        (transaction.to_account_id, transaction.to_account),
        (old_txn.get("account_id"), old_txn.get("account")),
        (old_txn.get("to_account_id"), old_txn.get("to_account")),
    ]
    for account_id, account_name in account_refs:
        if not account_name:
            continue
        account_doc = await load_account(account_id, account_name)
        if not account_doc:
            raise HTTPException(status_code=409, detail="An account linked to this transaction is no longer available.")
        locked_accounts[str(account_doc["_id"])] = account_doc
        resolved_account_refs[(str(account_id or ""), str(account_name))] = str(account_doc["_id"])
    lock_ids = {
        account_id: await accounts.ensure_account_balance_lock(current_user["id"], account_doc["_id"])
        for account_id, account_doc in locked_accounts.items()
    }

    async def commit_update(session):
        for lock_id in sorted(lock_ids.values()):
            await accounts.lock_account_balance(session, lock_id)
        for account_id in (transaction.account_id, transaction.to_account_id):
            if account_id and not await db.accounts.find_one(
                {"_id": ObjectId(account_id), "is_archived": {"$ne": True}}, session=session
            ):
                raise HTTPException(status_code=409, detail="A selected account is no longer active.")
        current_old = await db.expenses.find_one(update_query, session=session)
        if not current_old:
            raise HTTPException(status_code=404, detail="Transaction not found")
        old_ids = [str(current_old.get("account_id") or ""), str(current_old.get("to_account_id") or "")]
        if any(value and ObjectId.is_valid(value) and value not in locked_accounts for value in old_ids):
            raise HTTPException(status_code=409, detail="This transaction changed while you were editing it. Reload and try again.")
        if not current_old.get("account_id") and current_old.get("account") != old_txn.get("account"):
            raise HTTPException(status_code=409, detail="This transaction changed while you were editing it. Reload and try again.")
        if not current_old.get("to_account_id") and current_old.get("to_account") != old_txn.get("to_account"):
            raise HTTPException(status_code=409, detail="This transaction changed while you were editing it. Reload and try again.")

        balance_deltas = {account_id: 0.0 for account_id in locked_accounts}
        old_type = str(current_old.get("type", "")).lower()
        old_amount = float(current_old.get("amount", 0) or 0)
        current_old_source_ref = str(current_old.get("account_id") or "")
        current_old_destination_ref = str(current_old.get("to_account_id") or "")
        old_source_id = current_old_source_ref if current_old_source_ref in locked_accounts else resolved_account_refs.get((current_old_source_ref, str(current_old.get("account", ""))), "")
        old_destination_id = current_old_destination_ref if current_old_destination_ref in locked_accounts else resolved_account_refs.get((current_old_destination_ref, str(current_old.get("to_account", ""))), "")
        if old_source_id and old_source_id in balance_deltas:
            balance_deltas[old_source_id] += -old_amount if old_type == "income" else old_amount
        if old_type == "transfer" and old_destination_id in balance_deltas:
            balance_deltas[old_destination_id] -= old_amount

        new_type = transaction.type.lower()
        new_amount = float(transaction.amount)
        new_source_id = str(transaction.account_id or "")
        new_destination_id = str(transaction.to_account_id or "")
        if new_source_id in balance_deltas:
            balance_deltas[new_source_id] += new_amount if new_type == "income" else -new_amount
        if new_type == "transfer" and new_destination_id in balance_deltas:
            balance_deltas[new_destination_id] += new_amount

        for account_id, delta in balance_deltas.items():
            account_doc = locked_accounts[account_id]
            current_balance = await accounts.calculate_account_balance(
                account_doc.get("name", ""), current_user["id"],
                float(account_doc.get("initial_balance", 0) or 0),
                session=session, account_id=account_id,
            )
            if current_balance + delta < -0.005:
                raise HTTPException(status_code=409, detail="This change is more than the available balance in an affected account.")
        return await db.expenses.update_one(update_query, update_data, session=session)

    try:
        async with await db.client.start_session() as session:
            result = await session.with_transaction(commit_update)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="We couldn't update this transaction right now. Please try again.") from exc

    if result.matched_count == 1:
        notifications_created = await safely_refresh_budget_notifications(transaction.user_id)
        return {"status": "Success", "notifications": notifications_created}

    raise HTTPException(status_code=404, detail="Failed to update transaction.")


@app.get("/get-expenses")
async def get_expenses(user_id: str, archived: bool = False, limit: int = 500, offset: int = 0, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    if limit < 1 or limit > 500 or offset < 0:
        raise HTTPException(status_code=422, detail="Limit must be 1–500 and offset cannot be negative.")
    query = {"user_id": user_id, "is_archived": True if archived else {"$ne": True}}
    total = await db.expenses.count_documents(query)
    cursor = db.expenses.find(query).sort([("date", -1), ("_id", -1)]).skip(offset).limit(limit)
    expenses = await cursor.to_list(length=limit)
    for item in expenses:
        item["_id"] = str(item["_id"])
    return {"status": "Success", "data": expenses, "total": total, "has_more": offset + len(expenses) < total}


async def _lifecycle_account(transaction: dict, field: str, user_id: str):
    account_id = transaction.get(f"{field}_id")
    if account_id and ObjectId.is_valid(str(account_id)):
        return await db.accounts.find_one({
            "_id": ObjectId(str(account_id)),
            "$or": [{"account_role": "admin"}, {"account_role": "user", "user_id": user_id}],
        })
    name = transaction.get(field)
    if not name:
        return None
    account = await db.accounts.find_one({
        "name": {"$regex": f"^{re.escape(str(name))}$", "$options": "i"},
        "account_role": "user", "user_id": user_id,
    })
    if not account:
        account = await db.accounts.find_one({
            "name": {"$regex": f"^{re.escape(str(name))}$", "$options": "i"}, "account_role": "admin",
        })
    return account


def _transaction_lifecycle_signature(transaction: dict) -> tuple:
    return (
        str(transaction.get("type", "")).lower(),
        float(transaction.get("amount", 0) or 0),
        str(transaction.get("account_id") or ""),
        str(transaction.get("account") or ""),
        str(transaction.get("to_account_id") or ""),
        str(transaction.get("to_account") or ""),
        str(transaction.get("goal_id") or ""),
    )


async def _transition_transaction_lifecycle(expense_id: str, user_id: str, action: str):
    """Atomically change transaction state, account balances, and linked goal savings."""
    try:
        expense_oid = ObjectId(expense_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid transaction ID.")

    was_archived = action in {"restore", "permanent_delete"}
    state_query = {"is_archived": True} if was_archived else {"is_archived": {"$ne": True}}
    transaction_query = {"_id": expense_oid, "user_id": user_id, **state_query}
    transaction = await db.expenses.find_one(transaction_query)
    if not transaction:
        label = "Archived transaction" if was_archived else "Transaction"
        raise HTTPException(status_code=404, detail=f"{label} not found.")

    transaction_type = str(transaction.get("type", "")).lower()
    source_account = await _lifecycle_account(transaction, "account", user_id)
    destination_account = await _lifecycle_account(transaction, "to_account", user_id) if transaction_type == "transfer" else None
    if not source_account or (transaction_type == "transfer" and not destination_account):
        raise HTTPException(status_code=409, detail="A linked account is unavailable, so this transaction cannot be changed safely.")
    if action == "restore" and any(account.get("is_archived") for account in (source_account, destination_account) if account):
        raise HTTPException(status_code=409, detail="Restore the linked account first, then restore this transaction.")

    affected_accounts = {str(source_account["_id"]): source_account}
    if destination_account:
        affected_accounts[str(destination_account["_id"])] = destination_account
    lock_ids = {
        account_id: await accounts.ensure_account_balance_lock(user_id, account["_id"])
        for account_id, account in affected_accounts.items()
    }
    expected_signature = _transaction_lifecycle_signature(transaction)
    amount = float(transaction.get("amount", 0) or 0)
    goal_id = transaction.get("goal_id")

    async def commit_transition(session):
        for lock_id in sorted(lock_ids.values()):
            await accounts.lock_account_balance(session, lock_id)
        current = await db.expenses.find_one(transaction_query, session=session)
        if not current:
            raise HTTPException(status_code=404, detail="Transaction state changed. Reload and try again.")
        if _transaction_lifecycle_signature(current) != expected_signature:
            raise HTTPException(status_code=409, detail="This transaction changed. Reload and try again.")

        direction = 1 if action == "restore" else (0 if action == "permanent_delete" else -1)
        deltas = {account_id: 0.0 for account_id in affected_accounts}
        source_id = str(source_account["_id"])
        destination_id = str(destination_account["_id"]) if destination_account else None
        if transaction_type == "income":
            deltas[source_id] += direction * amount
        elif transaction_type in {"expense", "contribution"}:
            deltas[source_id] -= direction * amount
        elif transaction_type == "transfer":
            deltas[source_id] -= direction * amount
            deltas[destination_id] += direction * amount
        else:
            raise HTTPException(status_code=409, detail="This transaction type cannot be safely changed.")

        for account_id, delta in deltas.items():
            if delta >= 0:
                continue
            account = affected_accounts[account_id]
            current_balance = await accounts.calculate_account_balance(
                account.get("name", ""), user_id,
                float(account.get("initial_balance", 0) or 0), session=session, account_id=account_id,
            )
            if current_balance + delta < -0.005:
                raise HTTPException(
                    status_code=409,
                    detail=f"This change would leave {account.get('name', 'the linked account')} without enough balance. Keep the transaction active or add funds first.",
                )

        goal_oid = None
        if goal_id:
            try:
                goal_oid = ObjectId(str(goal_id))
            except Exception:
                raise HTTPException(status_code=409, detail="The linked savings goal is unavailable.")

        if action == "archive":
            values = {"is_archived": True, "archived_at": datetime.utcnow()}
            if goal_oid and not current.get("goal_contribution_reversed"):
                goal_result = await db.goals.update_one(
                    {"_id": goal_oid, "user_id": user_id, "current_savings": {"$gte": amount}},
                    {"$inc": {"current_savings": -amount}}, session=session,
                )
                if not goal_result.matched_count:
                    raise HTTPException(status_code=409, detail="The goal balance no longer matches this contribution. Refresh and try again.")
                values["goal_contribution_reversed"] = True
            changed = await db.expenses.update_one(transaction_query, {"$set": values}, session=session)
            if not changed.matched_count:
                raise HTTPException(status_code=409, detail="Transaction state changed. Reload and try again.")
            return changed

        if action == "restore":
            changed = await db.expenses.update_one(
                transaction_query, {"$set": {"is_archived": False}, "$unset": {"archived_at": ""}}, session=session
            )
            if changed.matched_count and goal_oid and current.get("goal_contribution_reversed"):
                goal_result = await db.goals.update_one(
                    {"_id": goal_oid, "user_id": user_id}, {"$inc": {"current_savings": amount}}, session=session
                )
                if not goal_result.matched_count:
                    raise HTTPException(status_code=409, detail="The linked goal is unavailable; transaction was not restored.")
                marker = await db.expenses.update_one(
                    {"_id": expense_oid, "user_id": user_id}, {"$unset": {"goal_contribution_reversed": ""}}, session=session
                )
                if not marker.matched_count:
                    raise HTTPException(status_code=409, detail="The linked goal update could not be completed safely.")
            return changed

        if action in {"delete", "permanent_delete"}:
            if goal_oid and not current.get("goal_contribution_reversed"):
                goal_result = await db.goals.update_one(
                    {"_id": goal_oid, "user_id": user_id, "current_savings": {"$gte": amount}},
                    {"$inc": {"current_savings": -amount}}, session=session,
                )
                if not goal_result.matched_count:
                    raise HTTPException(status_code=409, detail="The goal balance no longer matches this contribution. Refresh and try again.")
            deleted = await db.expenses.delete_one(transaction_query, session=session)
            if not deleted.deleted_count:
                raise HTTPException(status_code=409, detail="Transaction state changed. Reload and try again.")
            return deleted

        raise HTTPException(status_code=400, detail="Unsupported transaction action.")

    try:
        async with await db.client.start_session() as session:
            result = await session.with_transaction(commit_transition)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="We couldn't safely update this transaction. Please try again.") from exc

    changed = result.deleted_count == 1 if action in {"delete", "permanent_delete"} else result.matched_count == 1
    if not changed:
        raise HTTPException(status_code=409, detail="Transaction state changed. Reload and try again.")


@app.delete("/delete-expense/{expense_id}")
async def delete_expense(expense_id: str, user_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    await _transition_transaction_lifecycle(expense_id, current_user["id"], "delete")
    await safely_refresh_budget_notifications(current_user["id"])
    return {"status": "Success", "message": "Transaction deleted successfully"}


@app.patch("/archive-expense/{expense_id}")
async def archive_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    await _transition_transaction_lifecycle(expense_id, current_user["id"], "archive")
    await safely_refresh_budget_notifications(current_user["id"])
    return {"status": "Success", "message": "Transaction archived successfully"}


@app.patch("/restore-expense/{expense_id}")
async def restore_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    await _transition_transaction_lifecycle(expense_id, current_user["id"], "restore")
    await safely_refresh_budget_notifications(current_user["id"])
    return {"status": "Success", "message": "Transaction restored successfully"}


@app.delete("/permanent-delete-expense/{expense_id}")
async def permanently_delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    await _transition_transaction_lifecycle(expense_id, current_user["id"], "permanent_delete")
    await safely_refresh_budget_notifications(current_user["id"])
    return {"message": "Transaction permanently deleted"}

# --- 11. ONBOARDING ---
@app.post("/initial-setup")
async def initial_setup(data: InitialSetupSchema, current_user: dict = Depends(get_current_user)):
    if data.user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only set up your own profile.")
    try:
        user_oid = ObjectId(data.user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    # FIX: previously proceeded regardless of whether the user_id matched a real user --
    # update_one silently no-ops on zero matches, so a bogus user_id would still result
    # in an orphaned goal being inserted for a ghost user. Verify existence first.
    existing_user = await db.users.find_one({"_id": user_oid})
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    if existing_user.get("onboarding_completed"):
        raise HTTPException(status_code=409, detail="Initial setup has already been completed.")

    # A reported monthly baseline and first goal are useful for personalization,
    # but neither should block students or users with irregular/no income from
    # securing their account and using transaction tracking.
    goal_values = (data.target_name, data.target_amount, data.target_date)
    goal_provided = any(value is not None and str(value).strip() for value in goal_values)
    if goal_provided and any(value is None or not str(value).strip() for value in goal_values):
        raise HTTPException(status_code=422, detail="To add a goal now, provide its name, target amount, and target date; otherwise leave all goal fields blank.")
    if goal_provided:
        try:
            target_date = datetime.strptime(data.target_date, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Target date must be a real date in YYYY-MM-DD format.")
        if target_date <= ph_today():
            raise HTTPException(status_code=422, detail="The goal target date must be in the future.")
    elif data.goal_type_id:
        raise HTTPException(status_code=422, detail="A goal type can only be provided with a goal.")

    selected_goal_type = None
    if goal_provided and data.goal_type_id:
        selected_goal_type = await db.goal_types.find_one({
            "_id": ObjectId(data.goal_type_id),
            "is_archived": {"$ne": True},
        })
        if not selected_goal_type:
            raise HTTPException(status_code=422, detail="Choose an active goal type preset.")

    # FIX: PIN was previously stored in plaintext (paired with the /verify-pin fix above).
    await db.users.update_one(
        {"_id": user_oid},
        {"$set": {"pin": pwd_context.hash(data.pin), "monthly_income": data.monthly_income, "onboarding_completed": True}}
    )

    if goal_provided:
        # Keep onboarding-created goals consistent with goals created later.
        default_goal_type = selected_goal_type or (
            await db.goal_types.find_one({"is_archived": {"$ne": True}, "name": {"$regex": "^other$", "$options": "i"}})
            or await db.goal_types.find_one({"is_archived": {"$ne": True}})
        )
        goal_document = {
            "user_id": data.user_id,
            "target_name": data.target_name.strip(),
            "target_amount": data.target_amount,
            "target_date": data.target_date,
            "current_savings": 0.0,
            "created_at": datetime.utcnow(),
        }
        if default_goal_type:
            goal_document["goal_type_id"] = str(default_goal_type["_id"])
        await db.goals.insert_one(goal_document)
    return {"status": "Success"}

@app.get("/api/health", tags=["System"])
async def check_system_health():
    """
    Dynamic health check para sa Admin Dashboard.
    Sinusuri ang MongoDB, OCR engine, at AI Advisor API keys.
    """
    health_status = {
        "database": "offline",
        "ocr": "offline",
        "advisor": "offline"
    }

    # 1. Check Database (MongoDB Ping)
    try:
        await db.command("ping")
        health_status["database"] = "ok"
    except Exception:
        health_status["database"] = "error"

    # 2. Check OCR Scanner (EasyOCR)
    try:
        import easyocr
        # Kung nag-i-import nang maayos at walang library missing, goods ito.
        health_status["ocr"] = "ok"
    except ImportError:
        health_status["ocr"] = "error"

    # 3. Check AI Budget Advisor (Gemini/OpenAI Key Check)
    # Palitan mo yung "GEMINI_API_KEY" ng kung ano mang variable name gamit mo sa .env
    ai_key = os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if ai_key:
        health_status["advisor"] = "ok"
    else:
        health_status["advisor"] = "missing_key"

    # Determine Overall Status
    statuses = list(health_status.values())
    if all(s == "ok" for s in statuses):
        overall = "optimal"
    elif "error" in statuses or "offline" in statuses:
        overall = "offline"
    else:
        overall = "degraded" # Halimbawa, working ang DB pero missing ang AI key

    return {"status": overall, "details": health_status}

# --- ROUTERS ---
app.include_router(budgets.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(goal_types.router)
app.include_router(goals.router)
app.include_router(notifications.router)
app.include_router(users.router)
app.include_router(logs.router)
app.include_router(advisor.router)
app.include_router(export.router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
