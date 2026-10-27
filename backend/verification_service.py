import json
import smtplib
import ssl
import time
from email.message import EmailMessage
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import current_app


verification_challenges = {}
verification_send_times = {}
challenge_ttl_seconds = 600
send_cooldown_seconds = 60
email_validation_cache = {}
email_validation_cache_ttl_seconds = 300


class EmailValidationServiceError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def validate_email_deliverability(email):
    """Validate one address with Abstract before sending a verification code."""
    now = time.monotonic()
    for cached_email, (cached_at, _) in list(email_validation_cache.items()):
        if now - cached_at >= email_validation_cache_ttl_seconds:
            del email_validation_cache[cached_email]
    cached_result = email_validation_cache.get(email)
    if cached_result and now - cached_result[0] < email_validation_cache_ttl_seconds:
        return cached_result[1]

    api_key = current_app.config.get("EMAIL_VALIDATION_API_KEY")
    if not api_key:
        raise EmailValidationServiceError("email_validation_configuration_error")

    query = urlencode({"email": email})
    request = Request(
        f"https://emailreputation.abstractapi.com/v1/?{query}",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 401:
            code = "email_validation_configuration_error"
        elif error.code in (403, 422):
            code = "email_validation_quota_exceeded"
        elif error.code == 429:
            code = "email_validation_rate_limited"
        else:
            code = "email_validation_unavailable"
        # Suppress the original exception because HTTP errors can contain the
        # full request URL, including the API key query parameter.
        raise EmailValidationServiceError(code) from None
    except (URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError, OSError):
        raise EmailValidationServiceError("email_validation_unavailable") from None

    if not isinstance(result, dict):
        raise EmailValidationServiceError("email_validation_unavailable")

    deliverability_result = result.get("email_deliverability")
    quality_result = result.get("email_quality")
    if not isinstance(deliverability_result, dict):
        return "unknown"
    if not isinstance(quality_result, dict):
        quality_result = {}

    valid_format = deliverability_result.get("is_format_valid")
    deliverability = deliverability_result.get("status")
    smtp_valid = deliverability_result.get("is_smtp_valid")
    catchall = quality_result.get("is_catchall")

    if valid_format is False or deliverability == "undeliverable":
        result_status = "invalid"
    elif (
        deliverability == "deliverable"
        and smtp_valid is True
        and catchall is False
    ):
        result_status = "valid"
    else:
        result_status = "unknown"

    email_validation_cache[email] = (now, result_status)
    return result_status


def send_verification_email(email, code):
    smtp_host = current_app.config["SMTP_HOST"]
    smtp_username = current_app.config["SMTP_USERNAME"]
    # Google displays App Passwords in groups separated by spaces. Those spaces
    # are formatting only and must not be sent as part of the SMTP credential.
    smtp_password = "".join((current_app.config["SMTP_PASSWORD"] or "").split())
    smtp_from = current_app.config["SMTP_FROM"] or smtp_username
    smtp_port = current_app.config["SMTP_PORT"]

    if not all((smtp_host, smtp_username, smtp_password, smtp_from)):
        raise RuntimeError("SMTP configuration is incomplete")

    message = EmailMessage()
    message["Subject"] = "Xác thực đăng ký ClassBridge"
    message["From"] = smtp_from
    message["To"] = email
    message.set_content(f"Số chọn đăng ký xác thực của bạn là:\n\n{code}")
    message.add_alternative(
        f"""\
        <!doctype html>
        <html lang="vi">
          <body style="margin:0;padding:32px;background:#f4f6fa;font-family:Arial,sans-serif;text-align:center">
            <div style="max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px">
              <p style="margin:0 0 16px;color:#344054;font-size:18px">
                Số chọn đăng ký xác thực của bạn là
              </p>
              <div style="color:#1e1b4b;font-size:48px;font-weight:700;line-height:1.2">
                {code}
              </div>
            </div>
          </body>
        </html>
        """,
        subtype="html",
    )

    if smtp_port == 465:
        with smtplib.SMTP_SSL(
            smtp_host, smtp_port, timeout=15, context=ssl.create_default_context()
        ) as smtp:
            smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
        if current_app.config["SMTP_USE_TLS"]:
            smtp.starttls(context=ssl.create_default_context())
        smtp.login(smtp_username, smtp_password)
        smtp.send_message(message)
