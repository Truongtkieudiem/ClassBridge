import math

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import text

from extensions import db


admin_logs_bp = Blueprint("admin_logs", __name__, url_prefix="/auth/admin")


def _admin_required():
    if get_jwt().get("role") != "admin":
        return jsonify({"message": "Administrator access is required."}), 403
    return None


def _status_label(raw_status):
    if raw_status is None:
        return "Thành công"
    normalized = str(raw_status).strip().lower()
    label_map = {
        "success": "Thành công",
        "successful": "Thành công",
        "active": "Thành công",
        "pending": "Đang chờ",
        "waiting": "Đang chờ",
        "failed": "Thất bại",
        "failure": "Thất bại",
        "error": "Thất bại",
        "inactive": "Thất bại",
    }
    return label_map.get(normalized, "Thành công")


def _role_label(raw_role):
    role = str(raw_role or "SYSTEM").strip().upper()
    return {
        "ADMIN": "Admin",
        "LECTURER": "Giảng viên",
        "STUDENT": "Sinh viên",
        "SYSTEM": "Hệ thống",
    }.get(role, str(raw_role or "Hệ thống"))


@admin_logs_bp.route("/logs", methods=["GET"])
@jwt_required()
def get_admin_logs():
    denied = _admin_required()
    if denied:
        return denied

    search = (request.args.get("search", "") or "").strip()
    role = (request.args.get("role", "all") or "all").strip()
    from_date = (request.args.get("fromDate") or "").strip()
    to_date = (request.args.get("toDate") or "").strip()
    today_iso = db.session.execute(text("SELECT CURRENT_DATE::text AS today")).scalar_one()
    min_iso = "2000-01-01"

    if from_date and from_date > today_iso:
        from_date = today_iso
    if to_date and to_date > today_iso:
        to_date = today_iso
    if from_date and from_date < min_iso:
        from_date = min_iso
    if to_date and to_date < min_iso:
        to_date = min_iso
    if from_date and to_date and from_date > to_date:
        from_date, to_date = to_date, from_date

    try:
        page = max(1, int(request.args.get("page", "1")))
    except ValueError:
        page = 1

    try:
        page_size = max(1, min(100, int(request.args.get("pageSize", "20"))))
    except ValueError:
        page_size = 20

    offset = (page - 1) * page_size
    params = {}
    clauses = []
    actor_joins = """
        LEFT JOIN admins AS admin_actor ON audit_logs.admin_id = admin_actor.admin_id
        LEFT JOIN lecturers AS lecturer_actor ON audit_logs.lecturer_id = lecturer_actor.lecturer_id
        LEFT JOIN students AS student_actor ON audit_logs.student_id = student_actor.student_id
    """

    if search:
        clauses.append(
            """
            LOWER(
                COALESCE(audit_logs.action, '') || ' ' ||
                COALESCE(audit_logs.description, '') || ' ' ||
                COALESCE(audit_logs.actor_role, '') || ' ' ||
                COALESCE(audit_logs.actor_email, '') || ' ' ||
                COALESCE(admin_actor.email, '') || ' ' ||
                COALESCE(lecturer_actor.email, '') || ' ' ||
                COALESCE(student_actor.email, '') || ' ' ||
                COALESCE(audit_logs.entity_type, '') || ' ' ||
                COALESCE(audit_logs.entity_name, '') || ' ' ||
                COALESCE(audit_logs.session_id::text, '')
            ) LIKE :search
            """
        )
        params["search"] = f"%{search.lower()}%"

    if role and role.lower() != "all":
        clauses.append("LOWER(COALESCE(audit_logs.actor_role, '')) = LOWER(:role)")
        params["role"] = role

    if from_date:
        clauses.append("audit_logs.created_at::date >= CAST(:from_date AS date)")
        params["from_date"] = from_date

    if to_date:
        clauses.append("audit_logs.created_at::date <= CAST(:to_date AS date)")
        params["to_date"] = to_date

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    total_result = db.session.execute(
        text(
            f"SELECT COUNT(*) AS total FROM audit_logs {actor_joins} {where_clause}"
        ),
        params,
    ).mappings().first()
    total = int(total_result["total"]) if total_result else 0

    rows = db.session.execute(
        text(
            f"""
            SELECT audit_logs.*,
                   COALESCE(
                       admin_actor.full_name,
                       lecturer_actor.full_name,
                       student_actor.full_name
                   ) AS actor_full_name,
                   admin_actor.email AS admin_actor_email,
                   admin_actor.full_name AS admin_actor_full_name,
                   lecturer_actor.email AS lecturer_actor_email,
                   lecturer_actor.full_name AS lecturer_actor_full_name,
                   student_actor.email AS student_actor_email,
                   student_actor.full_name AS student_actor_full_name
            FROM audit_logs
            {actor_joins}
            {where_clause}
            ORDER BY audit_logs.created_at DESC
            LIMIT :limit
            OFFSET :offset
            """
        ),
        {**params, "limit": page_size, "offset": offset},
    ).mappings().all()

    items = []
    for row in rows:
        record = dict(row)
        created_at = record.get("created_at")
        action = record.get("action") or "Hệ thống"
        description = record.get("description") or action
        actor_role = (
            record.get("actor_role")
            or record.get("user_role")
            or record.get("role")
            or "system"
        )
        email_value = (
            record.get("actor_email")
            or record.get("user_email")
            or record.get("email")
            or record.get("admin_actor_email")
            or record.get("lecturer_actor_email")
            or record.get("student_actor_email")
            or str(actor_role)
        )
        user_value = (
            record.get("actor_full_name")
            or record.get("actor_name")
            or record.get("user_name")
            or email_value
        )
        target_value = (
            record.get("entity_type")
            or record.get("target_type")
            or record.get("entity_name")
            or record.get("target")
            or "Hệ thống"
        )
        session_value = (
            record.get("session_id")
            or record.get("session")
            or record.get("session_code")
            or "-"
        )

        items.append(
            {
                "id": str(record.get("log_id") or record.get("id") or len(items) + 1),
                "time": created_at.isoformat() if created_at else "",
                "user": str(user_value),
                "fullName": str(user_value),
                "email": str(email_value),
                "role": _role_label(actor_role),
                "action": str(action),
                "target": str(target_value),
                "session": str(session_value),
                "status": _status_label(record.get("status")),
                "detail": str(description),
            }
        )

    total_pages = max(1, math.ceil(total / page_size)) if total else 1

    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": total_pages,
        }
    )


@admin_logs_bp.errorhandler(Exception)
def handle_logs_error(error):
    current_app.logger.exception("Admin activity log query failed")
    db.session.rollback()
    return jsonify({"message": "Không thể tải nhật ký hoạt động."}), 503
