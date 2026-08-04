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
import google.generativeai as genai
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

# 3. Security, Gemini & Email Config
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "sobrangfinefinai@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "natvzmqhkmkquafu") 
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

otp_storage = {}

# --- 4. EASYOCR INITIALIZATION ---
print("Initializing EasyOCR Reader for FinAi (Primary Local Engine)...")
reader = easyocr.Reader(['en'], gpu=False)
print("EasyOCR Initialized successfully!")

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

RECEIPT_KEYWORDS = [
    "total", "subtotal", "official receipt", "sales invoice", "or#", "tin#",
    "cash tender", "amount due", "vatable", "vat-exempt", "change due",
    "cashier", "receipt", "table #", "transaction #", "php", "amount"
]

CODE_REJECTION_PATTERNS = [
    "git pull", "git push", "git commit", "uvicorn", "http://", "https://", 
    "port 8000", "npm start", "expo start", "#backend", "#frontend", 
    "import react", "const ", "function()", "localhost", "def ", "class "
]

def resize_image_if_needed(img_np: np.ndarray, max_dim: int = 1024) -> np.ndarray:
    """I-downscale ang sobrang laking image para mabilis ma-process ng OCR."""
    h, w = img_np.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(img_np, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return img_np

def sanitize_and_parse_date(extracted_texts: List[str]) -> str:
    """I-validate ang month, day, at year para maiwasan ang maling petsa."""
    date_pattern = r'\b(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})\b'
    today_str = datetime.now().strftime("%Y-%m-%d")
    current_year = datetime.now().year

    for text in extracted_texts:
        matches = re.findall(date_pattern, text)
        for p1, p2, p3 in matches:
            try:
                v1, v2, v3 = int(p1), int(p2), int(p3)
                year, month, day = None, None, None

                if v1 > 1000:
                    year = v1
                    if 1 <= v2 <= 12 and 1 <= v3 <= 31: month, day = v2, v3
                    elif 1 <= v3 <= 12 and 1 <= v2 <= 31: month, day = v3, v2
                elif v3 > 1000:
                    year = v3
                    if 1 <= v1 <= 12 and 1 <= v2 <= 31: month, day = v1, v2
                    elif 1 <= v2 <= 12 and 1 <= v1 <= 31: month, day = v2, v1
                else:
                    if v3 < 100:
                        year = 2000 + v3
                        if 1 <= v1 <= 12 and 1 <= v2 <= 31: month, day = v1, v2

                if year and month and day:
                    if 2000 <= year <= (current_year + 1) and 1 <= month <= 12 and 1 <= day <= 31:
                        return f"{year:04d}-{month:02d}-{day:02d}"
            except Exception:
                continue

    return today_str

def match_merchant_and_category(full_text: str, default_merchant: str, available_categories: List[str] = None):
    """Rule-based keyword matching algorithm para sa Merchant at Category."""
    text_lower = full_text.lower()
    
    if available_categories:
        for user_cat in available_categories:
            if user_cat.lower() in text_lower:
                return default_merchant, user_cat

    for category_name, keywords in MERCHANT_CATEGORY_MAP.items():
        for kw in keywords:
            if kw in text_lower:
                matched_store = kw.title()
                if kw in ["mcdo", "mcdonalds"]: matched_store = "McDonald's"
                elif kw == "7-eleven": matched_store = "7-Eleven"
                elif kw in ["mr.diy", "mr diy"]: matched_store = "MR.DIY"
                elif kw == "snr": matched_store = "S&R Membership Shopping"
                
                final_category = category_name
                if available_categories and category_name not in available_categories:
                    final_category = available_categories[0] if available_categories else "General"

                return matched_store, final_category
                
    fallback_cat = available_categories[0] if (available_categories and len(available_categories) > 0) else "General"
    return default_merchant, fallback_cat

def process_multi_photo_easyocr(images_bytes_list: List[bytes], user_categories: List[str]):
    """PRIMARY LOCAL ENGINE: Merges text extracted from multiple receipt photos (Top + Bottom)."""
    all_extracted_texts = []
    
    for idx, img_bytes in enumerate(images_bytes_list):
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            results = reader.readtext(img)
            texts = [res[1] for res in results]
            all_extracted_texts.extend(texts)

    full_text_block = " ".join(all_extracted_texts).lower()

    # Code rejection guardrail
    is_code = any(pattern in full_text_block for pattern in CODE_REJECTION_PATTERNS)
    if is_code:
        raise HTTPException(status_code=400, detail="Hindi valid na resibo! Nakadetect ng code.")

    # Extract Amounts using strict Barcode/ID rejection
    amounts = []
    for text in all_extracted_texts:
        cleaned_money = re.findall(r'\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}', text)
        for m in cleaned_money:
            val = float(m.replace(',', ''))
            # Filter out extreme values and common barcode numbers
            if 1.0 <= val <= 200000.0 and val not in [8000.0, 8080.0, 22251.0]:
                amounts.append(val)

    detected_amount = f"{max(amounts):.2f}" if amounts else "0.00"
    raw_first_line = all_extracted_texts[0] if len(all_extracted_texts) > 0 else "Store Receipt"
    detected_merchant, matched_category = match_merchant_and_category(full_text_block, raw_first_line, user_categories)
    detected_date = sanitize_and_parse_date(all_extracted_texts)

    return {
        "amount": detected_amount,
        "merchant": detected_merchant,
        "category": matched_category,
        "date": detected_date,
        "raw_text": full_text_block
    }

async def gemini_multi_photo_fallback(images_bytes_list: List[bytes], available_categories: List[str]) -> dict:
    """SECONDARY ENGINE: Safe Fallback to Gemini 2.0 Flash."""
    print("Attempting Gemini 2.0 Flash processing...")
    
    categories_str = ", ".join(available_categories) if available_categories else "Food & Dining, Groceries, Shopping, Transportation, Utilities, Other"
    
    prompt = f"""
    Parse this receipt. Output strict raw JSON with keys: "amount", "merchant", "category", "date".
    Allowed categories: [{categories_str}]. Date format YYYY-MM-DD.
    """
    
    contents_payload = [prompt]
    for img_bytes in images_bytes_list:
        contents_payload.append({"mime_type": "image/jpeg", "data": img_bytes})

    # Directly use gemini-2.0-flash (New official standard)
    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content(contents_payload)
    
    raw_response = response.text.strip().replace("```json", "").replace("```", "")
    data = json.loads(raw_response)
    
    raw_date = str(data.get('date', datetime.now().strftime("%Y-%m-%d")))
    sanitized_date = sanitize_and_parse_date([raw_date])

    try:
        parsed_amt = float(data.get('amount', 0.0))
        formatted_amount = f"{parsed_amt:.2f}"
    except Exception:
        formatted_amount = "0.00"

    return {
        "amount": formatted_amount,
        "merchant": str(data.get('merchant', 'Store Receipt')),
        "category": str(data.get('category', 'General')),
        "date": sanitized_date,
        "raw_text": f"Parsed via Gemini 2.0 Vision ({len(images_bytes_list)} frames)"
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
        msg['Subject'] = "FinAi - Verify Your Account 🐿️"
        msg['From'] = EMAIL_SENDER
        msg['To'] = target_email
        msg.set_content(f"Mabuhay paps!\n\nHeto ang iyong OTP Verification Code: {otp_code}\n\nValid ito sa loob ng 10 minuto.\n\n- FinAi Team")
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
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
    
    otp_code = ''.join(random.choices(string.digits, k=6))
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

        processed_images_bytes = []
        for file in files:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is not None:
                img_resized = resize_image_if_needed(img, max_dim=1024)
                _, encoded_img = cv2.imencode('.jpg', img_resized)
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
        try:
            easyocr_result = process_multi_photo_easyocr(processed_images_bytes, user_categories)
            
            # Kung valid ang na-extract na amount, success agad gamit si EasyOCR!
            if float(easyocr_result["amount"]) > 0.0:
                return {
                    "status": "Success",
                    "engine": "EasyOCR (Offline Primary Engine)",
                    "data": easyocr_result
                }
        except Exception as easyocr_err:
            print(f"EasyOCR parsing skipped or non-conclusive: {easyocr_err}")

        # --- STEP 2: SECONDARY FALLBACK ENGINE (GEMINI VISION) ---
        if GEMINI_API_KEY:
            try:
                print("⚠️ EasyOCR yield was incomplete. Triggering Gemini 2.0 Vision Fallback...")
                gemini_result = await gemini_multi_photo_fallback(processed_images_bytes, user_categories)
                return {
                    "status": "Success",
                    "engine": "Gemini 2.0 Flash (AI Fallback)",
                    "data": gemini_result
                }
            except Exception as gemini_err:
                print(f"Gemini API Quota/Error hit: {gemini_err}")

        # Final Fallback if amount couldn't be extracted strictly
        return {
            "status": "Success",
            "engine": "EasyOCR (Partial Match)",
            "data": easyocr_result if 'easyocr_result' in locals() else {
                "amount": "0.00",
                "merchant": "Store Receipt",
                "category": user_categories[0] if user_categories else "General",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "raw_text": "Failed to parse text strictly."
            }
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
    if transaction_dict.get("goal_id"): transaction_dict["goal_id"] = str(transaction_dict["goal_id"])
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
    if transaction.goal_id: transaction.goal_id = str(transaction.goal_id)
    result = await db.expenses.update_one({"_id": ObjectId(expense_id)}, {"$set": {**transaction.dict(), "updated_at": datetime.utcnow()}})
    if result.matched_count == 1: return {"status": "Success"}
    raise HTTPException(status_code=404, detail="Not found")

@app.get("/get-expenses")
async def get_expenses(user_id: str):
    cursor = db.expenses.find({"user_id": user_id}).sort("date", -1)
    expenses = await cursor.to_list(length=500)
    for item in expenses: item["_id"] = str(item["_id"])
    return {"status": "Success", "data": expenses}

@app.delete("/delete-expense/{expense_id}")
async def delete_expense(expense_id: str):
    try: exp_oid = ObjectId(expense_id)
    except: raise HTTPException(status_code=400, detail="Maling format ng Expense ID")

    expense = await db.expenses.find_one({"_id": exp_oid})
    if not expense: raise HTTPException(status_code=404, detail="Transaction not found")

    goal_id = expense.get("goal_id")
    if goal_id:
        try:
            await db.goals.update_one({"_id": ObjectId(goal_id)}, {"$inc": {"current_savings": -float(expense["amount"])}})
        except Exception as e: print(f"Goal update warning: {e}")

    result = await db.expenses.delete_one({"_id": exp_oid})
    if result.deleted_count == 1: return {"status": "Success"}
    raise HTTPException(status_code=500, detail="Failed to delete transaction")

# --- 11. ONBOARDING ---
@app.post("/initial-setup")
async def initial_setup(data: InitialSetupSchema):
    await db.users.update_one({"_id": ObjectId(data.user_id)}, {"$set": {"pin": data.pin, "monthly_income": data.monthly_income, "onboarding_completed": True}})
    await db.goals.insert_one({"user_id": data.user_id, **data.dict(exclude={"pin", "user_id", "monthly_income"}), "current_savings": 0.0, "created_at": datetime.utcnow()})
    return {"status": "Success"}

# --- ROUTERS ---
app.include_router(budgets.router)
app.include_router(categories.router)
app.include_router(accounts.router)
app.include_router(goal_types.router)
app.include_router(goals.router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)