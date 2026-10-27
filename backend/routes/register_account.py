import re
import time

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from account_service import account_email_exists
from email_utils import is_valid_email_format
from extensions import db
from verification_service import verification_challenges
from request_limits import request_limit_exceeded

register_account_bp = Blueprint("register_account", __name__, url_prefix="/auth")


@register_account_bp.route("/register", methods=["POST"])
def register_account():
    if request_limit_exceeded(("register", request.remote_addr), 5, 900):
        return jsonify({"message": "Too many registration attempts. Please try again later."}), 429
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Invalid registration request."}), 400

    full_name_value = payload.get("fullName", "")
    email_value = payload.get("email", "")
    password = payload.get("password", "")
    role = payload.get("role")
    challenge_id = payload.get("challengeId")
    student_code = payload.get("studentCode", "")
    lecturer_code = payload.get("lecturerCode", "")

    if not isinstance(full_name_value, str):
        return jsonify({"message": "Enter a valid full name."}), 400
    full_name = full_name_value.strip()
    if not isinstance(email_value, str):
        return jsonify({"message": "Enter a valid email address."}), 400
    if not is_valid_email_format(email_value):
        return jsonify({"message": "Enter a valid email address."}), 400
    email = email_value.lower()
    if not full_name or len(full_name) > 100:
        return jsonify({"message": "Enter a valid full name (maximum 100 characters)."}), 400
    if role not in ("student", "lecturer"):
        return jsonify({"message": "Select a valid account role."}), 400
    if not isinstance(password, str) or not 8 <= len(password) <= 64:
        return jsonify({"message": "Password must contain 8 to 64 characters."}), 400
    password_rules = (
        (r"[A-Z]", "Password must contain an uppercase letter."),
        (r"[a-z]", "Password must contain a lowercase letter."),
        (r"[0-9]", "Password must contain a digit."),
        (r"[^A-Za-z0-9\s]", "Password must contain a special character."),
    )
    for pattern, message in password_rules:
        if not re.search(pattern, password):
            return jsonify({"message": message}), 400
    common_passwords = {
        "password", "password1", "password123", "password123!", "qwerty123",
        "admin123", "welcome1", "letmein123", "iloveyou1", "abc12345",
        "12345678", "123456789", "qwerty123!", "student123!",
    }
    if password.casefold() in common_passwords:
        return jsonify({"message": "Choose a less common password."}), 400
    if password != payload.get("confirmPassword"):
        return jsonify({"message": "Passwords do not match."}), 400
    if role == "student" and (
        not isinstance(student_code, str)
        or not re.fullmatch(r"\d{11}", student_code)
    ):
        return jsonify({"message": "Student ID must contain exactly 11 digits."}), 400
    if role == "lecturer" and (
        not isinstance(lecturer_code, str)
        or not re.fullmatch(r"[A-Za-z0-9]{1,30}", lecturer_code)
    ):
        return jsonify({
            "message": "Lecturer ID must contain 1 to 30 letters or digits."
        }), 400
    if role == "lecturer":
        lecturer_code = lecturer_code.upper()
    if not isinstance(challenge_id, str) or len(challenge_id) > 128:
        return jsonify({"message": "Verify your email before registering."}), 400

    challenge = verification_challenges.get(challenge_id)
    if (
        not challenge
        or not challenge.get("verified")
        or challenge["email"] != email
        or time.monotonic() >= challenge["expires_at"]
    ):
        verification_challenges.pop(challenge_id, None)
        return jsonify({"message": "Verify your email again before registering."}), 400

    try:
        db.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:email, 0))"),
            {"email": email},
        )
        if role == "lecturer":
            db.session.execute(
                text(
                    "SELECT pg_advisory_xact_lock(hashtextextended(:lecturer_code, 0))"
                ),
                {"lecturer_code": f"lecturer-code:{lecturer_code.lower()}"},
            )
        if account_email_exists(email):
            db.session.rollback()
            return jsonify({"message": "This email is already registered."}), 409

        if role == "student":
            code_exists = db.session.execute(
                text("SELECT EXISTS (SELECT 1 FROM students WHERE student_code = :code)"),
                {"code": student_code},
            ).scalar_one()
            if code_exists:
                db.session.rollback()
                return jsonify({"message": "This student ID is already registered."}), 409

            db.session.execute(
                text(
                    """
                    INSERT INTO students (student_code, full_name, email, password_hash)
                    VALUES (:student_code, :full_name, :email, :password_hash)
                    """
                ),
                {
                    "student_code": student_code,
                    "full_name": full_name,
                    "email": email,
                    "password_hash": generate_password_hash(password),
                },
            )
        else:
            code_exists = db.session.execute(
                text(
                    """
                    SELECT EXISTS (
                        SELECT 1 FROM lecturers
                        WHERE lower(lecturer_code) = lower(:code)
                    )
                    """
                ),
                {"code": lecturer_code},
            ).scalar_one()
            if code_exists:
                db.session.rollback()
                return jsonify({"message": "This lecturer ID is already registered."}), 409

            db.session.execute(
                text(
                    """
                    INSERT INTO lecturers (lecturer_code, full_name, email, password_hash)
                    VALUES (:lecturer_code, :full_name, :email, :password_hash)
                    """
                ),
                {
                    "lecturer_code": lecturer_code,
                    "full_name": full_name,
                    "email": email,
                    "password_hash": generate_password_hash(password),
                },
            )

        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        current_app.logger.info("Registration rejected by a unique account constraint")
        return jsonify({
            "message": "This email, student ID, or lecturer ID is already registered."
        }), 409
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Account registration failed")
        return jsonify({"message": "Could not create the account. Please try again."}), 500

    del verification_challenges[challenge_id]
    return jsonify({
        "success": True,
        "role": role,
        "message": "Account created successfully.",
    }), 201
