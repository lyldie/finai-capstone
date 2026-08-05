from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List
from passlib.context import CryptContext
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import smtplib
import random
import string
import os
import cv2
import numpy as np
import re
import easyocr
import json
from google import genai
from email.message import EmailMessage
import uvicorn

# I-IMPORT ANG DB MULA SA DATABASE.PY
from database import db

# I-IMPORT ANG ROUTERS
from routers import budgets, categories, accounts, goal_types, goals

app = FastAPI(title="FinAi Backend", version="1.0")


# 1. Terminal Truth - Error Debugger
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("---------- TERMINAL TRUTH: VALIDATION ERROR ----------")
    print(f"Bakit error? -> {exc.errors()}")
    print(f"Anong data ang pumasok? -> {exc.body}")
    print("------------------------------------------------------")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body},
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
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "sobrangfinefinai@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "natvzmqhkmkquafu")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Initialize Google GenAI Client
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

otp_storage = {}


# --- 4. EASYOCR INITIALIZATION ---
print("Initializing EasyOCR Reader for FinAi (Primary Local Engine)...")
try:
    reader = easyocr.Reader(["en"], gpu=False)
    print("EasyOCR Initialized successfully!")
except Exception as e:
    print(f"EasyOCR init failed: {e}")
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


def _try_parse_date_parts(v1: int, v2: int, v3: int, current_year: int):
    """Subukan lahat ng posibleng pagkakaayos (YMD, MDY, DMY) at tignan alin
    ang valid na buwan/araw/taon. Returns (year, month, day) o None."""
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

    for year, month, day in candidates:
        if 2000 <= year <= (current_year + 1) and 1 <= month <= 12 and 1 <= day <= 31:
            return year, month, day
    return None


def sanitize_and_parse_date(extracted_texts: List[str]) -> Optional[str]:
    """I-validate ang month, day, at year para maiwasan ang maling petsa.
    Kapag walang taon sa resibo, gagamitin ang kasalukuyang taon bilang fallback.
    Sinusubukan muna per-fragment, tapos sa buong merged text bilang fallback."""
    date_pattern = r"\b(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})\b"
    month_day_pattern = r"\b(\d{1,2})[-/.](\d{1,2})\b"
    month_name_pattern = r"\b(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{1,2}),?\s+(\d{2,4})\b"
    month_day_without_year_pattern = r"\b(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{1,2})\b"
    month_day_year_pattern = r"\b(\d{1,2})\s+(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\s+(\d{2,4})\b"
    current_year = datetime.now().year

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
            result = _try_parse_date_parts(v1, v2, v3, current_year)
            if result:
                year, month, day = result
                return f"{year:04d}-{month:02d}-{day:02d}"

        # 2) Numeric month/day without year (e.g. 03/14 or 14-03)
        for p1, p2 in re.findall(month_day_pattern, text):
            try:
                left, right = int(p1), int(p2)
            except ValueError:
                continue
            if 1 <= left <= 12 and 1 <= right <= 31:
                return f"{current_year:04d}-{left:02d}-{right:02d}"
            if 1 <= right <= 12 and 1 <= left <= 31:
                return f"{current_year:04d}-{right:02d}-{left:02d}"

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
            if month and 1 <= day <= 31 and 2000 <= year <= (current_year + 1):
                return f"{year:04d}-{month:02d}-{day:02d}"

        # 4) Month-name pattern without year (e.g. "March 14")
        for month_str, day_str in re.findall(month_day_without_year_pattern, low):
            month = MONTH_NAME_MAP.get(month_str)
            try:
                day = int(day_str)
            except ValueError:
                continue
            if month and 1 <= day <= 31:
                return f"{current_year:04d}-{month:02d}-{day:02d}"

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
            if month and 1 <= day <= 31 and 2000 <= year <= (current_year + 1):
                return f"{year:04d}-{month:02d}-{day:02d}"

        # 6) Day-month pattern without year (e.g. "14 March")
        for day_str, month_str in re.findall(r"\b(\d{1,2})\s+(" + "|".join(MONTH_NAME_MAP.keys()) + r")\.?\b", low):
            month = MONTH_NAME_MAP.get(month_str)
            try:
                day = int(day_str)
            except ValueError:
                continue
            if month and 1 <= day <= 31:
                return f"{current_year:04d}-{month:02d}-{day:02d}"

    return None


