from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import db
import os
from google import genai
from google.genai import types
from datetime import datetime, timedelta

# 1. Pydantic Schema (Dito na natin ilalagay para isang file na lang)
class ChatRequest(BaseModel):
    user_id: str
    message: str

# 2. Router & API Key Setup
router = APIRouter(prefix="/advisor", tags=["AI Advisor"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

@router.post("/chat")
async def chat_with_advisor(req: ChatRequest):
    if not ai_client:
        raise HTTPException(status_code=500, detail="Gemini API Key is missing.")

    # 3. GATHER DATA CONTEXT (Kukunin ang data ng user for the last 30 days)
    thirty_days_ago = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")

    # Fetch Transactions
    expenses_cursor = db.expenses.find({
        "user_id": req.user_id,
        "date": {"$gte": thirty_days_ago}
    }).sort("date", -1)
    transactions = await expenses_cursor.to_list(length=50) # Limit to 50 para di maubos token limit

    total_income = sum(float(t.get("amount", 0)) for t in transactions if t.get("type") == "Income")
    total_expense = sum(float(t.get("amount", 0)) for t in transactions if t.get("type") == "Expense")

    # Fetch Active Budgets
    budgets_cursor = db.budgets.find({"user_id": req.user_id})
    budgets = await budgets_cursor.to_list(length=20)
    budget_summary = [{"category": b.get("category_name"), "limit": b.get("amount"), "spent": b.get("spent", 0)} for b in budgets]

    # Fetch Active Goals
    goals_cursor = db.goals.find({"user_id": req.user_id})
    goals = await goals_cursor.to_list(length=10)
    goal_summary = [{"target": g.get("target_name"), "saved": g.get("current_savings", 0), "goal": g.get("target_amount")} for g in goals]

    # 4. CONTEXT INJECTION & PROMPT ENGINEERING
    system_instruction = f"""
    You are FinAi Advisor, a highly analytical, empathetic, and professional financial assistant for a mobile app. 
    Your core capability is providing 'Suggestive and Predictive Analytics' based on user data.

    CURRENT USER CONTEXT (Last 30 Days):
    - Total Income: PHP {total_income}
    - Total Expense: PHP {total_expense}
    - Category Budgets: {budget_summary}
    - Financial Goals: {goal_summary}
    - Recent Transactions: {[{'date': t.get('date'), 'category': t.get('category'), 'amount': t.get('amount'), 'type': t.get('type')} for t in transactions[:10]]}

    YOUR DIRECTIVES:
    1. Predictive Analytics: Analyze their burn rate. Forecast if they will exceed their budgets or run out of funds before the month ends based on their recent transactions.
    2. Suggestive Analytics: Prescribe concrete, actionable steps. Tell them exactly where to cut back (e.g., "Limit your Food & Dining expenses to PHP 150/day") or how to reallocate funds to reach their goals faster.
    3. Tone: Conversational, encouraging, and knowledgeable. You may use a natural mix of English and Filipino (Taglish) to sound authentic and approachable.
    4. Focus solely on answering the user's prompt using the injected data. Do not list out their raw data unless explaining a calculation.
    """

    # 5. EXECUTE GEMINI CALL
    try:
        response = ai_client.models.generate_content(
            model="gemini-3.6-flash", 
            contents=req.message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7 
            )
        )
        return {"status": "Success", "reply": response.text}
    except Exception as e:
        print(f"Gemini Chat Error: {e}")
        raise HTTPException(status_code=500, detail="Error communicating with AI Advisor.")