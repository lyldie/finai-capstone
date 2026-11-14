# FinAI Defense Cheat Sheet

> **Goal:** Explain what each feature does, the basic logic behind it, and which tools/services implement it. This is a high-level guide, not a line-by-line code walkthrough.

> **How to use this:** Learn the flow in your own words. If a detail is not listed as verified here, avoid claiming it as a completed test or guaranteed result.

## 1. FinAI in one minute

| Topic | Short explanation |
|---|---|
| What is FinAI? | A personal finance mobile app for recording income and expenses, organizing accounts and categories, setting budgets and savings goals, tracking bills, and viewing data-based insights. It also offers AI-assisted receipt scanning, financial chat, and Plan Ahead suggestions. |
| How does a request work? | The Expo mobile app sends an API request to the FastAPI backend. The backend authenticates the user, reads or changes that user's records in MongoDB, applies finance rules/calculations, and returns data for the app to display. AI providers are used for selected language and image tasks. |
| Main design idea | Store financial records as the source of truth; calculate amounts and eligibility in backend code; use AI to interpret or explain selected evidence; let the user review extracted receipt details before saving. |

```text
Expo / React Native app
        │ HTTPS API requests (Axios, JWT bearer token)
        ▼
FastAPI backend ───── MongoDB Atlas (Motor / PyMongo)
        │
        ├── deterministic finance rules and validation
        ├── Gemini / Groq / Vertex AI for selected AI tasks
        ├── email delivery for OTP, password reset, bill reminders
        └── Cloud Run service and scheduled Cloud Run Job
```

## 2. Main tools and what they do

| Area | Tools in the project | Role |
|---|---|---|
| Mobile application | React Native, Expo, Expo Router, TypeScript | Native mobile screens, navigation, camera/gallery access, and Android app packaging. |
| API/backend | Python, FastAPI, Pydantic, Uvicorn | API endpoints, request/response validation, authentication dependencies, and serving the app. |
| Database | MongoDB Atlas, Motor, PyMongo | Persistent user, transaction, account, budget, goal, bill, and notification records; Motor provides asynchronous database access. |
| Authentication | JWT via `python-jose`; password/PIN hashing via `passlib` + bcrypt; Google ID token verification via `google-auth` | Establishes a signed session after login, stores only password/PIN hashes, and validates Google sign-in tokens. |
| AI | Google Gemini, Groq, Vertex AI | AI-assisted receipt extraction, chat responses, and Plan Ahead explanation/recommendation text, with feature-specific provider fallback. |
| Receipt image handling | Expo Camera/Image Picker/Image Manipulator; backend OpenCV, Pillow, NumPy | Captures/selects images, resizes or straightens receipt images, and prepares them for extraction. |
| Charts and input | Gifted Charts, community DateTimePicker, Expo Secure Store, AsyncStorage | Displays financial summaries; selects dates; stores auth/session data on device where supported, with a web storage fallback. |
| Email and scheduled work | SMTP email utility, Cloud Run Job, Cloud Scheduler | Sends account and bill reminder emails; Scheduler triggers the bill reminder job each day. |
| Hosting and configuration | Google Cloud Run, Cloud Build, Secret Manager, environment variables | Builds and runs the backend/job containers and injects configuration/secrets at deployment. |

## 3. Feature-by-feature logic

