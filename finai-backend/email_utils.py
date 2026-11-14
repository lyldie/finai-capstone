"""Email delivery helpers. SMTP credentials are loaded from backend .env."""

import os
import secrets
import smtplib
from email.message import EmailMessage
from html import escape
from pathlib import Path
from email.utils import formataddr

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
BRAND_GREEN = "#1c3c36"
BRAND_GOLD = "#edb232"
MUTED = "#60736d"


def _set_sender(msg: EmailMessage) -> None:
    msg["From"] = formataddr(("FinAI", EMAIL_SENDER)) if EMAIL_SENDER else "FinAI"


def _email_shell(title: str, content: str, preheader: str = "") -> str:
    """Shared, table-based layout that stays readable in common email clients."""
    safe_title = escape(title)
    safe_preheader = escape(preheader)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4ee;font-family:Arial,Helvetica,sans-serif;color:#263a35">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">{safe_preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f4ee;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
        <tr><td style="background:{BRAND_GREEN};padding:22px 28px;border-bottom:5px solid {BRAND_GOLD}">
          <div style="font-size:22px;line-height:28px;font-weight:700;letter-spacing:.2px;color:#ffffff">FinAI</div>
          <div style="font-size:12px;line-height:18px;color:#dce9e4">Money clarity, one step at a time</div>
        </td></tr>
        <tr><td style="padding:28px">{content}</td></tr>
        <tr><td style="padding:16px 28px 22px;border-top:1px solid #edf0ec;color:{MUTED};font-size:12px;line-height:18px">
          This is an automated message from FinAI. Please don’t reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _send(msg: EmailMessage) -> bool:
    if not EMAIL_SENDER or not EMAIL_PASSWORD:
        return False
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as exc:
        # SMTP exception text can include connection/account details; keep the
        # operational log useful without exposing credential-related metadata.
        print(f"Email delivery failed ({type(exc).__name__}).")
        return False


def send_otp_email(target_email: str, otp_code: str | None = None) -> str | None:
    """Send an email verification code and return it only after successful delivery."""
    otp_code = otp_code or f"{secrets.randbelow(1_000_000):06d}"
    msg = EmailMessage()
    msg["Subject"] = "Verify your FinAI email"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        "Hello,\n\n"
        f"Your FinAI email verification code is {otp_code}.\n\n"
        "This code expires in 10 minutes. If you did not request this code, you can ignore this email.\n\n"
        "FinAI Support"
    )
    content = f"""
      <h1 style="margin:0 0 12px;color:{BRAND_GREEN};font-size:24px;line-height:30px">Verify your email</h1>
      <p style="margin:0 0 20px;color:#435650;font-size:15px;line-height:23px">Enter this code in FinAI to finish creating your account.</p>
      <div style="margin:0 0 20px;padding:18px 12px;background:#f7f3e7;border:1px solid #efe2bd;border-radius:12px;text-align:center">
        <div style="margin-bottom:7px;color:{MUTED};font-size:11px;font-weight:700;letter-spacing:1.2px">VERIFICATION CODE</div>
        <div style="color:{BRAND_GREEN};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px">{escape(otp_code)}</div>
      </div>
      <p style="margin:0 0 14px;color:#435650;font-size:14px;line-height:21px"><strong>This code expires in 10 minutes.</strong></p>
      <p style="margin:0;color:{MUTED};font-size:13px;line-height:20px">If you didn’t request this code, you can safely ignore this email. Never share your code with anyone.</p>
    """
    msg.add_alternative(_email_shell("Verify your email", content, "Your FinAI verification code expires in 10 minutes."), subtype="html")
    return otp_code if _send(msg) else None


def send_password_reset_otp_email(target_email: str, otp_code: str) -> bool:
    """Send a one-time password reset code to an existing account email."""
    msg = EmailMessage()
    msg["Subject"] = "Reset your FinAI password"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        "Hello,\n\n"
        f"Your FinAI password reset code is {otp_code}.\n\n"
        "This code expires in 10 minutes and can only be used once. If you did not request a password reset, "
        "you can ignore this email. Do not share this code with anyone.\n\n"
        "FinAI"
    )
    content = f"""
      <h1 style="margin:0 0 12px;color:{BRAND_GREEN};font-size:24px;line-height:30px">Reset your password</h1>
      <p style="margin:0 0 20px;color:#435650;font-size:15px;line-height:23px">Enter this code in FinAI to choose a new password.</p>
      <div style="margin:0 0 20px;padding:18px 12px;background:#f7f3e7;border:1px solid #efe2bd;border-radius:12px;text-align:center">
        <div style="margin-bottom:7px;color:{MUTED};font-size:11px;font-weight:700;letter-spacing:1.2px">PASSWORD RESET CODE</div>
        <div style="color:{BRAND_GREEN};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px">{escape(otp_code)}</div>
      </div>
      <p style="margin:0 0 14px;color:#435650;font-size:14px;line-height:21px"><strong>This code expires in 10 minutes and works once.</strong></p>
      <p style="margin:0;color:{MUTED};font-size:13px;line-height:20px">If you did not request a reset, ignore this email. Never share your code.</p>
    """
    msg.add_alternative(_email_shell("Reset your password", content, "Your FinAI password reset code expires in 10 minutes."), subtype="html")
    return _send(msg)


