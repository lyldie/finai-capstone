import smtplib
from email.message import EmailMessage

# --- CONFIGURATION ---
EMAIL_SENDER = "sobrangfinefinai@gmail.com"
EMAIL_PASSWORD = "natvzmqhkmkquafu" 
RECEIVER_EMAIL = "loyld30estardo@gmail.com" # <--- PALITAN MO NG EMAIL MO PAPS

def send_test():
    print("--- FinAi Email Stress Test ---")
    print(f"Sinusubukang kumonekta sa Gmail para kay: {RECEIVER_EMAIL}...")
    
    msg = EmailMessage()
    msg['Subject'] = "FinAi - Independent Test 🐿️"
    msg['From'] = EMAIL_SENDER
    msg['To'] = RECEIVER_EMAIL
    msg.set_content("Mabuhay paps! Kung nababasa mo ito, 100% working ang SMTP mo.")

    try:
        # Port 587 + STARTTLS (Pinaka-reliable)
        with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
            smtp.starttls() # Eto yung kulang minsan sa SSL
            print("Connecting...")
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            print("Login Successful! ✅")
            smtp.send_message(msg)
            print(f"Email Sent! Pakicheck ang inbox o spam folder ni {RECEIVER_EMAIL}.")
    except Exception as e:
        print(f"\n--- ERROR ENCOUNTERED ---")
        print(f"Dahilan: {e}")
        print("\nPossible issues:")
        print("1. Mali ang App Password.")
        print("2. Walang internet connection.")
        print("3. Blocked ang connection ng antivirus/firewall mo.")

if __name__ == "__main__":
    send_test()