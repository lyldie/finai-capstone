"""Email delivery helpers. SMTP credentials are loaded from backend .env."""

import os
import random
import smtplib
import string
from email.message import EmailMessage
from html import escape
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")


def _send(msg: EmailMessage) -> bool:
    if not EMAIL_SENDER or not EMAIL_PASSWORD:
        return False
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as exc:
        print(f"Email delivery failed: {exc}")
        return False


def send_otp_email(target_email: str) -> str | None:
    """Send a generated verification code and return it only after successful delivery."""
    otp_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    msg = EmailMessage()
    msg["Subject"] = "FinAI - Verify Your Account"
    msg["From"] = EMAIL_SENDER
    msg["To"] = target_email
    msg.set_content(
        "Thanks for registering with FinAI. Use this code to verify your email: "
        f"{otp_code}\n\nThe code expires in 10 minutes."
    )
    return otp_code if _send(msg) else None


def send_threshold_alert(
    target_email: str,
    category: str,
    threshold: int,
    spent: float,
    limit_amount: float,
    period_type: str,
) -> bool:
    """Send one factual email for a newly crossed budget threshold."""
    msg = EmailMessage()
    msg["Subject"] = f"FinAI budget alert: {threshold}% used"
    msg["From"] = EMAIL_SENDER
    msg["To"] = target_email
    msg.set_content(
        f"Your {category} {period_type} budget is {threshold}% used "
        f"(PHP {spent:.2f} of PHP {limit_amount:.2f}). Open FinAI to review your spending."
    )
    safe_category = escape(category)
    msg.add_alternative(
        f"""<html><body style="font-family:Arial,sans-serif">
        <h2>FinAI budget alert</h2>
        <p>Your <strong>{safe_category}</strong> {period_type} budget is <strong>{threshold}%</strong> used.</p>
        <p>PHP {spent:.2f} of PHP {limit_amount:.2f}</p>
        <p>Open FinAI to review your spending.</p>
        </body></html>""",
        subtype="html",
    )
    return _send(msg)
