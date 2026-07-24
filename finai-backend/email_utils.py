import smtplib
import random
import string
from email.message import EmailMessage

# CONFIGURATION
# Siguraduhin na i-paste mo ulit yung 16-char code mo dito paps
EMAIL_SENDER = "sobrangfinefinai@gmail.com"
EMAIL_PASSWORD = "natvzmqhkmkquafu" 

def send_otp_email(target_email):
    # 1. Generate 6-digit random code (Mix of letters and numbers)
    otp_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    try:
        msg = EmailMessage()
        msg['Subject'] = "FinAi - Verify Your Account 🐿️"
        msg['From'] = EMAIL_SENDER
        msg['To'] = target_email
        msg.set_content(f"""
        Mabuhay paps! 
        
        Salamat sa pag-register sa FinAi. Heto ang iyong OTP Verification Code:
        
        CODE: {otp_code}
        
        Input mo lang 'to sa app para ma-verify ang email mo at makapag-setup na ng security PIN.
        
        Ligtas ang budget mo rito!
        - FinAi Team 🐿️
        """)

        # 2. SMTP Connection
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        
        return otp_code  # I-return natin yung code para ma-save sa DB
    except Exception as e:
        print(f"SMTP Error: {e}")
        return None

# Eto yung para sa Threshold Alerts niyo soon (Reusable!)
def send_threshold_alert(target_email, category, amount):
    try:
        msg = EmailMessage()
        msg['Subject'] = "FinAi Alert: Budget Limit Reached! ⚠️"
        msg['From'] = EMAIL_SENDER
        msg['To'] = target_email
        msg.set_content(f"Paps! Malapit na maubos budget mo sa {category}. {amount} na lang natitira!")

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
        return True
    except:
        return False