def _extract_amount_candidates(text: str) -> List[float]:
    """Extract amount-like values, including split formats like '689 75' -> 689.75."""
    money_pattern = r"(?:PHP|P|₱)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2})?)"
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
    """Hanapin ang total base sa keyword na 'total' (hindi 'subtotal').
    Mas gusto ang halaga na malapit sa total line kaysa sa unang malaking numero."""

    best_total = None
    best_score = -1

    for i, text in enumerate(all_extracted_texts):
        low = text.lower().strip()
        if not low:
            continue

        if any(sub in low for sub in SUBTOTAL_KEYWORDS):
            continue

        window_lines = [text]
        for j in range(i + 1, min(i + 3, len(all_extracted_texts))):
            window_lines.append(all_extracted_texts[j])
        window_text = " ".join(window_lines)
        window_low = window_text.lower()

        matched_keyword = next((kw for kw in TOTAL_KEYWORDS if kw in window_low), None)
        if not matched_keyword:
            continue

        score = 0
        if matched_keyword in ("grand total", "total amount due", "total due", "amount due"):
            score += 120
        else:
            score += 80

        if "vat" in window_low or "tax" in window_low:
            score -= 70
        if "cash" in window_low or "change" in window_low:
            score -= 60
        if "payable" in window_low:
            score += 20
        if "balance" in window_low:
            score -= 20

        for val in _extract_amount_candidates(window_text):
            if score > best_score:
                best_score = score
                best_total = val
            elif score == best_score and best_total is not None and val > best_total:
                best_total = val

    if best_total is None:
        for text in all_extracted_texts:
            for val in _extract_amount_candidates(text):
                if best_total is None or val > best_total:
                    best_total = val

    return best_total


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

    cleaned = text.replace("PHP", "").replace("₱", "").replace(",", "").strip()
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


def match_merchant_and_category(full_text: str, candidate_lines: List[str], available_categories: List[str] = None):
    """Rule-based keyword matching algorithm para sa Merchant at Category.
    Returns (merchant, category, merchant_is_fallback)."""
    text_lower = full_text.lower()

    if available_categories:
        for user_cat in available_categories:
            if user_cat.lower() in text_lower:
                fallback_merchant, is_fallback = pick_merchant_line(candidate_lines)
                return fallback_merchant, user_cat, is_fallback

    for category_name, keywords in MERCHANT_CATEGORY_MAP.items():
        for kw in keywords:
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

                final_category = category_name
                if available_categories and category_name not in available_categories:
                    final_category = available_categories[0] if available_categories else "General"

                return matched_store, final_category, False

    fallback_cat = available_categories[0] if (available_categories and len(available_categories) > 0) else "General"
    fallback_merchant, is_fallback = pick_merchant_line(candidate_lines)
    return fallback_merchant, fallback_cat, is_fallback


