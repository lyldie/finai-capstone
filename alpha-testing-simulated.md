# FinAI Alpha Testing Log — Simulated Example

> **Important:** This is a hypothetical sample for planning and formatting only. No testing sessions, participants, dates, or results in this document are real. Replace the simulated outcomes with observed evidence before describing alpha testing as completed.

## Test overview

| Item | Description |
|---|---|
| Testing type | Alpha testing (simulated example) |
| Duration | Three weeks |
| Product | FinAI mobile application and supporting backend |
| Participants | Simulated tester roles; use consenting testers and test accounts for real testing |
| Test data | Synthetic transactions, budgets, goals, and accounts; do not use real credentials or financial data |
| Result labels | “Simulated pass/fail” are illustrative outcomes, not measurements or evidence |

## Three-week coverage plan

| Week | Focus | Scope covered |
|---|---|---|
| 1 | Access, onboarding, and core records | Sign-up, OTP, login, password recovery, session, profile setup, accounts, income and expense records, contribution editing |
| 2 | Budgeting and financial insights | Category limits, weekly/monthly/annual periods, goals, scheduled bills, cash flow, savings progress, budget adherence, date filters, alerts |
| 3 | Smart features, reliability, and device usability | Receipt OCR, AI advisor/planning, offline behavior and sync, email/in-app notifications, keyboard behavior, navigation/safe areas, logout |

## Simulated test cases

### Week 1 — Access and core records

| Case | Feature / scenario | Test steps | Expected result | Simulated outcome | Status |
|---|---|---|---|---|---|
| W1-01 | New account registration | Submit valid details, verify the email code, and finish initial profile setup. | Account is created once, profile data is saved, and the user reaches the intended signed-in destination. | Registration completes and the user reaches the dashboard. | Simulated pass |
| W1-02 | Existing email during registration | Try registering with an email already attached to an account. | The app gives a clear, non-generic message and offers a path to sign in or recover access without exposing account-sensitive details unnecessarily. | Existing-account guidance is shown; tester can continue to sign-in/recovery. | Simulated pass |
| W1-03 | OTP entry and app switching | Open the OTP screen, switch to an email app, return without force-closing FinAI, and enter the code. | The OTP screen and entered form state remain available after ordinary app switching. | OTP screen remains open and code can be entered. | Simulated pass |
| W1-04 | Incorrect login password | Enter a registered test email with an incorrect password. | Sign-in is denied and a clear error is shown; no authenticated session is created. | “Incorrect email or password” guidance appears; user stays signed out. | Simulated pass |
| W1-05 | Password recovery | Start recovery for a test account, enter the emailed code, and set a new password. | A code is sent to the account email; a valid code permits password reset, and the new password can be used to sign in. | Recovery completes and new password works. | Simulated pass |
| W1-06 | Empty required fields | Submit registration or login with required fields blank. | Submission is blocked and the missing fields are identified clearly. | Required-field guidance appears; no request creates an account or session. | Simulated pass |
| W1-07 | Account creation and type | Add a test bank account and a test e-wallet account, then review their displayed types. | Both accounts save with the selected type and remain distinguishable in account views. | Both test accounts appear with their selected types. | Simulated pass |
| W1-08 | Income and expense CRUD | Create an income and an expense, open each record, edit permitted fields, then delete a test record. | Saved values persist and totals update consistently after edits/deletion. | Records and totals reflect each change. | Simulated pass |
| W1-09 | Contribution edit and goal progress | Add a contribution to a test goal, edit its amount/date, and review progress. | The contribution is updated once and goal progress recalculates from the revised amount. | Updated contribution and progress are displayed. | Simulated pass |
| W1-10 | Session persistence and logout | Sign in, navigate away and return; then log out. | A valid session remains available across normal navigation; logout clears the session and returns directly to signed-out UI. | Session persists before logout; logout immediately returns to sign-in. | Simulated pass |

### Week 2 — Budgets, goals, and Insights

| Case | Feature / scenario | Test steps | Expected result | Simulated outcome | Status |
|---|---|---|---|---|---|
| W2-01 | Category limit by period | Create test limits for a category using weekly, monthly, and annual periods. | Each limit saves with the selected period and amount; usage is calculated for the matching period. | Each period displays its own limit and usage. | Simulated pass |
| W2-02 | Budget warning thresholds | Add test expenses that take usage across 70%, 90%, 100%, then above 100% of a limit. | The appropriate awareness alert is produced at each configured threshold without confusing the user about the amount used. | Warning, critical, limit, and over-budget states appear at their respective thresholds. | Simulated pass |
| W2-03 | Month boundary and limit persistence | Review a category limit before and after changing the selected month. | Period usage reflects the selected month while the configured recurring limit remains available according to its period. | New-month usage resets for the period; configured limit remains. | Simulated pass |
| W2-04 | Goal create and update | Create a goal with a name, target amount, and target date; edit it and record a contribution. | Goal details save, and progress reflects contributions against the target. | Updated goal and progress are displayed. | Simulated pass |
| W2-05 | Scheduled bill creation and paid flow | Create a test bill, mark it paid, and review the transaction ledger and account balance. | The app records payment consistently with the product’s defined flow, avoids duplicate expenses on repeated taps, and shows the resulting balance/transaction clearly. | One payment expense is recorded; repeat action does not duplicate it. | Simulated pass |
| W2-06 | Due-bill reminder | Create an unpaid bill due within the reminder window and review the Home/dashboard reminder. | A relevant upcoming or overdue bill is visible, with a clear route to the bills list. | Reminder appears with bill and due-date details. | Simulated pass |
| W2-07 | Cash flow KPI | Select a period containing known synthetic income and expenses. | Cash flow equals recorded income minus recorded expenses for the selected period and is labeled as a period estimate/total, not account balance. | Displayed value matches the seeded records and selected dates. | Simulated pass |
| W2-08 | Budget adherence KPI | Select a period with active category budgets and known spending. | Budget usage/adherence uses the selected period’s budgets and expenses and explains the displayed percentage/amount. | KPI matches the seeded totals and shows a readable supporting label. | Simulated pass |
| W2-09 | Savings progress KPI | Add goal contributions and change the Insights period selector. | Goal progress is presented with a clear time basis; all-time goal progress is not misleadingly presented as if it were limited to the selected chart period. | Goal progress remains clearly identified as goal progress, with its time basis stated. | Simulated pass |
| W2-10 | Week/month/year and custom date filters | Switch among week, month, year, and a valid custom date range; inspect chart summaries and KPIs. | All applicable summaries update consistently; invalid ranges (end before start or future dates, where disallowed) are prevented or explained. | Period changes update the view; invalid range is rejected with guidance. | Simulated pass |
| W2-11 | Category chart and empty state | Review income and spending by category with records, then with a period containing no records. | Category totals match transactions; empty periods show a helpful empty state without broken chart layout. | Totals match; empty state renders cleanly. | Simulated pass |

