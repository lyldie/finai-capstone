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
        
        # 1. Fallback (Plain Text) kung sakaling hindi naglo-load ang HTML sa email app ng user
        msg.set_content(f"Paps! Malapit na maubos budget mo sa {category}. {amount} na lang natitira!")
        
        # 2. Ang astig na HTML Design! (FinAi Colors)
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; background-color: #F7F9F8; padding: 20px;">
                <div style="max-width: 400px; margin: auto; background-color: #FFFFFF; padding: 30px; border-radius: 16px; border-top: 6px solid #144A3D; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    
                    <h2 style="color: #144A3D; text-align: center; margin-top: 0;">FinAi Budget Alert ⚠️</h2>
                    
                    <p style="color: #58706B; font-size: 15px;">Mabuhay paps!</p>
                    <p style="color: #58706B; font-size: 15px;">Ito ay isang paalala na malapit nang maubos ang budget limit mo para sa category na ito:</p>
                    
                    <div style="background-color: #FEE2E2; padding: 15px; border-radius: 12px; text-align: center; margin: 25px 0; border: 1px solid #FCA5A5;">
                        <p style="color: #B91C1C; font-size: 14px; margin: 0; text-transform: uppercase; font-weight: bold;">Category: {category}</p>
                        <h1 style="color: #991B1B; font-size: 24px; margin: 5px 0;">{amount}</h1>
                    </div>
                    
                    <p style="color: #58706B; font-size: 14px; text-align: center;">I-check ang iyong FinAi app para sa karagdagang detalye at mag-adjust ng expenses kung kinakailangan.</p>
                    
                    <hr style="border: none; border-top: 1px solid #E6ECE9; margin: 25px 0;">
                    
                    <p style="color: #8A9A86; font-size: 12px; text-align: center; margin: 0;">Ligtas ang budget mo rito!<br><strong>- FinAi Team 🐿️</strong></p>
                </div>
            </body>
        </html>
        """
        
        # I-attach ang HTML design sa email
        msg.add_alternative(html_content, subtype='html')

        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            smtp.send_message(msg)
            
        return True
    except Exception as e:
        print(f"Failed to send email alert: {e}")
        return False