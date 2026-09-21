from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database import db
from services.budget_service import list_budget_usage
import os
from google import genai
from google.genai import types
from datetime import datetime, timedelta

# 1. Pydantic Schema (Dito na natin ilalagay para isang file na lang)
class ChatHistoryItem(BaseModel):
    sender: str  # 'user' or 'ai' -- matches ChatMessage.sender on the frontend
    text: str

class ChatRequest(BaseModel):
    user_id: str
    message: str
    # FIX: previously every message was sent to the AI with NO memory of prior turns in
    # the same conversation -- each message looked like the very first thing the user
    # ever said. This made the bot feel less like an actual chat and more like a
    # one-shot analysis prompt every time. The frontend now sends recent turns here.
    history: Optional[List[ChatHistoryItem]] = None

# 2. Router & API Key Setup
router = APIRouter(prefix="/advisor", tags=["AI Advisor"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

# Cap how many prior turns get sent, to keep token usage bounded as a conversation grows.
MAX_HISTORY_TURNS = 10


@router.post("/chat")
async def chat_with_advisor(req: ChatRequest):
    if not ai_client:
        raise HTTPException(status_code=500, detail="Gemini API Key is missing.")

    if not req.message or not req.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty.")

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

    # FIX: previously this queried db.budgets directly and read `category_name` and
    # `spent` straight off the raw document -- but raw budget documents never store
    # category_name (that's only resolved at read-time), and `spent` is hardcoded to 0.0
    # at save time (real spending is computed live, never written back). The AI was
    # therefore always seeing every budget as `category: None, spent: 0` -- meaningless
    # for the "predictive analytics" this feature is supposed to provide. Reusing
    # list_budget_usage() gives the AI the same correctly-computed numbers Insights uses.
    budget_usage_list = await list_budget_usage(req.user_id)
    budget_summary = [
        {
            "category": b["category_name"],
            "limit": b["amount"],
            "spent": b["spent"],
            "percentage_used": b["percentage_used"],
            "period": b["period_type"],
        }
        for b in budget_usage_list
    ]

    # Fetch Active Goals
    goals_cursor = db.goals.find({"user_id": req.user_id})
    goals = await goals_cursor.to_list(length=10)
    goal_summary = [{"target": g.get("target_name"), "saved": g.get("current_savings", 0), "goal": g.get("target_amount")} for g in goals]

    # 4. CONTEXT INJECTION & PROMPT ENGINEERING
    # FIX: restraint on small talk is now the FIRST and most forceful directive, instead
    # of being buried under analytics instructions that were written as unconditional
    # commands ("Analyze their burn rate", "Prescribe concrete steps") with no framing
    # of WHEN to do so. The financial context block is also explicitly labeled as
    # "reference only when relevant" rather than presented as the main content to discuss.
    system_instruction = f"""
    You are FinAi Advisor, a friendly financial assistant embedded in a personal finance app.

    HOW TO RESPOND -- READ THIS FIRST:
    1. Respond naturally to exactly what the user says, the way a helpful friend would in
       a real conversation. A greeting gets a greeting back, short and warm -- NOT a
       financial report. Small talk gets small talk back.
    2. Only bring up the user's income, expenses, budgets, or goals when the user's
       message actually asks about them, or when it's clearly and directly relevant to
       what they're asking (e.g. "can I afford a new phone?", "how am I doing this
       month?", "should I worry about my spending?"). If in doubt, don't volunteer it.
    3. When financial analysis IS relevant to the question, you may use these two
       capabilities:
       - Predictive: estimate burn rate, forecast whether they're on track to exceed a
         budget or run short before the period ends, based on recent transactions.
       - Suggestive: give concrete, specific next steps (e.g. "cut Food & Dining to
         PHP 150/day for the rest of the week") rather than generic advice.
    4. Never recite their raw data as a list or dump numbers unprompted. If you use a
       number, weave it into a sentence that explains what it means for them, and only
       when it's actually relevant to what they asked.
    5. Tone: conversational, encouraging, knowledgeable. A natural mix of English and
       Filipino (Taglish) is fine and expected.

    CURRENT USER FINANCIAL CONTEXT (reference ONLY when relevant to directive 2 above --
    do not restate this block or any part of it unprompted):
    - Total Income (last 30 days): PHP {total_income}
    - Total Expense (last 30 days): PHP {total_expense}
    - Category Budgets: {budget_summary}
    - Financial Goals: {goal_summary}
    - Recent Transactions: {[{'date': t.get('date'), 'category': t.get('category'), 'amount': t.get('amount'), 'type': t.get('type')} for t in transactions[:10]]}
    """

    # 5. BUILD MULTI-TURN CONVERSATION
    # FIX: previously `contents=req.message` sent only the current message with no memory
    # of the conversation so far. Now prior turns (capped to MAX_HISTORY_TURNS) are
    # included as real conversation history, so follow-up questions like "what about
    # yesterday?" actually have something to refer back to.
    contents = []
    if req.history:
        for item in req.history[-MAX_HISTORY_TURNS:]:
            role = "model" if item.sender == "ai" else "user"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=item.text)]))
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=req.message)]))

    # 6. EXECUTE GEMINI CALL
    try:
        response = ai_client.models.generate_content(
            model="gemini-3.6-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7
            )
        )
        return {"status": "Success", "reply": response.text}
    except Exception as e:
        print(f"Gemini Chat Error: {e}")
        raise HTTPException(status_code=500, detail="Error communicating with AI Advisor.")