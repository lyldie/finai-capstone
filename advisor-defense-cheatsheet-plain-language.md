# FinAI Advisor Defense Cheatsheet — Plain-Language Guide

This guide explains the main technical ideas in the detailed defense cheatsheet using everyday language and small examples. The examples use made-up amounts to show how the logic works; they are not actual user data.

## 1. How the advisor works

Think of the backend as the calculator and the AI as a helper that explains the results.

1. FinAI gathers the signed-in user's recorded transactions, budgets, and goals.
2. Backend rules calculate totals, comparisons, forecasts, and other evidence.
3. For Plan Ahead and chat, the system can ask Gemini or Groq to write or prioritize guidance using that evidence. If an AI provider is unavailable or gives unusable output, rule-based guidance can still be used.

**Example:** The backend calculates that a category is ₱1,200 over its limit if spending continues at the observed pace. The AI may turn that into a clear explanation and suggestion. It should use the supplied figures; it is not the source of the transaction totals.

This does not mean the app is always online or that a provider always responds. Network, server, database, and provider failures can still occur. AI response limits are instructions and safeguards, not a promise that the service never fails.

## 2. How transaction records become useful numbers

For planning, FinAI groups eligible transactions by date, transaction type, and category, then adds the amounts in each group. It uses those grouped figures to calculate period totals and comparisons.

**Example:** If three recorded Food expenses are ₱100, ₱250, and ₱150 on the same day, that day's Food expense total is ₱500.

Plan Ahead looks back up to 400 days. Chat's history starts on January 1 of the previous calendar year; that is not always exactly 365 days. The system has a processing cap, so it is safer to say it analyzes eligible records within its supported range rather than claiming it always processes every historical record. Archived and goal-linked records are excluded from the relevant planning aggregation.

## 3. Period totals and comparisons

FinAI calculates totals for several time windows, such as today, this week, this month, and year to date. It can compare the current month through today with the same dates in the previous month, adjusting if the earlier month was shorter.

**Example:** If today is the 20th, this month's expenses can be compared with the 1st–20th of last month. That is a fairer comparison than comparing 20 days of records with all 30 or 31 days of last month.

## 4. Budget usage and rollover

Budget usage is spending divided by the **available limit**. If rollover is enabled, the available limit may include unused funds carried from an earlier period. The daily remaining allowance is not allowed to become negative; if the budget is already used up, it displays zero rather than a negative amount.

**Example:** A monthly budget is ₱5,000 and it has ₱500 of eligible rollover. The available limit is ₱5,500. If ₱2,750 has been spent, usage is 50% of ₱5,500.

Rollover is not added forever: it follows the app's period rules and can reset when rollover is off or a period is missing.

## 5. Short-term budget forecast

FinAI estimates period-end spending by combining two clues:

- the user's spending pace so far in the current period; and
- the user's average spending per calendar day in the recent 28-day history for that category.

The recent-history clue gets more influence as more current-period days and active spending days are available. Its influence is capped. Days with no recorded spending count as zero in that historical daily average.

**Example:** A user has spent ₱2,000 in a ₱4,000 budget after 10 days of a 30-day month. The current pace alone suggests ₱6,000 by month end. If recent history is lower, the blended estimate may be lower than ₱6,000. It is still an estimate: a planned large purchase or missing records can change the outcome.

The forecast can be compared with the available budget limit. FinAI also estimates how much remains per day to stay within that limit. That allowance only concerns the particular budget; it does not know about unrecorded bills or expenses.

## 6. Forecast confidence

Confidence describes how much useful history supports a budget estimate. More elapsed days and more days with recorded activity can raise confidence. Limited history or truncated records can lower it.

**Example:** A forecast after two days with only one recorded purchase has little evidence, so confidence may be low. A forecast later in the period with repeated records has more evidence.

“High confidence” does not mean the estimate is guaranteed. It means the calculation has more supporting observations under the app's rules.

## 7. Proactive budget alerts