| Feature | Basic logic | Main tools/services | How to explain it in the defense |
|---|---|---|---|
| Registration | User submits account details; backend validates them, hashes the password, sends an email OTP, then activates the account after OTP verification and returns a signed session token. | Expo forms, FastAPI, Pydantic, bcrypt, MongoDB, SMTP email, JWT | “Registration verifies the email before treating the account as active. We hash the password, then issue a JWT after successful verification.” |
| Login and session | Backend checks the submitted password against its stored hash and returns a signed JWT. Protected API routes verify the bearer token and derive the user identity from it. | FastAPI dependencies, `python-jose`, bcrypt, Expo Secure Store | “JWT is the signed session credential sent with protected requests. It is not the password; password hashing and JWT have different purposes.” |
| Google sign-in | App obtains a Google ID token; backend validates its signature/claims with Google's auth library before creating or matching the app user and issuing the app session. | Native Google Sign-In module, `google-auth`, JWT, MongoDB | “We validate the Google-issued identity token on the server instead of trusting a user-provided email string.” |
| Password reset / OTP | Backend issues a time-limited verification code by email, checks it, then permits password replacement after hashing the new password. | FastAPI, SMTP, MongoDB, bcrypt | “The code proves access to the registered email before changing the credential.” |
| PIN verification | A PIN is checked against its stored hash; it is not stored as readable plaintext. | FastAPI, bcrypt, Expo UI | “The PIN is an additional in-app check. The backend compares hashes rather than saving the PIN itself.” |
| Accounts | User creates and maintains accounts with an initial balance. The displayed balance is derived from the initial balance and related recorded transactions; ownership is scoped to the authenticated user. | Account router, MongoDB, Pydantic | “An account is a container for transactions. Its balance follows the recorded starting balance and transaction history.” |
| Transactions | User records income, expenses, or goal contributions. Backend validates amounts/references, associates records with the authenticated user, and updates relevant account/budget/goal views. Records can be edited, archived/restored, or permanently deleted through separate lifecycle actions. | FastAPI, Pydantic schemas, MongoDB; mobile transaction context | “The backend validates each transaction and ties it to the user's account and category. Archive is reversible; permanent deletion is a separate action.” |
| Categories | Categories organize transactions and budgets. The system supports user-specific category operations as well as restricted admin operations for shared/admin-managed categories. | Categories router, MongoDB, role dependencies | “Categories make transactions easier to organize and summarize. Admin-only operations are protected separately.” |
| Budgets and threshold alerts | User sets a category spending limit. Backend compares recorded expenses with the limit and creates an in-app alert when configured thresholds are crossed; budget summaries are calculated from saved transactions. | Budget router/service, MongoDB, notification records | “Threshold alerts are rule-based: they compare actual recorded spending with a user-set limit. They do not require an AI model.” |
| Insights and charts | The app groups recorded income and expenses into selected time periods and categories, then shows totals and visual comparisons. | Backend summary APIs, React Native, Gifted Charts, date picker | “These charts visualize saved records; they do not independently verify transactions that the user did not enter.” |
| Savings goals | Goal target, saved amount, and target date are used to calculate progress and suggested pace. Contributions are recorded and associated with the goal; goal-linked contributions should not be treated as ordinary spending. | Goals router, transaction data, MongoDB | “The app compares saved progress with the target and time remaining. It shows a pace estimate, not a promise that the goal will be reached.” |
| Fixed/scheduled bills | User saves a bill and due day. The backend creates/updates a monthly occurrence, tracks whether it is paid, and exposes active bills to the app. | Bills router, MongoDB, Asia/Manila date logic | “A fixed bill is a recurring reminder record. Each month's occurrence has its own paid status.” |
| In-app bill reminders | When the notification inbox is requested, the backend refreshes reminders for active, unpaid bills due today through the next three days. Paid, archived, past-due, or out-of-window reminders are suppressed. | Notifications router, fixed bills/occurrences, MongoDB | “The app inbox is refreshed from bill due dates and unpaid occurrences; duplicate reminders are kept under control by stable reminder IDs.” |
| Bill reminder email | A Cloud Scheduler trigger runs the `finai-bill-reminders` Cloud Run Job daily at 9:00 AM Asia/Manila. The job checks eligible upcoming bills and sends reminder email using the configured email service. | Cloud Scheduler, Cloud Run Job, MongoDB, SMTP email utility | “Scheduler starts the job on a timetable; the job performs the bill lookup and sends the email. This is separate from a phone push notification.” |
| Receipt scanning (camera/gallery) | App captures or selects receipt images and sends them to `/ocr-scan`. Backend checks image inputs, can resize/straighten them, asks a vision-capable model to extract merchant/date/total/category, validates/normalizes returned fields, and sends them back to an editable review form before the user saves a transaction. | Expo Camera, Image Picker, Image Manipulator; FastAPI, OpenCV/Pillow; Gemini, Groq, Vertex AI | “OCR is assisted extraction, not an automatic financial truth source. The user reviews the extracted fields before saving.” |
| Receipt OCR provider fallback | The current OCR route tries Gemini first, then Groq, then Vertex AI when configured/available. The route validates the structured result and handles provider failure rather than requiring every provider to succeed. | Gemini API, Groq API, Vertex AI, backend validators | “We have fallback providers to improve availability. Which provider answers is an implementation detail; all extracted amounts still need user review.” |
| Non-receipt images | There is not currently a hard classifier that guarantees a random photo is rejected before model processing. Extraction instructions and validation can reject unusable results, but do not describe this as a strict image-type gate. | OCR prompt and response validation | “We have not implemented a guaranteed non-receipt image block yet, so we treat OCR as a receipt flow and ask the user to verify the result.” |
| Finn financial chat | Backend builds a bounded context from that user's saved financial aggregates and selected recent records, plus relevant budget/goal/bill/Plan Ahead information and a limited conversation history. Some straightforward data questions use deterministic answers; other in-scope questions can be answered with an AI provider. | Advisor router, MongoDB, deterministic helpers, Gemini/Groq/Vertex, mobile chat screen | “Chat combines account context, deterministic calculations for supported questions, and AI for natural-language explanation. It only sees the context the backend supplies.” |
| Plan Ahead | Backend calculates financial evidence from recorded transactions, budgets, goals, and history. It derives estimates/scenarios with explicit data-sufficiency checks; AI is used to select/explain evidence-backed recommendations. Current provider order: Gemini primary → Groq → Gemini backup → Vertex AI. | Advisor router, Python calculations, MongoDB, Gemini, Groq, Vertex AI | “The numeric evidence is computed from stored data first. The model helps phrase and prioritize recommendations; its output is checked against the supplied evidence.” |
| What-if planning | User-specified changes/contributions are applied to current recorded values to show a modeled comparison. | Advisor router, deterministic Python calculations | “What-if results are scenarios based on the values entered, not predictions or guaranteed outcomes.” |
| Proactive finance advice | Backend evaluates selected financial signals after relevant record/budget/goal events and may queue an in-app advisor message. Event keys/cooldowns help avoid repeating the same advice. It is event-driven, not a continuously running monitor. | Backend advisor helpers, deterministic rules, optional AI wording, MongoDB | “It reacts to supported changes and milestones in the system; it does not watch bank accounts in real time.” |
| Notifications inbox | Notifications are saved in the backend, listed for the signed-in user, and can be marked read or cleared from view. The code labels bill reminders as `in_app`. | Notifications router, MongoDB, mobile notification screen | “This is an in-app notification inbox. We should not call it OS push notification unless a push delivery service is separately integrated.” |
| Offline/sync behavior | The mobile app has transaction context and network-status/sync handling for supported flows; explain it as local UI/sync behavior only where you can demonstrate the exact flow on the defense device. | React Native context, network status, AsyncStorage | “The app has client-side state and connectivity handling. I will demonstrate the specific behavior rather than claim every feature is fully offline.” |
| Admin tools and logs | Protected admin routes support selected user/category/account/goal-type management and audit log access. Admin and super-admin operations use role checks. | FastAPI role dependencies, MongoDB, logs router | “Admin routes are separated from normal user routes and checked against the caller's role.” |
| Backup/export and restore | Backend export routes provide the implemented backup/restore functions for app data. Describe the actual exported format and restore scope if asked; do not equate this automatically with a separate disaster-recovery service. | Export router, MongoDB, JSON/data serialization | “This is the application's data export/restore feature. It is distinct from managed database backups unless we configure those separately.” |

