import random
import smtplib
import threading
from email.message import EmailMessage
from app.core.config import settings

def generate_otp_code() -> str:
    """Generates a 6-digit numeric OTP string."""
    return "".join([str(random.randint(0, 9)) for _ in range(6)])

def send_otp_email(recipient_email: str, otp: str):
    """Sends OTP verification email via SMTP or prints fallback to console."""
    sender_email = getattr(settings, 'SENDER_EMAIL', '') or ''
    sender_password = getattr(settings, 'SENDER_APP_PASSWORD', '') or ''
    smtp_host = getattr(settings, 'SMTP_HOST', 'smtp.gmail.com') or 'smtp.gmail.com'
    smtp_port = int(getattr(settings, 'SMTP_PORT', 587) or 587)

    if not sender_email or not sender_password or "your_email" in sender_email or "your_app" in sender_password:
        print("\n" + "=" * 60)
        print(" [GRAVITY OTP SIMULATION - SMTP CREDENTIALS NOT SET IN .env]")
        print(f" Recipient: {recipient_email}")
        print(f" OTP Code:  {otp}")
        print(f" Validity:  10 Minutes")
        print(" Note: Add SENDER_EMAIL & SENDER_APP_PASSWORD to .env to send real emails.")
        print("=" * 60 + "\n")
        return

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
            server.starttls()

        server.login(sender_email, sender_password)

        message = EmailMessage()
        message['Subject'] = 'Gravity - OTP Verification Code'
        message['From'] = f"Gravity <{sender_email}>"
        message['To'] = recipient_email
        
        # Exact format from screenshot
        email_body = (
            f"Dear User,\n\n"
            f"Your 6-digit verification code is: {otp}\n\n"
            f"This code will expire in 10 minutes. If you did not request this code, please ignore this email.\n\n"
            f"Best regards,\n"
            f"Gravity Team"
        )
        message.set_content(email_body)

        server.send_message(message)
        server.quit()
        print(f"[SMTP SUCCESS] Verification code email sent to {recipient_email} from {sender_email}")
    except Exception as e:
        print(f"[SMTP ERROR] Failed to send email to {recipient_email}: {e}")
        print(f"[FALLBACK LOG] Active OTP for {recipient_email} is: {otp}")

def send_otp_email_async(recipient_email: str, otp: str):
    """Fires send_otp_email in a background thread to prevent HTTP response lag."""
    thread = threading.Thread(target=send_otp_email, args=(recipient_email, otp), daemon=True)
    thread.start()