Some alerts estimate period-end spending using the current average pace: current spend ÷ elapsed days × total period days. The system does not evaluate this as a constant live monitor; backend events such as relevant budget or transaction actions trigger checks. Conditions and a cooldown help prevent repeated messages.

One budget warning is considered only after a minimum amount of the period has elapsed, when the budget limit is positive, current use is below 90%, and the estimate exceeds 110% of the limit. The precise minimum elapsed days depends on period length. A seven-day cooldown can also suppress another budget or signal message.

**Example:** A user has used 60% of a budget early in the period. If the pace-based estimate is 115% of the limit and the other conditions are satisfied, FinAI may send a warning. It may not warn if there is too little elapsed time or a recent related message was already sent.

## 8. Savings goals and required monthly pace

For a goal with a future target date, FinAI calculates the amount still needed and a suggested monthly contribution pace:

**remaining amount ÷ days until target × 30.4375 days per average month.**

**Example:** A goal has ₱6,000 left and is due in about 60 days. The suggested pace is approximately ₱3,044 per month. The app can compare this with reported monthly income if that amount is positive.

That comparison is only a warning signal. It is not a complete affordability check because it does not subtract all living expenses, bills, or other commitments from income. A deadline message also depends on conditions such as the goal still needing money and its due date being near.

## 9. Long-term cash-flow scenarios

FinAI looks at up to 12 completed months that have recorded activity. It needs at least three such months before scenarios are available. It sorts the monthly net cash-flow values from lower to higher, then selects representative values near the 25th, 50th, and 75th percentile positions:

- **Cautious (25th percentile):** a value toward the lower end of the recorded months.
- **Typical (50th percentile):** the median, or middle value—not the most common value.
- **Strong (75th percentile):** a value toward the higher end.

Each selected monthly value is multiplied by 12 to make a 12-month net-change scenario.

**Example:** If monthly net values are −₱2,000, ₱1,000, ₱3,000, ₱4,000, and ₱9,000, the middle value is ₱3,000. The cautious, typical, and strong selections are around the lower, middle, and higher portions of this ordered list. Multiplying a selected ₱3,000 monthly value by 12 gives a +₱36,000 scenario.

These are illustrations based on past recorded net cash flow—not predictions of a bank balance, probabilities, or guarantees. With only a few months, one unusual month can have a large effect. Also, the detailed sheet's P10/P50/P90 wording should be corrected to P25/P50/P75.

## 10. Spending-pattern comparisons

Plan Ahead can flag a category when spending so far this month is notably higher than the average for matching dates in earlier months. It needs at least two prior matching periods with recorded expenses. The prior average must be at least ₱500, and the increase must be at least both ₱500 and 35%.

**Example:** If recorded Food spending through the 15th is ₱2,000 this month, and the average through the 15th in two prior months was ₱1,400, the increase is ₱600, or about 43%. That meets the amount and percentage rise conditions. The system reports a change in recorded spending; it does not know why it changed.

## 11. Financial health score and “safe to spend”

The financial health score combines three areas:

- budget status: 35%;
- savings goals: 30%;
- cash flow: 35%.

The score is shown only when at least two areas have enough evidence. The labels map score ranges to plain-language status. For example, a score is not a complete assessment of a person's finances; it summarizes only the data the app has.

**Example:** If there is budget and cash-flow data but no goal data, the app can still show a score because two areas have evidence. The goal indicator can say there is no data yet.

“Safe to spend today” picks the tightest daily allowance among qualifying budgets—ones with days remaining that are forecast over limit or at least 50% used. It is limited to those budgets; it does not account for unrecorded bills, debt, or every other spending need.

## 12. Chat and provider fallback

When the user chats with the advisor, the backend prepares a financial-data snapshot and recent conversation context, checks whether the request is within the finance-advice scope, and then tries the configured AI services. If those services cannot produce a usable answer, a rule-based response may be used.

