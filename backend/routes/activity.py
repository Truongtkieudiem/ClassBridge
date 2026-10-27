import json

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request
from sqlalchemy import text

from extensions import db


activity_bp = Blueprint("user_activity", __name__, url_prefix="/auth")

ACTORS = {
    "admin": ("ADMIN", "admins", "admin_id"),
    "giang_vien": ("LECTURER", "lecturers", "lecturer_id"),
    "lecturer": ("LECTURER", "lecturers", "lecturer_id"),
    "sinh_vien": ("STUDENT", "students", "student_id"),
    "student": ("STUDENT", "students", "student_id"),
}


@activity_bp.route("/activity", methods=["POST"])
def record_click():
    payload = request.get_json(silent=True)
    payload = payload if isinstance(payload, dict) else {}
    page = str(payload.get("page") or "/")[:500]
    tag = str(payload.get("tag") or "unknown")[:40]
    label = str(payload.get("label") or "")[:240]
    element_id = str(payload.get("elementId") or "")[:120]

    try:
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
        identity = get_jwt_identity()
    except Exception:
        # Activity logging is public and best effort: expired or missing tokens
        # must not prevent the click event from being recorded as SYSTEM.
        claims = {}
        identity = None
    role_data = ACTORS.get(claims.get("role"))
    actor_role, table, primary_key = role_data if role_data else ("SYSTEM", None, None)
    actor_email = identity.strip().lower() if isinstance(identity, str) else None
    details = json.dumps(
        {"event": "click", "page": page, "tag": tag, "label": label, "elementId": element_id},
        ensure_ascii=False,
    )

    try:
        with db.engine.begin() as connection:
            actor_id = None
            if actor_email and table:
                actor_id = connection.execute(
                    text(
                        f"SELECT {primary_key} FROM {table} "
                        "WHERE lower(email) = :email LIMIT 1"
                    ),
                    {"email": actor_email},
                ).scalar_one_or_none()
            if actor_role != "SYSTEM" and actor_id is None:
                actor_role = "SYSTEM"

            connection.execute(
                text(
                    """
                    INSERT INTO audit_logs (
                        actor_role, admin_id, lecturer_id, student_id,
                        action, entity_type, description, actor_email,
                        entity_name, status, details, created_at
                    ) VALUES (
                        :actor_role, :admin_id, :lecturer_id, :student_id,
                        'Click', 'ui_click', :description, :actor_email,
                        :entity_name, 'success', CAST(:details AS jsonb), NOW()
                    )
                    """
                ),
                {
                    "actor_role": actor_role,
                    "admin_id": actor_id if actor_role == "ADMIN" else None,
                    "lecturer_id": actor_id if actor_role == "LECTURER" else None,
                    "student_id": actor_id if actor_role == "STUDENT" else None,
                    "description": f"Clicked {tag}" + (f": {label}" if label else ""),
                    "actor_email": actor_email,
                    "entity_name": page,
                    "details": details,
                },
            )
    except Exception:
        current_app.logger.exception("Click activity audit write failed")
        return jsonify({"message": "Could not record this activity."}), 503

    return jsonify({"success": True}), 201
