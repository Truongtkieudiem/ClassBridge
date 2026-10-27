
import re

from flask import current_app, request
from flask_jwt_extended import get_jwt, get_jwt_identity
from sqlalchemy import text

from extensions import db


ACCOUNT_ACTORS = {
    "admin": ("admins", "admin_id"),
    "giang_vien": ("lecturers", "lecturer_id"),
    "sinh_vien": ("students", "student_id"),
    "lecturer": ("lecturers", "lecturer_id"),
    "student": ("students", "student_id"),
}


def _request_actor(response):
    try:
        claims = get_jwt()
        identity = get_jwt_identity()
    except RuntimeError:
        claims = {}
        identity = None

    role = claims.get("role")
    email = identity
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        payload = {}

    # For registration and authentication steps, associate the event with the
    # account being acted on even when no JWT exists yet.
    if request.path == "/auth/register":
        role = {"student": "sinh_vien", "lecturer": "giang_vien"}.get(
            payload.get("role"), role
        )
        email = payload.get("email") or email
    elif request.path.startswith("/auth/verification/"):
        email = email or payload.get("email")
    elif request.path == "/auth/login":
        login_result = response.get_json(silent=True)
        login_user = login_result.get("user") if isinstance(login_result, dict) else None
        if isinstance(login_user, dict) and response.status_code < 400:
            email = login_user.get("email") or email
            role = login_user.get("role") or role
        else:
            email = payload.get("email") or email

    if not role:
        role = "anonymous"
    if not isinstance(email, str) or not email.strip():
        email = None
    else:
        email = email.strip().lower()
    return role, email


def _event_labels(endpoint, method):
    labels = {
        "login.login": "Đăng nhập",
        "login.logout": "Đăng xuất",
        "register_account.register_account": "Tạo tài khoản",
        "admin_accounts.create_account": "Tạo tài khoản",
        "admin_accounts.update_account": "Cập nhật tài khoản",
        "admin_accounts.delete_account": "Xóa tài khoản",
        "send_verification.send_email_verification": "Gửi mã xác minh email",
        "verify_verification.verify_email_code": "Xác minh email",
        "admin_dashboard.get_admin_dashboard": "Xem trang tổng quan",
        "admin_logs.get_admin_logs": "Xem nhật ký hoạt động",
    }
    if endpoint in labels:
        action = labels[endpoint]
    else:
        action = f"{method} {endpoint or request.path}"

    if "/accounts/" in request.path:
        entity_type = "account"
    elif "dashboard" in (endpoint or ""):
        entity_type = "dashboard"
    elif "logs" in (endpoint or ""):
        entity_type = "audit_log"
    elif request.path in ("/auth/login", "/auth/logout"):
        entity_type = "account"
    elif "verification" in request.path or "email/check" in request.path:
        entity_type = "email_verification"
    elif request.path == "/auth/register":
        entity_type = "account"
    else:
        entity_type = "application"
    return action, entity_type


def record_request_activity(response):
    """Persist one sanitized audit row for each API request."""
    if request.method == "OPTIONS" or request.path in ("/", "/test-db"):
        return
    if request.endpoint == "user_activity.record_click":
        return
    # Successful authentication already records account IDs in login.py.
    if request.path in ("/auth/login", "/auth/logout") and response.status_code < 400:
        return
    role, email = _request_actor(response)
    action, entity_type = _event_labels(request.endpoint, request.method)
    succeeded = response.status_code < 400
    status = "success" if succeeded else "failed"
    endpoint = request.endpoint or request.path
    description = (
        f"{request.method} {endpoint} completed with HTTP {response.status_code}"
    )
    audit_role = {
        "admin": "ADMIN",
        "giang_vien": "LECTURER",
        "lecturer": "LECTURER",
        "sinh_vien": "STUDENT",
        "student": "STUDENT",
    }.get(role, "SYSTEM")
    actor_table = ACCOUNT_ACTORS.get(role)
    entity_id = None
    match = re.search(
        r"/auth/admin/accounts/(?:admin|lecturer|student):([0-9a-fA-F-]{36})",
        request.path,
    )
    if match:
        entity_id = match.group(1)

    try:
        with db.engine.begin() as connection:
            actor_id = None
            if email and actor_table:
                table, primary_key = actor_table
                actor_id = connection.execute(
                    text(
                        f"SELECT {primary_key} FROM {table} "
                        "WHERE lower(email) = :email LIMIT 1"
                    ),
                    {"email": email},
                ).scalar_one_or_none()

            # The audit table enforces a matching account foreign key for each
            # user role. Use SYSTEM for unauthenticated or deleted accounts.
            if audit_role != "SYSTEM" and actor_id is None:
                audit_role = "SYSTEM"

            if request.path == "/auth/register":
                entity_id = actor_id
            elif request.path in ("/auth/login", "/auth/logout"):
                entity_id = actor_id
            elif request.path == "/auth/admin/accounts" and request.method == "POST":
                payload = request.get_json(silent=True)
                payload = payload if isinstance(payload, dict) else {}
                target_role = payload.get("role")
                target_table = {
                    "Admin": ("admins", "admin_id"),
                    "Editor": ("lecturers", "lecturer_id"),
                    "User": ("students", "student_id"),
                }.get(target_role)
                target_email = payload.get("email")
                if target_table and isinstance(target_email, str):
                    table, primary_key = target_table
                    entity_id = connection.execute(
                        text(
                            f"SELECT {primary_key} FROM {table} "
                            "WHERE lower(email) = :email LIMIT 1"
                        ),
                        {"email": target_email.strip().lower()},
                    ).scalar_one_or_none()

            connection.execute(
                text(
                    """
                    INSERT INTO audit_logs (
                        action, description, actor_role, actor_email,
                        admin_id, lecturer_id, student_id,
                        entity_type, entity_id, entity_name, status, created_at
                    ) VALUES (
                        :action, :description, :actor_role, :actor_email,
                        :admin_id, :lecturer_id, :student_id,
                        :entity_type, CAST(:entity_id AS uuid), :entity_name, :status, NOW()
                    )
                    """
                ),
                {
                    "action": action,
                    "description": description,
                    "actor_role": audit_role,
                    "actor_email": email,
                    "admin_id": actor_id if audit_role == "ADMIN" else None,
                    "lecturer_id": actor_id if audit_role == "LECTURER" else None,
                    "student_id": actor_id if audit_role == "STUDENT" else None,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "entity_name": endpoint,
                    "status": status,
                },
            )
    except Exception:
        # Auditing must not turn a completed user action into an HTTP failure.
        current_app.logger.exception("Request activity audit write failed")