**Example:** “How much did I spend on Food this month?” is a finance-related question the snapshot can support. A request about an unrelated topic may be redirected. Greetings and short follow-ups can still be accepted.

The scope check is ordinary application logic, not a perfect classifier. The history cap is up to ten messages, not ten full back-and-forth conversations. The prompt's preferred response length is not an absolute guarantee. A server, database, or network problem can still result in an error.

## 13. Proactive messages and duplicate prevention

The advisor has several event-triggered checks, including budget pace, goal milestones, approaching goal deadlines, goal pace compared with reported income, cash-flow conditions, and category spending changes. It is better to describe these as conditional event checks than as ten always-running monitors.

**Example:** When a user adds a contribution that moves a goal past a milestone, the system can create a milestone message. It reports the highest newly crossed milestone for that contribution, rather than necessarily sending a separate message for every milestone crossed at once.

Cooldown checks and unique event keys reduce duplicate messages. The seven-day suppression applies to budget and signal advisor messages. Some check-ins use a weekly key. These controls reduce repeats; they do not mean duplicate delivery or notification failures are impossible in every situation.

## 14. Financial Insights screen

The Insights screen presents recorded financial activity in selectable time views. It can show income, expenses, net cash flow, charts, category breakdowns, budget progress, and savings-goal progress.

- The week view groups data into seven Monday-to-Sunday days.
- The month view uses six week buckets (W1–W6).
- The year view uses twelve months of the current year.
- The category chart uses colors, but its slices do not each show a label; the legend lists up to six categories and may indicate more.
- Budget cards show spend, limit, remaining amount, and progress. They do not show days remaining.
- Goal cards show saved-versus-target progress and allow contributions through the app.

These views use transaction data synchronized through the app's context. They do not call the Advisor planning endpoint directly, but it would be inaccurate to say the screen makes no backend/API calls at all.

**Example:** A user can select the month view, see income and spending totals, inspect category shares, and compare budget progress. A category beyond the first six may be summarized as “more” in the legend.

## 15. Plan Ahead screen

Plan Ahead calls the `/advisor/planning` endpoint. It can show financial health, a daily allowance, recommendation cards, goal progress, period totals, optional trends, budget outlook, and long-term scenarios when sufficient data exists.

Recommendations are ordered by urgency: alerts, watch items, goals, and then general planning. AI-generated results may contain up to five recommendations; a rule-based fallback can contain more, up to ten. Model prompts request short titles and messages, but those requested word or character limits should not be presented as exact guarantees.

**Example:** If a budget is at risk, that alert appears before a general planning suggestion. Tapping “How we calculated this” can show figures or an explanation when the recommendation provides them.

One code detail to remember: the long-term scenario card correctly explains the 25th/50th/75th percentile method. A separate recommendation calculation string currently describes average monthly net × 12, which does not generate those three scenario values. Treat those as two different calculations, and avoid using that recommendation string to explain the scenarios.

## 16. Simple overall defense answer

> “FinAI uses backend rules to calculate totals and financial evidence from a user's recorded data. It can estimate budget period-end spending, suggest a monthly savings pace for goals, compare spending trends, and show cautious, typical, and strong long-term cash-flow scenarios when enough history is available. Gemini or Groq can help explain the evidence and provide recommendations, with rule-based guidance as a fallback. These results are estimates based on recorded data, not guarantees.”

## Terms in simple words

- **Net cash flow:** recorded income minus recorded expenses for a period.
- **Forecast:** an estimate of what may happen if an observed pattern continues.
- **Percentile:** a position in a list sorted from lower to higher; the 50th percentile is the median.
- **Median:** the middle value in a sorted list. It is not necessarily the most frequently occurring value.
- **Evidence:** the calculated figures the recommendation is based on.
- **Rollover:** eligible unused budget funds carried into a later budget period.
- **Rule-based fallback:** guidance produced by programmed conditions when AI is unavailable or unusable.
- **Event-triggered:** checked when an app/backend action occurs, rather than continuously watched every second.