## 4. Common panel questions

| Possible question | Defense-ready answer |
|---|---|
| What is JWT? | “JWT is a signed token the backend issues after authentication. The app sends it as a bearer token on protected API requests. The backend verifies it and uses the identity in the token to scope access.” |
| Is JWT encryption? | “Our JWT is used as a signed credential, not as a place to hide sensitive data. We avoid putting secrets in it and protect requests with HTTPS.” |
| Why bcrypt if we already use JWT? | “They solve different problems. Bcrypt hashes passwords/PINs for storage; JWT represents an authenticated session when calling the API.” |
| Is the system fully AI-based? | “No. CRUD, authentication, budget thresholds, transaction summaries, and much of the planning math are deterministic backend logic. AI is used for selected image/language tasks and recommendations.” |
| Can AI change the user's balance? | “The model does not directly write financial records from a chat response. A transaction is saved through the app's normal validated transaction flow after user action.” |
| What happens if Gemini is down? | “The relevant AI feature can try its configured fallback providers. If providers fail, the app can still rely on stored records and supported rule-based calculations, though AI-generated text may be unavailable.” |
| How accurate is receipt scanning? | “It is an assisted extraction feature. We validate the structure and show an editable review step, because printed receipts and image quality vary.” |
| Does Plan Ahead predict the user's exact future balance? | “No. It calculates estimates or recorded-net cash-flow scenarios from available history. It does not guarantee outcomes or account balances.” |
| Where does each user's data separation happen? | “Protected endpoints obtain the user identity from the validated JWT and query/update records using that user ID. Admin operations use separate role dependencies.” |
| Are reminders push notifications? | “The current reminder inbox is in-app, and bill reminder email is a separate scheduled email flow. OS-level push delivery is a different integration.” |
| How does the daily email run? | “Cloud Scheduler sends a timed trigger to the Cloud Run Job. The job checks upcoming bills and sends email. We configured 9:00 AM Philippine time.” |
| Does the app include every bill/debt automatically in safe-to-spend? | “No. Estimates rely on records and supported bill/budget data. Anything the user has not recorded can be missing, so we present it as an estimate.” |
| What is the backend stack? | “Python FastAPI handles APIs and validation; Motor/PyMongo connects asynchronously to MongoDB Atlas; Cloud Run hosts the service.” |
| What is the mobile stack? | “The app uses React Native and Expo, with Expo Router for screens/navigation and Axios for API requests.” |