def send_password_change_notice(target_email: str) -> bool:
    """Notify an account owner after their password has been changed."""
    msg = EmailMessage()
    msg["Subject"] = "Your FinAI password was changed"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        "Hello,\n\n"
        "The password for your FinAI account was changed successfully.\n\n"
        "If you made this change, no further action is needed. If you did not, "
        "secure your email account and contact the FinAI support team.\n\n"
        "FinAI Support"
    )
    content = f"""
      <h1 style="margin:0 0 12px;color:{BRAND_GREEN};font-size:24px;line-height:30px">Password changed</h1>
      <p style="margin:0 0 16px;color:#435650;font-size:15px;line-height:23px">The password for your FinAI account was changed successfully.</p>
      <div style="padding:14px 16px;background:#f7f3e7;border-left:4px solid {BRAND_GOLD};border-radius:8px;color:#435650;font-size:14px;line-height:21px">If you made this change, no further action is needed. If you didn’t, secure your email account and contact the FinAI team.</div>
    """
    msg.add_alternative(_email_shell("Password changed", content, "Your FinAI account password was changed."), subtype="html")
    return _send(msg)


def send_threshold_alert(
    target_email: str,
    category: str,
    threshold: int,
    spent: float,
    limit_amount: float,
    period_type: str,
    percentage_used: float | None = None,
) -> bool:
    """Send one factual email for a newly crossed budget threshold."""
    msg = EmailMessage()
    display_percentage = percentage_used if percentage_used is not None else threshold
    over_budget = threshold == 101
    subject = "budget exceeded" if over_budget else "budget alert"
    msg["Subject"] = f"FinAI {subject}: {display_percentage:.0f}% used"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        (f"Your {category} {period_type} budget has been exceeded: " if over_budget else
         f"Your {category} {period_type} budget is at {display_percentage:.0f}%: ")
        + f"PHP {spent:.2f} of PHP {limit_amount:.2f} ({display_percentage:.2f}% used). "
        + ("You can continue recording expenses; this is an advisory alert. " if over_budget else "")
        + "Open FinAI to review your spending."
    )
    safe_category = escape(category)
    safe_period = escape(period_type)
    title = "Budget limit reached" if over_budget else "Budget alert"
    amount_line = f"₱{spent:,.2f} of ₱{limit_amount:,.2f}"
    advisory = "You can continue recording expenses. This alert is here to help you keep track." if over_budget else "Open FinAI to review your spending and budget."
    msg.add_alternative(
        _email_shell(
            title,
            f"""
              <div style="display:inline-block;margin-bottom:14px;padding:6px 10px;background:#f7f3e7;border-radius:20px;color:{BRAND_GREEN};font-size:12px;font-weight:700">{display_percentage:.0f}% of budget</div>
              <h1 style="margin:0 0 10px;color:{BRAND_GREEN};font-size:24px;line-height:30px">{escape(title)}</h1>
              <p style="margin:0 0 18px;color:#435650;font-size:15px;line-height:23px">Your <strong>{safe_category}</strong> {safe_period} budget is <strong>{display_percentage:.2f}% used</strong>.</p>
              <div style="margin:0 0 18px;padding:16px;background:#f7f8f5;border-radius:12px;color:{BRAND_GREEN};font-size:20px;line-height:26px;font-weight:700">{amount_line}</div>
              <p style="margin:0;color:{MUTED};font-size:14px;line-height:21px">{escape(advisory)}</p>
            """,
            f"{safe_category} budget is {display_percentage:.0f}% used.",
        ),
        subtype="html",
    )
    return _send(msg)


