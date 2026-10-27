from flask import Blueprint, current_app, jsonify, request

from account_service import account_email_exists
from email_utils import is_valid_email_format
from extensions import db
from request_limits import request_limit_exceeded
from verification_service import (
    EmailValidationServiceError,
    validate_email_deliverability,
)

check_registration_email_bp = Blueprint(
    "check_registration_email", __name__, url_prefix="/auth"
)


@check_registration_email_bp.route("/email/check", methods=["POST"])
def check_registration_email():
    if request_limit_exceeded(("email-check", request.remote_addr), 20, 900):
        return jsonify({
            "code": "email_check_rate_limited",
            "message": "Too many email checks. Please try again later.",
        }), 429
    payload = request.get_json(silent=True)
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
        return jsonify({
            "code": error.code,
            "message": "Could not verify this email right now. Please try again.",
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

    return jsonify({"available": True}), 200