def process_multi_photo_easyocr(images_bytes_list: List[bytes], user_categories: List[str]):
    """PRIMARY LOCAL ENGINE: More reliable OCR parsing for receipts."""
    all_extracted_texts = []

    for img_bytes in images_bytes_list:
        try:
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            resized = resize_image_if_needed(img, max_dim=1400)

            # OCR on both original and enhanced version
            for variant in [resized, enhance_image_for_ocr(resized)]:
                try:
                    if reader is None:
                        continue
                    results = reader.readtext(variant)
                    texts = [res[1] for res in results]
                    all_extracted_texts.extend(texts)
                except Exception as e:
                    print(f"EasyOCR variant failed: {e}")
        except Exception as e:
            print(f"EasyOCR image failed: {e}")

    if not all_extracted_texts:
        return {
            "amount": "0.00",
            "merchant": "Store Receipt",
            "category": user_categories[0] if user_categories else "General",
            "date": datetime.now().strftime("%Y-%m-%d"),
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
        raise HTTPException(status_code=400, detail="Hindi valid na resibo! Nakadetect ng code.")

    total_amount_value = extract_total_amount(all_extracted_texts)
    detected_amount = f"{total_amount_value:.2f}" if total_amount_value is not None else "0.00"

    detected_merchant, matched_category, merchant_is_fallback = match_merchant_and_category(
        full_text_block, all_extracted_texts, user_categories
    )

    raw_date_found = sanitize_and_parse_date(all_extracted_texts)
    detected_date = raw_date_found or datetime.now().strftime("%Y-%m-%d")
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


async def gemini_multi_photo_fallback(images_bytes_list: List[bytes], available_categories: List[str]) -> dict:
    """SECONDARY ENGINE: High-Accuracy Vision Fallback via Gemini 2.0 Flash."""
    print("🤖 Triggering Gemini 2.0 Flash Vision Processor...")

    if not ai_client:
        raise Exception("Gemini Client is not configured. Check GEMINI_API_KEY environment variable.")

    categories_str = ", ".join(available_categories) if available_categories else "Food & Dining, Groceries, Shopping, Transportation, Utilities, Supplies, General"

    prompt = f"""
    You are an expert financial receipt scanner for Philippine receipts, including handwritten ones.
    Read the image(s) carefully and extract the most likely transaction fields.
    Rules:
    1. "amount": Return the FINAL TOTAL AMOUNT DUE / GRAND TOTAL only. Ignore subtotals, VAT, discounts, unit prices, and change.
    2. "merchant": Return the business/store name only if it is clearly visible. If unclear, use a short neutral name like "Store Receipt".
    3. "date": Return a date in YYYY-MM-DD format. If the year is missing, use the current year. If the date is unreadable, use today's date.
    4. "category": Choose one category from this list: [{categories_str}].

    Output ONLY a valid JSON object with this shape:
    {{"amount": 5895.00, "merchant": "New Lite Lumber and Construction Supply", "date": "2018-03-14", "category": "Supplies"}}
    """

    contents_payload = [prompt]
    for img_bytes in images_bytes_list:
        contents_payload.append({"mime_type": "image/jpeg", "data": img_bytes})

    response = ai_client.models.generate_content(
        model="gemini-2.0-flash",
        contents=contents_payload
    )

    raw_response = response.text.strip()
    raw_response = re.sub(r"```json\s*|\s*```", "", raw_response)
    try:
        match = re.search(r"\{.*\}", raw_response, re.S)
        if match:
            raw_response = match.group(0)
        data = json.loads(raw_response)
    except Exception:
        data = {}

    raw_date = str(data.get("date", datetime.now().strftime("%Y-%m-%d")))
    sanitized_date = sanitize_and_parse_date([raw_date]) or datetime.now().strftime("%Y-%m-%d")

    amount_value = normalize_amount_value(data.get("amount"))
    formatted_amount = f"{amount_value:.2f}" if amount_value is not None else "0.00"

    merchant_value = str(data.get("merchant", "Store Receipt")).strip() or "Store Receipt"
    category_value = str(data.get("category", "General")).strip() or "General"

    return {
        "amount": formatted_amount,
        "merchant": merchant_value,
        "category": category_value,
        "date": sanitized_date,
        "raw_text": f"Parsed via Gemini 2.0 Vision ({len(images_bytes_list)} image frames)",
        "amount_is_fallback": amount_value is None,
        "merchant_is_fallback": merchant_value.lower() in {"store receipt", "receipt", "store"},
        "date_is_fallback": sanitized_date == datetime.now().strftime("%Y-%m-%d")
    }


# --- 6. MODELS ---
class UserSignup(BaseModel):
    name: str = Field(..., min_length=2, description="Pangalan ng user")
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TransactionSchema(BaseModel):
    user_id: str
    amount: float = Field(..., gt=0)
    category: str
    title: Optional[str] = None
    item_name: Optional[str] = None
    note: Optional[str] = None
    type: str = Field(...)
    account: str
    to_account: Optional[str] = None
    date: Optional[str] = None
    goal_id: Optional[str] = None


class InitialSetupSchema(BaseModel):
    user_id: str
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    monthly_income: float = Field(..., gt=0)
    target_name: str
    target_amount: float = Field(..., gt=0)
    target_date: str


# --- 7. HELPER FUNCTIONS ---
def send_otp_email(target_email: str, otp_code: str):
    try:
        msg = EmailMessage()
        msg["Subject"] = "FinAi - Verify Your Account 🐿️"
        msg["From"] = EMAIL_SENDER
        msg["To"] = target_email
        msg.set_content(
            f"Mabuhay paps!\n\nHeto ang iyong OTP Verification Code: {otp_code}\n\nValid ito sa loob ng 10 minuto.\n\n- FinAi Team"
        )
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"SMTP Error: {e}")
        return False


