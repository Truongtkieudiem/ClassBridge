import smtplib
import secrets
import time

from flask import Blueprint, current_app, jsonify, request

from verification_service import (
    challenge_ttl_seconds,
    send_verification_email,
    verification_challenges,
)
from request_limits import request_limit_exceeded

verify_verification_bp = Blueprint(
    "verify_verification", __name__, url_prefix="/auth/verification"
)


@verify_verification_bp.route("/verify", methods=["POST"])
def verify_email_code():
    if request_limit_exceeded(("verification-check", request.remote_addr), 20, 900):
        return jsonify({"message": "Too many verification attempts. Please try again later."}), 429
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"message": "Invalid verification request."}), 400
    challenge_id = payload.get("challengeId")
    selected_number = payload.get("selectedNumber")
    if not isinstance(challenge_id, str):
        return jsonify({"message": "Verification expired. Request a new email code."}), 400
    challenge = verification_challenges.get(challenge_id)

    if not challenge or time.monotonic() >= challenge["expires_at"]:
        verification_challenges.pop(challenge_id, None)
        return jsonify({"message": "Verification expired. Request a new email code."}), 400

    if type(selected_number) is not int or selected_number not in challenge["choices"]:
        return jsonify({"message": "Select one of the displayed numbers."}), 400

    if challenge.get("verified"):
        return jsonify({"verified": True}), 200

    if selected_number != challenge["code"]:
        new_code = secrets.randbelow(201) - 100
        new_choices = [new_code]
        while len(new_choices) < 4:
            choice = secrets.randbelow(201) - 100
            if choice not in new_choices:
                new_choices.append(choice)
        secrets.SystemRandom().shuffle(new_choices)

        try:
            send_verification_email(challenge["email"], new_code)
        except smtplib.SMTPRecipientsRefused:
            return jsonify({
                "code": "email_not_found",
                "message": "The email address could not be found or does not accept mail.",
            }), 422
        except (OSError, smtplib.SMTPException, RuntimeError):
            current_app.logger.exception("Failed to resend registration verification email")
            return jsonify({
                "message": "Could not resend the verification email. Please try again.",
            }), 503

        challenge.update({
            "code": new_code,
            "choices": new_choices,
            "expires_at": time.monotonic() + challenge_ttl_seconds,
        })
        return jsonify({
            "verified": False,
            "message": "That number did not match. A new verification number was emailed.",
            "choices": new_choices,
            "expiresIn": challenge_ttl_seconds,
        }), 200

    challenge["verified"] = True
    return jsonify({"verified": True}), 200
