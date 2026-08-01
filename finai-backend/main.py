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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "GEMINI_API_KEY_NOT_SET")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

otp_storage = {}

# --- 4. EASYOCR INITIALIZATION ---
print("Initializing EasyOCR Reader for FinAi...")
reader = easyocr.Reader(['en'], gpu=False)
print("EasyOCR Initialized successfully!")

# --- 5. EXPANDED LOCAL MERCHANT & ITEM MATCHING DICTIONARY ---
MERCHANT_CATEGORY_MAP = {
    "Food & Dining": [
        # Major Fast Food & Chains
        "jollibee", "mcdonalds", "mcdo", "chowking", "mang inasal", "kfc", 
        "starbucks", "greenwich", "tokyo tokyo", "shakeys", "pizza hut", 
        "bonchon", "burger king", "popeyes", "7-eleven", "uncle johns",
        # Local Eateries, Canteens & Common Menu Terms
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
    "cashier", "receipt", "table #", "transaction #"
]

CODE_REJECTION_PATTERNS = [
    "git pull", "git push", "git commit", "uvicorn", "http://", "https://", 
    "port 8000", "npm start", "expo start", "#backend", "#frontend", 
    "import react", "const ", "function()", "localhost", "def ", "class "
]

def match_merchant_and_category(full_text: str, default_merchant: str, available_categories: List[str] = None):
    """Rule-based keyword matching algorithm na may dynamic custom categories support."""
    text_lower = full_text.lower()
    
    # 1. Custom User Categories Match (Priority kung tugma sa sinet ng user)
    if available_categories:
        for user_cat in available_categories:
            if user_cat.lower() in text_lower:
                return default_merchant, user_cat

    # 2. Predefined Dictionary Matching
    for category_name, keywords in MERCHANT_CATEGORY_MAP.items():
        for kw in keywords:
            if kw in text_lower:
                matched_store = kw.title()
                if kw in ["mcdo", "mcdonalds"]: matched_store = "McDonald's"
                elif kw == "7-eleven": matched_store = "7-Eleven"
                elif kw in ["mr.diy", "mr diy"]: matched_store = "MR.DIY"
                elif kw == "snr": matched_store = "S&R Membership Shopping"
                
                # Check kung active ang category name na 'to sa listahan ng user
                final_category = category_name
                if available_categories and category_name not in available_categories:
                    final_category = available_categories[0] if available_categories else "General"

                return matched_store, final_category
                
    fallback_cat = available_categories[0] if (available_categories and len(available_categories) > 0) else "General"
    return default_merchant, fallback_cat


async def gemini_vision_fallback(image_bytes: bytes, available_categories: List[str]) -> dict:
    """PLAN B: Fallback OCR Scanner gamit ang Gemini Vision API."""
    print("Plan A EasyOCR rejected or uncertain. Triggering Plan B (Gemini Vision AI)...")
    
    categories_str = ", ".join(available_categories) if available_categories else "Food & Dining, Groceries, Shopping, Transportation, Utilities, Other"
    
    prompt = f"""
    You are an expert financial receipt parser. Analyze the image and extract:
    1. total_amount (float number only, e.g., 129.00)
    2. merchant (string, store or seller name)
    3. category (string - MUST BE EXACTLY ONE FROM THIS LIST: [{categories_str}])
    4. date (string, YYYY-MM-DD format if found, otherwise today's date)

    If the receipt is handwritten, local, or non-standard, infer the most context-appropriate category from the given list.
    Return strictly a raw JSON object with keys: "amount", "merchant", "category", "date". No markdown, no prose.
    """
    
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content([
        prompt,
        {"mime_type": "image/jpeg", "data": image_bytes}
    ])
    
    raw_response = response.text.strip().replace("```json", "").replace("```", "")
    data = json.loads(raw_response)
    
    return {
        "amount": f"{float(data.get('amount', 0.0)):.2f}",
        "merchant": str(data.get('merchant', 'Store Receipt')),
        "category": str(data.get('category', 'General')),
        "date": str(data.get('date', datetime.now().strftime("%Y-%m-%d"))),
        "raw_text": "Parsed by Gemini Vision Engine (Plan B)"
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
    amount: float = Field(..., gt=0, description="Dapat mas mataas sa 0 ang amount paps")
    category: str
    title: Optional[str] = None
    item_name: Optional[str] = None
    note: Optional[str] = None
    type: str = Field(..., description="Dapat Income, Expense, o Transfer")
    account: str
    to_account: Optional[str] = None
    date: Optional[str] = None
    goal_id: Optional[str] = None

class InitialSetupSchema(BaseModel):
    user_id: str
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$", description="Dapat exact 4-digit numeric PIN")
    monthly_income: float = Field(..., gt=0, description="Dapat mas mataas sa 0 ang initial income")
    target_name: str
    target_amount: float = Field(..., gt=0, description="Target savings amount")
    target_date: str = Field(..., description="Format: YYYY-MM-DD")

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
    raise HTTPException(status_code=500, detail="Failed to send OTP email. Subukan uli paps.")

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

# --- 9. HYBRID OCR RECEIPT SCANNER ENDPOINT ---
@app.post("/ocr-scan")
async def ocr_scan(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(None)
):
    contents = await file.read()
    
    # KUNIN ANG ACTIVE CATEGORIES NG USER MULA SA DATABASE KUNG MAY USER_ID
    user_categories = []
    if user_id:
        try:
            cursor = db.categories.find({"$or": [{"user_id": user_id}, {"is_default": True}]})
            cat_docs = await cursor.to_list(length=100)
            user_categories = [c["name"] for c in cat_docs]
        except Exception as e:
            print(f"Could not fetch user categories: {e}")

    # --- PLAN A: EASYOCR LOCAL PROCESSING ---
    try:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")

        results = reader.readtext(img)
        extracted_texts = [res[1] for res in results]
        full_text_block = " ".join(extracted_texts).lower()

        # REJECT CODE SCREENSHOTS
        is_code = any(pattern in full_text_block for pattern in CODE_REJECTION_PATTERNS)
        if is_code:
            raise HTTPException(status_code=400, detail="Hindi valid na resibo! Nakadetect ng source code/system log.")

        # CHECK KEYWORDS
        keyword_matches = [kw for kw in RECEIPT_KEYWORDS if kw in full_text_block]
        if len(keyword_matches) < 1:
            raise ValueError("EasyOCR: Standard receipt keywords not found.")

        # EXTRACT AMOUNT
        amounts = []
        for text in extracted_texts:
            cleaned_money = re.findall(r'\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}', text)
            for m in cleaned_money:
                val = float(m.replace(',', ''))
                if val != 8000.0 and val != 8080.0:
                    amounts.append(val)

        detected_amount = f"{max(amounts):.2f}" if amounts else "0.00"
        if float(detected_amount) == 0.0:
            raise ValueError("EasyOCR: Valid amount not extracted.")

        raw_first_line = extracted_texts[0] if len(extracted_texts) > 0 else "Store Receipt"
        detected_merchant, matched_category = match_merchant_and_category(full_text_block, raw_first_line, user_categories)

        detected_date = datetime.now().strftime("%Y-%m-%d")
        date_pattern = r'\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{2,4}'
        for text in extracted_texts:
            date_match = re.search(date_pattern, text)
            if date_match:
                detected_date = date_match.group(0)
                break

        print("Plan A (EasyOCR) Successful!")
        return {
            "status": "Success",
            "engine": "EasyOCR (Plan A)",
            "data": {
                "amount": detected_amount,
                "merchant": detected_merchant,
                "category": matched_category,
                "date": detected_date,
                "raw_text": full_text_block
            }
        }

    except Exception as plan_a_error:
        print(f"Plan A Failed or Triggered Fallback -> Reason: {plan_a_error}")
        # --- PLAN B: GEMINI VISION FALLBACK ---
        try:
            parsed_data = await gemini_vision_fallback(contents, user_categories)
            return {
                "status": "Success",
                "engine": "Gemini Vision AI (Plan B Fallback)",
                "data": parsed_data
            }
        except Exception as plan_b_error:
            print(f"Plan B Error: {plan_b_error}")
            raise HTTPException(status_code=400, detail="Hindi mabasa ang resibo paps. Siguraduhing malinaw at hindi masyadong dumi/pudpod.")

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
            
            budget_exists = await db.budgets.find_one({
                "user_id": transaction.user_id,
                "category_id": cat_id,
                "month_year": current_month
            })

            if budget_exists:
                await db.budgets.update_one(
                    {"_id": budget_exists["_id"]}, 
                    {"$inc": {"spent": transaction.amount}}
                )
    
    return {"status": "Success", "id": str(result.inserted_id)}

@app.put("/update-expense/{expense_id}")
async def update_expense(expense_id: str, transaction: TransactionSchema):
    if transaction.goal_id:
        transaction.goal_id = str(transaction.goal_id)
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
    try:
        exp_oid = ObjectId(expense_id)
    except:
        raise HTTPException(status_code=400, detail="Maling format ng Expense ID")

    expense = await db.expenses.find_one({"_id": exp_oid})
    if not expense:
        raise HTTPException(status_code=404, detail="Transaction not found")

    goal_id = expense.get("goal_id")
    if goal_id:
        try:
            amount_to_deduct = float(expense["amount"])
            await db.goals.update_one(
                {"_id": ObjectId(goal_id)},
                {"$inc": {"current_savings": -amount_to_deduct}}
            )
        except Exception as e:
            print(f"INTEGRITY WARNING: Failed to update linked savings balance -> {e}")

    result = await db.expenses.delete_one({"_id": exp_oid})
    if result.deleted_count == 1: 
        return {"status": "Success", "message": "Transaction deleted and goals synchronized!"}
        
    raise HTTPException(status_code=500, detail="Failed to delete from server storage")

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