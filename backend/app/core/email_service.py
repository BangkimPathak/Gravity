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
        message['Subject'] = 'Your Gravity Verification Code'
        message['From'] = f"Gravity <{sender_email}>"
        message['To'] = recipient_email
        
        # Plain text alternative
        plain_text = (
            f"Hello,\n\n"
            f"Your 6-digit verification code is: {otp}\n\n"
            f"This code will expire in 10 minutes.\n\n"
            f"If you did not request this code, you can safely ignore this email.\n\n"
            f"— Gravity Team"
        )
        message.set_content(plain_text)

        # Rich HTML email template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 20px; }}
            .container {{ max-width: 480px; margin: 0 auto; background-color: #121826; border-radius: 16px; padding: 32px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }}
            .logo-text {{ font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }}
            .badge {{ display: inline-block; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; padding: 6px 12px; border-radius: 8px; font-size: 14px; }}
            .otp-box {{ background: rgba(99, 102, 241, 0.1); border: 2px dashed #6366f1; border-radius: 12px; padding: 18px; text-align: center; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #818cf8; margin: 24px 0; font-family: monospace; }}
            .footer {{ font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo-text"><span class="badge">Gravity</span> Account Verification</div>
            <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Please use the following 6-digit One-Time Password (OTP) to complete your identity verification:</p>
            <div class="otp-box">{otp}</div>
            <p style="color: #94a3b8; font-size: 13px;">This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.</p>
            <div class="footer">&copy; 2026 Gravity Messaging Platform. All rights reserved.</div>
          </div>
        </body>
        </html>
        """
        message.add_alternative(html_content, subtype='html')

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
