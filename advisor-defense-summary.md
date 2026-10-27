# FinAI AI Budget Advisor — Defense Summary

Use this as the short presentation companion to the detailed defense cheatsheet. It summarizes each major logic in plain language; use the detailed sheet and source code for follow-up questions.

## 1. Overall system flow

FinAI first retrieves the signed-in user’s recorded financial data and computes the figures with backend rules. Gemini can turn those verified figures into clear explanations and recommendations; if Gemini is unavailable, the system tries Groq, then uses rule-based guidance. The AI explains the analysis; the financial totals and formulas come from the system’s calculations.

## 2. Transaction data and time periods

The backend groups active, non-goal transactions by date, type, and category, then uses those daily totals to calculate period summaries and trends. It includes several windows, such as today, this week, this month, and year to date. For a fair month-to-month comparison, it compares this month through today with the matching dates in the previous month. Results describe recorded transactions, so missing entries can affect them.

## 3. Budgets and forecasts

For a budget, FinAI compares recorded spending with the available limit and estimates end-of-period spending. The estimate blends the current period’s daily spending pace with the category’s average across the previous 28 calendar days. The system labels forecast confidence based on how much data is available. A forecast is an estimate, not a guarantee.

## 4. Savings goals

For each goal, FinAI calculates the amount remaining and, when the target date is in the future, an approximate monthly saving pace: remaining amount divided by days left, multiplied by 30.4375. It can compare that pace with the user’s reported monthly income baseline. That comparison is only a planning signal; reported income does not show how much money remains after expenses.

## 5. Long-term cash-flow scenarios

FinAI looks at up to 12 completed months with recorded activity, calculates each month’s net cash flow, and presents cautious, typical, and strong scenarios. The backend uses the 25th, 50th, and 75th percentile observations and multiplies them by 12. It requires at least three such months to show scenarios. These are recorded-data cash-flow scenarios, not projected account balances or promises about future results.

## 6. Proactive advice and notifications

The backend can create advice when events indicate a budget threshold or pace concern, a cash-flow deficit or recovery, a notable category increase, or a savings-goal milestone or deadline concern. It uses event keys to avoid repeating the same event and applies a weekly cooldown to signal messages. These are prompts to review recorded data, not judgments about a user’s choices.

## 7. Advisor chat and recommendation safeguards

Chat uses a financial snapshot and recent conversation context to answer supported budgeting and planning questions. Gemini is tried first, Groq is the fallback, and a rule-based reply is used if neither AI provider responds. For Plan Ahead, the backend supplies evidence to the AI and validates recommendations against that evidence; calculation formulas are retained from backend logic rather than trusting model-authored math.

## 8. Financial health score

The score combines three evidence areas: budgets (35 points), goals (30 points), and current-month cash flow (35 points). It is displayed only when at least two areas have usable data, so missing information does not automatically count as good health. It is a summary of recorded app data, not a complete financial assessment.

## 9. Insights and Plan Ahead screens

Insights presents summaries and charts from transaction and budget data already loaded in the app. Plan Ahead requests a fresh planning analysis from the backend and presents the health score, budget allowance when available, recommendations, period totals, and long-term scenarios. The screens serve different purposes: Insights explores recorded activity; Plan Ahead interprets it for planning.

## Short answer for the panel

“FinAI combines rule-based financial calculations with AI-written explanations. The backend calculates budgets, goal pace, and cash-flow patterns from each user’s recorded data; the AI helps explain those results. The app also provides proactive prompts and planning scenarios, while showing that estimates depend on the records available.”

## Corrections to the detailed cheatsheet

- Long-term scenarios are **P25/P50/P75**, not P10/P50/P90. The backend and the Plan Ahead explanation both use 25th/50th/75th percentiles.
- Scenarios require at least **three completed months with recorded activity**, not one.
- The detailed sheet’s “Chat uses the last 365 days” claim is not an exact match for the current code. Chat sets its history start to January 1 of the previous calendar year; avoid quoting a fixed 365-day window unless the implementation is changed or rechecked.

