from uuid import UUID

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db


chat_bp = Blueprint("session_chat", __name__, url_prefix="/auth/sessions")
MAX_MESSAGE_LENGTH = 2000


def _actor():
    role = get_jwt().get("role")
    email = get_jwt_identity()
    if not isinstance(email, str):
        return None

    account = {
        "giang_vien": ("LECTURER", "lecturers", "lecturer_id"),
        "sinh_vien": ("STUDENT", "students", "student_id"),
        "student": ("STUDENT", "students", "student_id"),
    }.get(role)
    if not account:
        return None

    actor_role, table, id_column = account
    row = db.session.execute(
        text(
            f"""
            SELECT {id_column}::text AS id, full_name AS name, email
            FROM {table}
            WHERE lower(email) = lower(:email)
              AND is_active = TRUE
            """
        ),
        {"email": email},
    ).mappings().first()
    return {"role": actor_role, **dict(row)} if row else None


def _session_id(raw_session_id):
    try:
        return str(UUID(raw_session_id))
    except (ValueError, TypeError, AttributeError):
        return None


def _accessible_session(session_id, actor):
    statement = """
        SELECT s.session_id::text AS id, s.status, c.class_name AS "className"
        FROM sessions s
        JOIN classes c ON c.class_id = s.class_id
        WHERE s.session_id = CAST(:session_id AS uuid)
          AND c.status = 'ACTIVE'
    """
    params = {"session_id": session_id, "actor_id": actor["id"]}
    if actor["role"] == "LECTURER":
        statement += " AND c.lecturer_id = CAST(:actor_id AS uuid)"
    else:
        statement += """
          AND EXISTS (
              SELECT 1
              FROM class_members cm
              WHERE cm.class_id = c.class_id
                AND cm.student_id = CAST(:actor_id AS uuid)
                AND COALESCE(upper(cm.status), 'ACTIVE') = 'ACTIVE'
          )
        """
    return db.session.execute(text(statement), params).mappings().first()


def _serialize_message(row, actor):
    if actor["role"] == "STUDENT":
        is_own_message = (
            row["senderRole"] == "STUDENT"
            and row["student_id"] == actor["id"]
        )
    else:
        is_own_message = (
            row["senderRole"] == "LECTURER"
            and row["lecturer_id"] == actor["id"]
        )
    message = {
        "id": row["id"],
        "text": row["text"],
        "createdAt": row["createdAt"].isoformat(),
        "senderRole": row["senderRole"],
        "isOwnMessage": is_own_message,
    }

    if actor["role"] == "LECTURER":
        message["senderName"] = row["senderName"] or "Hệ thống"
        message["senderEmail"] = row["senderEmail"]
    else:
        message["senderName"] = (
            "Bạn"
            if is_own_message
            else {
                "STUDENT": "Sinh viên",
                "LECTURER": "Giảng viên",
                "SYSTEM": "Hệ thống",
            }.get(row["senderRole"], "Người tham gia")
        )
    return message


@chat_bp.route("/<session_id>/chat", methods=["GET"])
@jwt_required()
def list_session_chat(session_id):
    normalized_id = _session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400
    try:
        actor = _actor()
        if not actor:
            return jsonify({"message": "Tài khoản không có quyền truy cập chat."}), 403
        session = _accessible_session(normalized_id, actor)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404

        rows = db.session.execute(
            text(
                """
                SELECT
                    sc.message_id::text AS id,
                    sc.message_text AS text,
                    sc.created_at AS "createdAt",
                    sc.sender_role AS "senderRole",
                    ss.student_id::text AS student_id,
                    COALESCE(st.full_name, lt.full_name) AS "senderName",
                    st.email AS "senderEmail",
                    sc.lecturer_id::text AS lecturer_id
                FROM session_chats sc
                LEFT JOIN student_sessions ss
                    ON ss.student_session_id = sc.student_session_id
                LEFT JOIN students st ON st.student_id = ss.student_id
                LEFT JOIN lecturers lt ON lt.lecturer_id = sc.lecturer_id
                WHERE sc.session_id = CAST(:session_id AS uuid)
                ORDER BY sc.created_at DESC, sc.message_id DESC
                LIMIT 200
                """
            ),
            {"session_id": normalized_id},
        ).mappings().all()
        messages = [_serialize_message(row, actor) for row in reversed(rows)]
        return jsonify(
            {
                "session": {"id": session["id"], "className": session["className"]},
                "canSend": session["status"].upper() == "LIVE",
                "messages": messages,
            }
        )
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to load session chat")
        return jsonify({"message": "Không thể tải tin nhắn chat."}), 500


@chat_bp.route("/<session_id>/chat", methods=["POST"])
@jwt_required()
def send_session_chat(session_id):
    normalized_id = _session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    body = request.get_json(silent=True)
    message_text = body.get("message") if isinstance(body, dict) else None
    if not isinstance(message_text, str) or not message_text.strip():
        return jsonify({"message": "Vui lòng nhập nội dung tin nhắn."}), 400
    message_text = message_text.strip()
    if len(message_text) > MAX_MESSAGE_LENGTH:
        return jsonify({"message": "Tin nhắn tối đa 2000 ký tự."}), 400

    try:
        actor = _actor()
        if not actor:
            return jsonify({"message": "Tài khoản không có quyền gửi chat."}), 403
        session = _accessible_session(normalized_id, actor)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404
        if session["status"].upper() != "LIVE":
            return jsonify({"message": "Chat chỉ mở khi buổi học đang diễn ra."}), 409

        student_session_id = None
        lecturer_id = None
        sender_role = actor["role"]
        if sender_role == "STUDENT":
            student_session_id = db.session.execute(
                text(
                    """
                    INSERT INTO student_sessions (
                        student_id, session_id, is_active, last_active_at, left_at
                    )
                    VALUES (
                        CAST(:student_id AS uuid), CAST(:session_id AS uuid),
                        TRUE, NOW(), NULL
                    )
                    ON CONFLICT (student_id, session_id)
                    DO UPDATE SET
                        is_active = TRUE, last_active_at = NOW(), left_at = NULL
                    RETURNING student_session_id::text
                    """
                ),
                {"student_id": actor["id"], "session_id": normalized_id},
            ).scalar_one()
        else:
            lecturer_id = actor["id"]

        db.session.execute(
            text(
                """
                INSERT INTO session_chats (
                    session_id, student_session_id, lecturer_id,
                    sender_role, message_text
                )
                VALUES (
                    CAST(:session_id AS uuid),
                    CAST(:student_session_id AS uuid),
                    CAST(:lecturer_id AS uuid),
                    :sender_role, :message_text
                )
                """
            ),
            {
                "session_id": normalized_id,
                "student_session_id": student_session_id,
                "lecturer_id": lecturer_id,
                "sender_role": sender_role,
                "message_text": message_text,
            },
        )
        db.session.commit()
        return jsonify({"message": "Đã gửi tin nhắn."}), 201
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to send session chat message")
        return jsonify({"message": "Không thể gửi tin nhắn chat."}), 500