# FinAI — AI-Powered Personal Finance & Expense Tracking Mobile App

FinAI is a cross-platform personal finance mobile application developed as a Bachelor of Science in Information Systems capstone project at Dr. Filemon C. Aguilar Memorial College of Las Piñas. It helps users track daily expenses, automate receipt logging via OCR, and receive predictive budget insights.

## Key Features
- **Automated Receipt Scanning (OCR):** Extracts merchant, date, and transaction items using Google Gemini API with keyword-based category mapping.
- **Predictive Budget Analysis:** Generates spending insights and budget forecasts powered by Groq API with built-in rate-limit handling.
- **Multi-Tier Budget Alerts:** Triggers automated threshold notifications at 70%, 90%, 100%, and over-budget limits.
- **Account & Security Management:** Supports multi-account fund transfers, 4-digit PIN authentication, and chronological admin audit logs.

## Tech Stack
- **Mobile Frontend (`finai-mobile`):** React Native (Expo), TypeScript
- **Backend API (`finai-backend`):** Python, FastAPI (deployed on Google Cloud Run)
- **Database:** MongoDB Atlas
- **AI & OCR Services:** Google Gemini API, Groq API

## Environment Variables
To run the backend locally, create a `.env` file inside the `finai-backend` directory and configure the following keys:

```env
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

## Author & Role
- **John Loyld Estardo** — Lead Frontend & Backend Developer