### Week 3 — OCR, AI, sync, notifications, and usability

| Case | Feature / scenario | Test steps | Expected result | Simulated outcome | Status |
|---|---|---|---|---|---|
| W3-01 | Receipt OCR with clear receipt | Scan a clear printed test receipt and review extracted merchant, date, amount, and category before saving. | Extracted values are presented for user review; saving requires an intentional confirmation and does not silently create a transaction. | Fields are populated and can be reviewed before saving. | Simulated pass |
| W3-02 | Receipt OCR with unclear fields | Scan a blurred or handwritten sample with at least one ambiguous value. | Uncertain fields are flagged for review; the app does not claim an unsupported confidence percentage or silently treat guesses as verified. | Ambiguous values remain editable and are marked for review. | Simulated pass |
| W3-03 | AI advisor response | Ask a test question about synthetic spending data. | The advisor responds with relevant available data, handles missing data honestly, and provides usable suggestions without changing records without confirmation. | Response uses seeded data and leaves records unchanged. | Simulated pass |
| W3-04 | Planning/scenario explanation | Run a planning or spending scenario with a known test input. | The result is understandable, describes assumptions, and does not present a scenario as a guaranteed outcome. | Scenario result and assumptions are visible. | Simulated pass |
| W3-05 | Offline record and later sync | Go offline, add a test transaction, reconnect, and review the ledger. | The app retains the pending record, syncs it once after reconnection, and shows sync status. | Pending record syncs once and appears in the ledger. | Simulated pass |
| W3-06 | Invalid queued change during sync | Queue multiple test changes offline, including one invalid item, then reconnect. | A failed item is identifiable and recoverable; later valid items are not silently lost or permanently blocked without an actionable status. | Invalid item is surfaced for review; valid queued items continue or can be retried. | Simulated pass |
| W3-07 | Spending activity notification | Seed comparable weekly category spending that meets the configured increase criteria, then run the alert check. | In-app alert follows the configured comparison rule, appears once for the relevant category/period, and explains the comparison. | One alert appears with current spending, baseline, and increase details. | Simulated pass |
| W3-08 | Spending activity email | For a test account that meets the same alert criteria, trigger the alert and inspect the email. | One readable email explains current spending, usual baseline, increase amount/percentage, and comparison basis; no email is sent when criteria are not met. | Test email contains the four explanatory elements and is not duplicated. | Simulated pass |
| W3-09 | Chat composer with Android keyboard | On Android, open Chat with Finn, focus the message field, type multiple lines, and scroll/send. | Composer stays visible above the keyboard, typed text remains readable, and send controls remain usable. | Composer remains visible and text can be reviewed and sent. | Simulated pass |
| W3-10 | Bottom navigation and system navigation | Check the app on Android gesture navigation and three-button navigation, including a smaller screen. | App navigation remains above system navigation; controls are tappable and content is not obscured by insets. | Bottom tabs and screen actions remain clear and tappable. | Simulated pass |
| W3-11 | Search and filters | Search a test transaction using merchant/category and a unique word in its note; combine with date/type filters. | Search and filters return only matching records, including notes if supported by the product, and can be cleared. | Matching record appears; clearing filters restores the list. | Simulated pass |
| W3-12 | App background/return and form state | Enter unsent text or partially complete a form, switch apps briefly, then return without force-closing FinAI. | The current screen and unsent/entered form state remain available after ordinary app switching, subject to OS process retention. | Screen and entered text remain available in the simulated run. | Simulated pass |

## Sample summary format (not a real finding)

For a real alpha test, summarize only the evidence collected. A suitable format is:

- **Planned cases:** 33
- **Executed cases:** [enter actual count]
- **Passed:** [enter actual count]
- **Failed:** [enter actual count]
- **Blocked / not tested:** [enter actual count]
- **Issues recorded:** [list issue IDs and observed behavior]
- **Retest results:** [record the build/version and observed retest outcome]

Do not use the simulated pass labels above as real test results. Record the app build/version, device/OS, test date, reproducible steps, and evidence for every actual issue. Use participant codes (for example, T01) in shared reports instead of names or email addresses.