# --- 8. AUTH ENDPOINTS ---
@app.post("/register")
async def register(user: UserSignup):
    clean_email = user.email.lower().strip()
    existing_user = await db.users.find_one({"email": clean_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email na gamit na paps!")

    otp_code = "".join(random.choices(string.digits, k=6))
    if send_otp_email(clean_email, otp_code):
        hashed_password = pwd_context.hash(user.password[:72])
        otp_storage[clean_email] = {
            "name": user.name.strip(),
            "password": hashed_password,
            "otp": otp_code,
            "timestamp": datetime.utcnow()
        }
        return {"status": "Success", "message": "OTP sent successfully!"}
    raise HTTPException(status_code=500, detail="Failed to send OTP email.")


@app.post("/verify-otp")
async def verify_otp(data: dict):
    raw_email = data.get("email", "")
    user_otp = str(data.get("otp", "")).strip()
    clean_email = raw_email.lower().strip()

    if not clean_email or clean_email not in otp_storage:
        raise HTTPException(status_code=400, detail="Walang pending registration paps o nag-expire na.")

    stored_data = otp_storage[clean_email]
    if datetime.utcnow() - stored_data["timestamp"] > timedelta(minutes=10):
        del otp_storage[clean_email]
        raise HTTPException(status_code=400, detail="Expired na ang OTP code paps. Mag-register uli.")

    if stored_data["otp"] == user_otp:
        new_user = {
            "name": stored_data["name"],
            "email": clean_email,
            "password": stored_data["password"],
            "role": "user",
            "onboarding_completed": False,
            "created_at": datetime.utcnow()
        }
        result = await db.users.insert_one(new_user)
        del otp_storage[clean_email]
        return {"status": "Success", "user_id": str(result.inserted_id)}

    raise HTTPException(status_code=400, detail="Mali ang OTP code paps.")


@app.post("/login")
async def login(user: UserLogin):
    clean_email = user.email.lower().strip()
    db_user = await db.users.find_one({"email": clean_email})

    if not db_user:
        raise HTTPException(status_code=400, detail="Mali yata credentials mo paps.")

    password_to_verify = user.password[:72]
    try:
        if not pwd_context.verify(password_to_verify, db_user["password"]):
            raise HTTPException(status_code=400, detail="Mali yata credentials mo paps.")
    except Exception as e:
        print(f"Bcrypt verification error: {e}")
        raise HTTPException(status_code=500, detail="Error sa pag-verify ng password.")

    return {
        "status": "Success",
        "user_id": str(db_user["_id"]),
        "name": db_user["name"],
        "email": db_user["email"],
        "role": db_user.get("role", "user"),
        "onboarding_completed": db_user.get("onboarding_completed", False)
    }


@app.post("/verify-pin")
async def verify_pin(data: dict):
    raw_email = data.get("email", "")
    clean_email = raw_email.lower().strip()
    input_pin = str(data.get("pin", "")).strip()

    user = await db.users.find_one({"email": clean_email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if str(user.get("pin", "")) == input_pin:
        return {"status": "Success"}
    raise HTTPException(status_code=400, detail="Mali ang PIN mo paps!")


# --- 9. DUAL ENGINE OCR RECEIPT SCANNER ENDPOINT ---
@app.post("/ocr-scan")
async def ocr_scan(
    files: List[UploadFile] = File(...),
    user_id: Optional[str] = Form(None)
):
    try:
        if not files or len(files) == 0:
            raise HTTPException(status_code=400, detail="Walang litratong naipasa paps!")

        # Kapag maraming photos (mahabang resibo), mas malaking resize cap para
        # hindi masyadong lumiit ang text bago i-OCR.
        resize_cap = 1024 if len(files) <= 1 else 1600

        processed_images_bytes = []
        for file in files:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is not None:
                img_resized = resize_image_if_needed(img, max_dim=resize_cap)
                _, encoded_img = cv2.imencode(".jpg", img_resized)
                processed_images_bytes.append(encoded_img.tobytes())

        if not processed_images_bytes:
            raise HTTPException(status_code=400, detail="Invalid image file(s).")

        # Fetch categories ng user
        user_categories = []
        if user_id:
            try:
                cursor = db.categories.find({"$or": [{"user_id": user_id}, {"is_default": True}]})
                cat_docs = await cursor.to_list(length=100)
                user_categories = [c["name"] for c in cat_docs]
            except Exception as e:
                print(f"Could not fetch user categories: {e}")

        # --- STEP 1: PRIMARY LOCAL ENGINE (EASYOCR) ---
        print(f"🚀 Running EasyOCR Primary Engine on {len(processed_images_bytes)} photo(s)...")
        easyocr_result = None
        try:
            easyocr_result = process_multi_photo_easyocr(processed_images_bytes, user_categories)
        except Exception as easyocr_err:
            print(f"EasyOCR parsing error or rejected: {easyocr_err}")

        # --- STEP 2: RIGOROUS ACCURACY GATEKEEPER CHECK ---
        raw_text = str(easyocr_result.get("raw_text", "")) if easyocr_result else ""
        easyocr_score = _score_receipt_candidate(easyocr_result, raw_text) if easyocr_result else 0

        gemini_result = None
        if GEMINI_API_KEY:
            try:
                print("⚠️ Running Gemini 2.0 Flash fallback to compare and improve OCR consistency...")
                gemini_result = await gemini_multi_photo_fallback(processed_images_bytes, user_categories)
            except Exception as gemini_err:
                print(f"Gemini API Error: {gemini_err}")

        final_result, final_engine = select_best_receipt_result(easyocr_result, gemini_result, raw_text)

        if final_result is None:
            final_result = {
                "amount": "0.00",
                "merchant": "Store Receipt",
                "category": user_categories[0] if user_categories else "General",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "raw_text": "Failed to parse text strictly.",
                "amount_is_fallback": True,
                "merchant_is_fallback": True,
                "date_is_fallback": True,
            }
            final_engine = "EasyOCR (Partial Match)"

        if final_engine == "Gemini" and gemini_result:
            print("✅ Gemini provided the stronger receipt extraction.")
        elif easyocr_score >= 100:
            print("✅ EasyOCR produced a strong receipt extraction.")
        else:
            print("⚠️ OCR confidence was moderate; returning the best available result.")

        return {
            "status": "Success",
            "engine": final_engine,
            "data": final_result
        }

    except HTTPException as http_ex:
        raise http_ex
    except Exception as err:
        print(f"Scan API Fatal Error -> {err}")
        raise HTTPException(
            status_code=500,
            detail="Hindi mabasa ang resibo. Siguraduhing malinaw ang kuha ng resibo."
        )


# --- 10. TRANSACTION ENDPOINTS ---
@app.post("/add-expense")
async def add_expense(transaction: TransactionSchema):
    transaction_dict = transaction.dict()
    transaction_dict["created_at"] = datetime.utcnow()
    if transaction_dict.get("goal_id"):
        transaction_dict["goal_id"] = str(transaction_dict["goal_id"])
    result = await db.expenses.insert_one(transaction_dict)

    if transaction.type.lower() == "expense":
        category_doc = await db.categories.find_one({"name": transaction.category})
        if category_doc:
            cat_id = str(category_doc["_id"])
            current_month = datetime.utcnow().strftime("%m-%Y")
            budget_exists = await db.budgets.find_one({"user_id": transaction.user_id, "category_id": cat_id, "month_year": current_month})
            if budget_exists:
                await db.budgets.update_one({"_id": budget_exists["_id"]}, {"$inc": {"spent": transaction.amount}})
    return {"status": "Success", "id": str(result.inserted_id)}


@app.put("/update-expense/{expense_id}")
async def update_expense(expense_id: str, transaction: TransactionSchema):
    if transaction.goal_id:
        transaction.goal_id = str(transaction.goal_id)
    result = await db.expenses.update_one(
        {"_id": ObjectId(expense_id)},
        {"$set": {**transaction.dict(), "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 1:
        return {"status": "Success"}
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/get-expenses")
async def get_expenses(user_id: str):
    cursor = db.expenses.find({"user_id": user_id}).sort("date", -1)
    expenses = await cursor.to_list(length=500)
    for item in expenses:
        item["_id"] = str(item["_id"])
    return {"status": "Success", "data": expenses}


@app.delete("/delete-expense/{expense_id}")
async def delete_expense(expense_id: str):
    try:
        exp_oid = ObjectId(expense_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Maling format ng Expense ID")

    expense = await db.expenses.find_one({"_id": exp_oid})
    if not expense:
        raise HTTPException(status_code=404, detail="Transaction not found")

    goal_id = expense.get("goal_id")
    if goal_id:
        try:
            await db.goals.update_one({"_id": ObjectId(goal_id)}, {"$inc": {"current_savings": -float(expense["amount"])}})
        except Exception as e:
            print(f"Goal update warning: {e}")

    result = await db.expenses.delete_one({"_id": exp_oid})
    if result.deleted_count == 1:
        return {"status": "Success"}
    raise HTTPException(status_code=500, detail="Failed to delete transaction")


# --- 11. ONBOARDING ---
@app.post("/initial-setup")
async def initial_setup(data: InitialSetupSchema):
    await db.users.update_one(
        {"_id": ObjectId(data.user_id)},
        {"$set": {"pin": data.pin, "monthly_income": data.monthly_income, "onboarding_completed": True}}
    )
    await db.goals.insert_one({
        "user_id": data.user_id,
        **data.dict(exclude={"pin", "user_id", "monthly_income"}),
        "current_savings": 0.0,
        "created_at": datetime.utcnow()
    })
    return {"status": "Success"}


# --- ROUTERS ---
app.include_router(budgets.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(goal_types.router)
app.include_router(goals.router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)