def send_spending_activity_alert(
    target_email: str,
    category: str,
    current_spend: float,
    usual_spend: float,
    increase_amount: float,
    increase_percent: float,
) -> bool:
    """Email a factual weekly spending-pattern alert with its comparison basis."""
    safe_category = escape(str(category or "This category"))
    subject_category = " ".join(str(category or "this category").split())[:80]
    msg = EmailMessage()
    msg["Subject"] = f"FinAI spending activity: {subject_category} is above its usual pace"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        f"Your {category} spending so far this week is PHP {current_spend:,.2f}, "
        f"compared with your usual PHP {usual_spend:,.2f} for the same days of the week. "
        f"That is PHP {increase_amount:,.2f} ({increase_percent:.0f}%) higher. "
        "FinAI compares this week's Monday-through-today spending with the median of up to four "
        "previous comparable weeks and sends this alert only when the increase is at least 30% "
        "and PHP 150. Review your recent transactions and budget in FinAI if useful."
    )
    content = f"""
      <div style="display:inline-block;margin-bottom:14px;padding:6px 10px;background:#f7f3e7;border-radius:20px;color:{BRAND_GREEN};font-size:11px;font-weight:700;letter-spacing:.5px">WEEKLY SPENDING ACTIVITY</div>
      <h1 style="margin:0 0 10px;color:{BRAND_GREEN};font-size:24px;line-height:30px">Above your recent pattern</h1>
      <p style="margin:0 0 18px;color:#435650;font-size:15px;line-height:23px">Your <strong>{safe_category}</strong> spending so far this week is higher than usual for this point in the week.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;background:#f7f8f5;border-radius:12px">
        <tr><td style="padding:15px 16px;color:{MUTED};font-size:13px;line-height:19px">Spent this week</td><td align="right" style="padding:15px 16px;color:{BRAND_GREEN};font-size:15px;line-height:19px;font-weight:700">₱{current_spend:,.2f}</td></tr>
        <tr><td style="padding:0 16px 15px;color:{MUTED};font-size:13px;line-height:19px">Usual for the same days</td><td align="right" style="padding:0 16px 15px;color:{BRAND_GREEN};font-size:15px;line-height:19px;font-weight:700">₱{usual_spend:,.2f}</td></tr>
        <tr><td colspan="2" style="padding:12px 16px;border-top:1px solid #e4eae5;color:#9a5a16;font-size:14px;line-height:20px;font-weight:700">₱{increase_amount:,.2f} higher · {increase_percent:.0f}%</td></tr>
      </table>
      <p style="margin:0 0 12px;color:#435650;font-size:14px;line-height:21px">This compares Monday through today with the median spending for the same weekdays across up to four previous weeks. The alert appears only when the increase is at least 30% and PHP 150.</p>
      <p style="margin:0;color:{MUTED};font-size:13px;line-height:20px">This is an informational alert, not a judgment. Review your transactions or category budget in FinAI if helpful.</p>
    """
    msg.add_alternative(
        _email_shell(
            "Weekly spending activity",
            content,
            f"{category} spending is PHP {increase_amount:,.2f} ({increase_percent:.0f}%) above its usual pace this week.",
        ),
        subtype="html",
    )
    return _send(msg)


def send_bill_due_reminder(
    target_email: str,
    bill_name: str,
    category: str,
    amount: float,
    due_date: str,
) -> bool:
    """Send one scheduled reminder for a user-entered bill record."""
    safe_name = escape(str(bill_name or "Scheduled bill"))
    safe_category = escape(str(category or "Uncategorized"))
    safe_due_date = escape(str(due_date))
    msg = EmailMessage()
    msg["Subject"] = f"FinAI reminder: {str(bill_name or 'Scheduled bill')[:80]} is due soon"
    _set_sender(msg)
    msg["To"] = target_email
    msg.set_content(
        f"Your saved {bill_name or 'scheduled bill'} reminder is due on {due_date}. "
        f"The saved amount is PHP {amount:,.2f} under {category or 'Uncategorized'}. "
        "This is a reminder only; confirm the actual amount when you pay. Open FinAI to review your scheduled bills."
    )
    content = f"""
      <div style="display:inline-block;margin-bottom:14px;padding:6px 10px;background:#f7f3e7;border-radius:20px;color:{BRAND_GREEN};font-size:11px;font-weight:700;letter-spacing:.5px">SCHEDULED BILL REMINDER</div>
      <h1 style="margin:0 0 10px;color:{BRAND_GREEN};font-size:24px;line-height:30px">A bill is due soon</h1>
      <p style="margin:0 0 18px;color:#435650;font-size:15px;line-height:23px"><strong>{safe_name}</strong> is due on <strong>{safe_due_date}</strong>.</p>
      <div style="margin:0 0 18px;padding:16px;background:#f7f8f5;border-radius:12px;color:{BRAND_GREEN};font-size:20px;line-height:26px;font-weight:700">PHP {amount:,.2f}<div style="margin-top:5px;color:{MUTED};font-size:12px;line-height:18px;font-weight:400">Saved reminder amount - {safe_category}</div></div>
      <p style="margin:0;color:{MUTED};font-size:13px;line-height:20px">This is a reminder based on the bill details saved in FinAI. Please confirm the actual bill amount when you pay.</p>
    """
    msg.add_alternative(
        _email_shell("Upcoming bill reminder", content, f"{safe_name} is due on {safe_due_date}."),
        subtype="html",
    )
    return _send(msg)
