from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from werkzeug.security import check_password_hash

from email_utils import is_valid_email_format
from extensions import db
from request_limits import request_limit_exceeded


login_bp = Blueprint("login", __name__, url_prefix="/auth")

AUDIT_ROLES = {
    "admin": "ADMIN",
    "giang_vien": "LECTURER",
    "lecturer": "LECTURER",
    "sinh_vien": "STUDENT",
    "student": "STUDENT",
}


def _record_audit_event(action, description, actor_role, actor_email, *, admin_id=None, lecturer_id=None, student_id=None, entity_type=None, entity_name=None, status="success"):
    try:
        db.session.execute(
            text(
                """
                INSERT INTO audit_logs (
                    action,
                    description,
                    actor_role,
                    actor_email,
                    admin_id,
                    lecturer_id,
                    student_id,
                    entity_type,
                    entity_name,
                    status,
                    created_at
                ) VALUES (
                    :action,
                    :description,
                    :actor_role,
                    :actor_email,
                    :admin_id,
                    :lecturer_id,
                    :student_id,
                    :entity_type,
                    :entity_name,
                    :status,
                    NOW()
                )
                """
            ),
            {
                "action": action,
                "description": description,
                "actor_role": AUDIT_ROLES.get(actor_role, "SYSTEM"),
                "actor_email": actor_email,
                "admin_id": admin_id,
                "lecturer_id": lecturer_id,
                "student_id": student_id,
                "entity_type": entity_type,
                "entity_name": entity_name,
                "status": status,
            },
        )
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Audit log write failed")
        return False


@login_bp.route("/login", methods=["POST"])
def login():
    if request_limit_exceeded(("login", request.remote_addr), 10, 900):
        return jsonify({"message": "Too many login attempts. Please try again later."}), 429

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Invalid login request."}), 400

    email = payload.get("email")
    password = payload.get("password")
    if not is_valid_email_format(email):
        return jsonify({
            "code": "invalid_email",
            "message": "Enter a valid email address.",
        }), 400
    if not isinstance(password, str) or not password or len(password) > 64:
        return jsonify({
            "code": "invalid_password",
            "message": "Password must contain 1 to 64 characters.",
        }), 400

    email = email.lower()
    try:
        student = db.session.execute(
            text("SELECT student_id, full_name, email, password_hash, is_active FROM students WHERE lower(email) = :email"),
            {"email": email},
        ).mappings().first()
        lecturer = db.session.execute(
            text("SELECT lecturer_id, full_name, email, password_hash, is_active FROM lecturers WHERE lower(email) = :email"),
            {"email": email},
        ).mappings().first()
        admin = db.session.execute(
            text("SELECT admin_id, full_name, email, password_hash, is_active FROM admins WHERE lower(email) = :email"),
            {"email": email},
        ).mappings().first()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Login database lookup failed")
        return jsonify({"message": "Login is temporarily unavailable. Please try again."}), 503

    account = next(
        (
            (role, row)
            for role, row in (
                ("sinh_vien", student),
                ("giang_vien", lecturer),
                ("admin", admin),
            )
            if row
        ),
        (None, None),
    )
    role, row = account
    if not row:
        return jsonify({
            "code": "email_not_found",
            "message": "No account was found for this email address.",
        }), 404
    if row["is_active"] is not True:
        return jsonify({
            "code": "account_disabled",
            "message": "This account is not available.",
        }), 403

    try:
        password_matches = check_password_hash(row["password_hash"], password)
    except (TypeError, ValueError):
        current_app.logger.warning("Stored password hash is invalid")
        password_matches = False
    if not password_matches:
        return jsonify({
            "code": "password_incorrect",
            "message": "The password is incorrect.",
        }), 401

    token = create_access_token(
        identity=email,
        additional_claims={"role": role},
    )

    audit_logged = _record_audit_event(
        "Đăng nhập",
        f"{row['full_name']} đăng nhập vào hệ thống",
        role,
        row["email"],
        admin_id=row.get("admin_id"),
        lecturer_id=row.get("lecturer_id"),
        student_id=row.get("student_id"),
        entity_type="account",
        entity_name=row["full_name"],
        status="success",
    )

    if not audit_logged:
        current_app.logger.warning("Login succeeded but audit log was not recorded for %s", email)

    return jsonify({
        "access_token": token,
        "user": {"email": row["email"], "full_name": row["full_name"], "role": role},
    }), 200


@login_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    identity = get_jwt_identity()
    role = get_jwt().get("role")
    actor_email = identity or "unknown"

    audit_row = None
    if role == "admin":
        audit_row = db.session.execute(
            text("SELECT admin_id, full_name, email FROM admins WHERE lower(email) = lower(:email)"),
            {"email": actor_email},
        ).mappings().first()
    elif role == "giang_vien":
        audit_row = db.session.execute(
            text("SELECT lecturer_id, full_name, email FROM lecturers WHERE lower(email) = lower(:email)"),
            {"email": actor_email},
        ).mappings().first()
    elif role == "sinh_vien":
        audit_row = db.session.execute(
            text("SELECT student_id, full_name, email FROM students WHERE lower(email) = lower(:email)"),
            {"email": actor_email},
        ).mappings().first()

    _record_audit_event(
        "Đăng xuất",
        f"{audit_row['full_name'] if audit_row else actor_email} đăng xuất khỏi hệ thống",
        role,
        actor_email,
        admin_id=audit_row.get("admin_id") if audit_row else None,
        lecturer_id=audit_row.get("lecturer_id") if audit_row else None,
        student_id=audit_row.get("student_id") if audit_row else None,
        entity_type="account",
        entity_name=audit_row["full_name"] if audit_row else actor_email,
        status="success",
    )

    return jsonify({"message": "Logged out successfully."}), 200
