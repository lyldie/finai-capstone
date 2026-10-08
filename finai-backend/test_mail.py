"""Send a test message using credentials from finai-backend/.env."""

import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
RECEIVER_EMAIL = os.getenv("EMAIL_TEST_RECIPIENT", "")


def send_test() -> None:
    if not EMAIL_SENDER or not EMAIL_PASSWORD or not RECEIVER_EMAIL:
        print("Set EMAIL_SENDER, EMAIL_PASSWORD, and EMAIL_TEST_RECIPIENT in .env first.")
        return

    message = EmailMessage()
    message["Subject"] = "FinAI email delivery test"
    message["From"] = EMAIL_SENDER
    message["To"] = RECEIVER_EMAIL
    message.set_content("This is a test message from FinAI.")

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(message)
        print("Test email sent successfully.")
    except Exception as exc:
        print(f"Email test failed ({type(exc).__name__}). Check the mail settings and try again.")


if __name__ == "__main__":
    send_test()