## 5. Important wording: say this accurately

| Avoid saying | Safer, accurate wording |
|---|---|
| “The receipt scanner always knows if an image is a receipt.” | “It attempts receipt extraction and validates returned fields; we do not currently guarantee a hard pre-check for every non-receipt photo.” |
| “AI calculates all the user's finances.” | “Backend code calculates the numeric metrics from recorded data; AI assists with selected explanations and recommendations.” |
| “Plan Ahead knows the user's future balance.” | “It presents evidence-based estimates and historical cash-flow scenarios; results can change and data may be incomplete.” |
| “Notifications pop up on the phone like push alerts.” | “The current feature is an in-app inbox; scheduled bill emails are sent by a separate backend job.” |
| “It monitors every transaction continuously.” | “Supported backend events trigger selected checks; it is not a live bank monitor.” |
| “All features work offline.” | “Some app state/connectivity handling exists; describe only the offline flows actually demonstrated.” |
| “This has been tested on every phone/provider.” | “We verified the flows we actually exercised. Device/provider coverage depends on the tests performed.” |

## 6. A short end-to-end example

> “When a user records an expense, the mobile app sends it to FastAPI with the user's JWT. The backend validates the amount, category, and account references, saves the record under that user in MongoDB, and refreshes related budget or notification logic. The app then reloads the updated summary. If the user scans a receipt, AI first proposes fields, but the user reviews them before saving.”

## 7. Deployment snapshot to remember

| Component | Current setup |
|---|---|
| Backend API | FastAPI container on Google Cloud Run, region `asia-southeast1`. The latest backend deployment shown in the session was revision `finai-backend-00031-jbc`. |
| Bill reminder worker | Cloud Run Job named `finai-bill-reminders`. |
| Bill reminder trigger | Cloud Scheduler, daily at `09:00`, timezone `Asia/Manila` (`0 9 * * *`). |
| Database | MongoDB Atlas, connection supplied through a managed secret/environment configuration. |
| Mobile package | Expo/React Native Android build; EAS configuration uses an internal preview APK profile. |

## 8. 20-second closing summary

> “FinAI combines a React Native mobile app with a FastAPI and MongoDB backend. Core financial records and calculations are handled by validated backend logic, while AI is used selectively for receipt extraction and conversational or planning explanations. Authentication uses hashed credentials and JWT-protected routes, and reminders use an in-app inbox plus a scheduled email job. We present AI outputs and projections as estimates and keep the user in control of saving financial records.”

