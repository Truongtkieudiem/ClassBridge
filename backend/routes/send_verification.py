import secrets
import smtplib
import time

from flask import Blueprint, current_app, jsonify, request

from account_service import account_email_exists
from email_utils import is_valid_email_format
from extensions import db
from verification_service import (
    challenge_ttl_seconds,
    EmailValidationServiceError,
    send_cooldown_seconds,
    send_verification_email,
    validate_email_deliverability,
    verification_challenges,
    verification_send_times,
)
from request_limits import request_limit_exceeded

send_verification_bp = Blueprint(
    "send_verification", __name__, url_prefix="/auth/verification"
)


@send_verification_bp.route("/send", methods=["POST"])
def send_email_verification():
    if request_limit_exceeded(("verification-send", request.remote_addr), 5, 900):
        return jsonify({"message": "Too many verification requests. Please try again later."}), 429
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"message": "Enter a valid email address."}), 400
    email_value = payload.get("email", "")
    if not isinstance(email_value, str):
        return jsonify({"message": "Enter a valid email address."}), 400
    if not is_valid_email_format(email_value):
        return jsonify({"message": "Enter a valid email address."}), 400
    email = email_value.lower()

    try:
        if account_email_exists(email):
            return jsonify({
                "code": "email_already_registered",
                "message": "This email is already registered.",
            }), 409
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Failed to check registration email availability")
        return jsonify({"message": "Could not check the email. Please try again."}), 500

    try:
        email_status = validate_email_deliverability(email)
    except EmailValidationServiceError as error:
        current_app.logger.warning(
            "Email validation provider request failed (%s)", error.code
        )
        if error.code == "email_validation_configuration_error":
            message = "Email validation API key is missing or invalid."
        elif error.code == "email_validation_quota_exceeded":
            message = "The email validation API quota has been reached."
        elif error.code == "email_validation_rate_limited":
            message = "The email validation API request limit was reached. Please retry shortly."
        else:
            message = "Could not verify this email right now. Please try again."
        return jsonify({
            "code": error.code,
            "message": message,
        }), 503
    if email_status == "invalid":
        return jsonify({
            "code": "email_not_found",
            "message": "This email address does not appear to exist or receive mail.",
        }), 422
    if email_status not in ("valid", "unknown"):
        return jsonify({
            "code": "email_could_not_verify",
            "message": "This email could not be verified. Check it or try another address.",
        }), 422

    if email_status == "unknown":
        current_app.logger.warning(
            "Email validation was inconclusive for %s; continuing with verification send.",
            email,
        )

    now = time.monotonic()
    last_sent = verification_send_times.get(email)
    if last_sent is not None and now - last_sent < send_cooldown_seconds:
        retry_after = int(send_cooldown_seconds - (now - last_sent))
        return jsonify({
            "message": "Please wait before requesting another verification email.",
            "retryAfter": retry_after,
        }), 429

    code = secrets.randbelow(201) - 100
    choices = [code]
    while len(choices) < 4:
        choice = secrets.randbelow(201) - 100
        if choice not in choices:
            choices.append(choice)
    secrets.SystemRandom().shuffle(choices)

    try:
        send_verification_email(email, code)
    except smtplib.SMTPRecipientsRefused:
        return jsonify({
            "code": "email_not_found",
            "message": "The email address could not be found or does not accept mail.",
        }), 422
    except (OSError, smtplib.SMTPException, RuntimeError):
        current_app.logger.exception("Failed to send registration verification email")
        return jsonify({
            "message": "Could not send the verification email. Check SMTP configuration and try again.",
        }), 503

    for challenge_id, challenge in list(verification_challenges.items()):
        if challenge["email"] == email:
            del verification_challenges[challenge_id]

    challenge_id = secrets.token_urlsafe(32)
    verification_challenges[challenge_id] = {
        "email": email,
        "code": code,
        "choices": choices,
        "expires_at": now + challenge_ttl_seconds,
    }
    verification_send_times[email] = now

    return jsonify({
        "challengeId": challenge_id,
        "choices": choices,
        "expiresIn": challenge_ttl_seconds,
    }), 200
