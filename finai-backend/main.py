from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from bson import ObjectId
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from passlib.context import CryptContext
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import smtplib
import random
import string
from email.message import EmailMessage
import uvicorn

# I-IMPORT ANG DB MULA SA DATABASE.PY
from database import db 
# I-IMPORT ANG ROUTERS
from routers import budgets, categories, accounts, goal_types, goals

app = FastAPI()

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

# 3. Security & Email Config
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
EMAIL_SENDER = "sobrangfinefinai@gmail.com"
EMAIL_PASSWORD = "natvzmqhkmkquafu" 
otp_storage = {}

# --- 4. MODELS ---
class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

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
    goal_id: Optional[str] = None  # INTEGRATED: Dito kakapit ang link papunta sa collection ng goals

class InitialSetupSchema(BaseModel):
    user_id: str
    pin: str = Field(..., description="Dapat 4-digit PIN string")
    monthly_income: float = Field(..., gt=0, description="Dapat mas mataas sa 0 ang initial income")
    target_name: str
    target_amount: float = Field(..., gt=0, description="Target savings amount")
    target_date: str = Field(..., description="Format: YYYY-MM-DD")

# --- 5. HELPER FUNCTIONS ---
def send_otp_email(target_email, otp_code):
    try:
        msg = EmailMessage()
        msg['Subject'] = "FinAi - Verify Your Account 🐿️"
        msg['From'] = EMAIL_SENDER
        msg['To'] = target_email
        msg.set_content(f"Mabuhay paps!\n\nHeto ang iyong OTP Verification Code: {otp_code}\n\n- FinAi Team")
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print(f"SMTP Error: {e}")
        return False

# --- 6. AUTH ENDPOINTS ---
@app.post("/register")
async def register(user: UserSignup):
    existing_user = await db.users.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email na gamit na paps!")
    otp_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    if send_otp_email(user.email, otp_code):
        otp_storage[user.email] = {
            "name": user.name, "password": pwd_context.hash(user.password),
            "otp": otp_code, "timestamp": datetime.utcnow()
        }
        return {"status": "Success", "message": "OTP sent successfully!"}
    raise HTTPException(status_code=500, detail="Failed to send email.")

@app.post("/verify-otp")
async def verify_otp(data: dict):
    email = data.get("email")
    user_otp = data.get("otp")
    if not email or email not in otp_storage:
        raise HTTPException(status_code=400, detail="Walang pending registration paps.")
    stored_data = otp_storage[email]
    if stored_data["otp"] == user_otp:
        new_user = {
            "name": stored_data["name"], "email": email,
            "password": stored_data["password"], "role": "user",
            "created_at": datetime.utcnow()
        }
        result = await db.users.insert_one(new_user)
        del otp_storage[email]
        return {"status": "Success", "user_id": str(result.inserted_id)}
    raise HTTPException(status_code=400, detail="Mali ang OTP code paps.")

@app.post("/login")
async def login(user: UserLogin):
    db_user = await db.users.find_one({"email": user.email})
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
        "status": "Success", "user_id": str(db_user["_id"]), 
        "name": db_user["name"], "email": db_user["email"], "role": db_user.get("role", "user")
    }

@app.post("/verify-pin")
async def verify_pin(data: dict):
    email = data.get("email")
    input_pin = str(data.get("pin"))
    print(f"DEBUG: Backend received email: {email}, pin: {input_pin}")
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.get("pin", "")) == input_pin:
        return {"status": "Success"}
    raise HTTPException(status_code=400, detail="Mali ang PIN mo paps!")

# --- 7. TRANSACTION ENDPOINTS ---
@app.post("/add-expense")
async def add_expense(transaction: TransactionSchema):
    transaction_dict = transaction.dict()
    transaction_dict["created_at"] = datetime.utcnow()
    
    # Siguraduhing naka-save ang goal_id bilang plain string field para madaling hanapin
    if transaction_dict.get("goal_id"):
        transaction_dict["goal_id"] = str(transaction_dict["goal_id"])
        
    # 1. Save the expense
    result = await db.expenses.insert_one(transaction_dict)
    
    # 2. Logic to update Budget
    if transaction.type.lower() == "expense":
        category_doc = await db.categories.find_one({"name": transaction.category})

        if category_doc:
            cat_id = str(category_doc["_id"])
            current_month = datetime.utcnow().strftime("%m-%Y")
            
            # I-check kung may existing budget record
            budget_exists = await db.budgets.find_one({
                "user_id": transaction.user_id,
                "category_id": cat_id,
                "month_year": current_month
            })

            if budget_exists:
                # Kung may budget, i-update ang spent
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

    # 1. Kunin muna ang buong detalye ng expense bago tuluyang burahin para sa integrity checks
    expense = await db.expenses.find_one({"_id": exp_oid})
    if not expense:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # 2. INTEGRATED SYNC CASCADE: Kung may kaakibat na goal_id ang transaction, ibabawas ang safe value sa goal
    goal_id = expense.get("goal_id")
    if goal_id:
        try:
            amount_to_deduct = float(expense["amount"])
            await db.goals.update_one(
                {"_id": ObjectId(goal_id)},
                {"$inc": {"current_savings": -amount_to_deduct}}
            )
            print(f"INTEGRITY SUCCESS: {amount_to_deduct} successfully deducted from Goal {goal_id}")
        except Exception as e:
            print(f"INTEGRITY WARNING: Failed to update linked savings balance -> {e}")

    # 3. Tuluyan nang burahin ang expense sa database logs
    result = await db.expenses.delete_one({"_id": exp_oid})
    if result.deleted_count == 1: 
        return {"status": "Success", "message": "Transaction deleted and goals synchronized!"}
        
    raise HTTPException(status_code=500, detail="Failed to delete from server storage")

# --- 8. ONBOARDING ---
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