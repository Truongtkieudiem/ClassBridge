from io import BytesIO
import mimetypes
from pathlib import PurePath
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db

ALLOWED_LECTURE_EXTENSIONS = {
    ".pdf",
    ".ppt",
    ".pptx",
    ".doc",
    ".docx",
    ".odt",
    ".odp",
}
MAX_LECTURE_FILE_SIZE = 20 * 1024 * 1024


lecturer_session_detail_bp = Blueprint(
    "lecturer_session_detail", __name__, url_prefix="/auth/lecturer/sessions"
)


SESSION_DETAILS_SQL = text(
    """
    SELECT
        s.session_id::text AS id,
        s.session_title AS title,
        s.status,
        s.delivery_mode AS "deliveryMode",
        s.join_code AS "joinCode",
        s.started_at AS "startedAt",
        s.ended_at AS "endedAt",
        c.class_code AS "classCode",
        c.class_name AS "className",
        cs.start_time AS "startsAt",
        cs.end_time AS "endsAt",
        (
            SELECT COUNT(*)
            FROM student_sessions ss
            WHERE ss.session_id = s.session_id
        )::int AS "studentCount",
        (
            SELECT COUNT(*)
            FROM questions q
            WHERE q.session_id = s.session_id
        )::int AS "totalQuestions",
        (
            SELECT COUNT(*)
            FROM questions q
            WHERE q.session_id = s.session_id
              AND q.status NOT IN ('ANSWERED', 'CLOSED')
        )::int AS "unansweredQuestions"
    FROM sessions s
    JOIN classes c ON c.class_id = s.class_id
    LEFT JOIN class_schedules cs ON cs.schedule_id = s.schedule_id
    WHERE s.session_id = CAST(:session_id AS uuid)
      AND c.lecturer_id = CAST(:lecturer_id AS uuid)
      AND c.status = 'ACTIVE'
    """
)


def _lecturer_id():
    if get_jwt().get("role") != "giang_vien":
        return None

    email = get_jwt_identity()
    if not isinstance(email, str):
        return None

    return db.session.execute(
        text(
            """
            SELECT lecturer_id::text
            FROM lecturers
            WHERE lower(email) = lower(:email)
              AND is_active = TRUE
            """
        ),
        {"email": email},
    ).scalar_one_or_none()


def _validated_session_id(session_id):
    try:
        return str(UUID(session_id))
    except (ValueError, TypeError, AttributeError):
        return None


def _serialize_session(row):
    status = row["status"].upper()
    return {
        "id": row["id"],
        "title": row["title"],
        "status": {
            "SCHEDULED": "upcoming",
            "LIVE": "live",
            "ENDED": "ended",
            "CANCELLED": "ended",
        }.get(status, "upcoming"),
        "deliveryMode": row["deliveryMode"],
        "joinCode": row["joinCode"],
        "classCode": row["classCode"],
        "className": row["className"],
        "startsAt": row["startsAt"].isoformat() if row["startsAt"] else None,
        "endsAt": row["endsAt"].isoformat() if row["endsAt"] else None,
        "startedAt": row["startedAt"].isoformat() if row["startedAt"] else None,
        "endedAt": row["endedAt"].isoformat() if row["endedAt"] else None,
        "studentCount": int(row["studentCount"] or 0),
        "totalQuestions": int(row["totalQuestions"] or 0),
        "unansweredQuestions": int(row["unansweredQuestions"] or 0),
    }


def _get_owned_session(session_id, lecturer_id, *, lock=False):
    statement = SESSION_DETAILS_SQL
    if lock:
        statement = text(f"{SESSION_DETAILS_SQL.text} FOR UPDATE OF s")
    return db.session.execute(
        statement,
        {"session_id": session_id, "lecturer_id": lecturer_id},
    ).mappings().first()


def _get_lecture_material(session_id):
    return db.session.execute(
        text(
            """
            SELECT
                lf.file_id::text AS "fileId",
                COALESCE(lf.original_file_name, lf.file_name) AS "fileName",
                lower(COALESCE(lf.file_extension, '')) AS extension,
                lf.mime_type AS "mimeType",
                lf.file_size_bytes AS "fileSize",
                lf.storage_type AS "storageType",
                lf.file_url AS "fileUrl",
                first_slide.slide_number AS "firstSlideNumber",
                first_slide.title AS "firstSlideTitle",
                first_slide.extracted_text AS "firstSlideText",
                first_slide.image_url AS "firstSlideImageUrl"
            FROM lecture_files lf
            LEFT JOIN LATERAL (
                SELECT slide_number, title, extracted_text, image_url
                FROM lecture_slides
                WHERE file_id = lf.file_id
                   OR (file_id IS NULL AND session_id = lf.session_id)
                ORDER BY slide_number
                LIMIT 1
            ) first_slide ON TRUE
            WHERE lf.session_id = CAST(:session_id AS uuid)
              AND lf.file_category IN ('LECTURE', 'SLIDE')
            ORDER BY lf.uploaded_at DESC
            LIMIT 1
            """
        ),
        {"session_id": session_id},
    ).mappings().first()


def _serialize_lecture_material(row):
    if not row:
        return None
    extension = row["extension"].lstrip(".")
    return {
        "fileId": row["fileId"],
        "fileName": row["fileName"],
        "extension": extension,
        "mimeType": row["mimeType"],
        "fileSize": int(row["fileSize"] or 0),
        "firstSlide": (
            {
                "number": row["firstSlideNumber"],
                "title": row["firstSlideTitle"],
                "text": row["firstSlideText"],
                "imageUrl": row["firstSlideImageUrl"],
            }
            if row["firstSlideNumber"] is not None
            else None
        ),
        "previewUrl": (
            f"/auth/lecturer/sessions/{row['fileId']}/materials/preview"
            if extension == "pdf"
            and row["storageType"] == "BYTEA"
            else None
        ),
    }


@lecturer_session_detail_bp.route("/<session_id>", methods=["GET"])
@jwt_required()
def get_lecturer_session(session_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _validated_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        session = _get_owned_session(normalized_id, lecturer_id)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404
        return jsonify({"session": _serialize_session(session)})
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to load lecturer session details")
        return jsonify({"message": "Không thể tải thông tin phiên học."}), 500


@lecturer_session_detail_bp.route("/<session_id>/materials", methods=["GET"])
@jwt_required()
def get_lecturer_session_materials(session_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _validated_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        session = _get_owned_session(normalized_id, lecturer_id)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404
        material = _get_lecture_material(normalized_id)
        if material:
            material = dict(material)
            if material["storageType"] == "URL" and material["extension"] == "pdf":
                material["previewUrl"] = material["fileUrl"]
        return jsonify({"material": _serialize_lecture_material(material)})
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to load session lecture material")
        return jsonify({"message": "Không thể kiểm tra bài giảng của phiên học."}), 500


@lecturer_session_detail_bp.route(
    "/<session_id>/materials", methods=["POST"]
)
@jwt_required()
def upload_lecturer_session_material(session_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _validated_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        session = _get_owned_session(normalized_id, lecturer_id)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404

        uploaded_file = request.files.get("file")
        if not uploaded_file or not uploaded_file.filename:
            return jsonify({"message": "Vui lòng chọn file bài giảng."}), 400

        original_filename = PurePath(uploaded_file.filename).name
        extension = PurePath(original_filename).suffix.lower()
        if extension not in ALLOWED_LECTURE_EXTENSIONS:
            return jsonify({
                "message": "Chỉ hỗ trợ file PDF, PowerPoint, Word, ODT hoặc ODP."
            }), 400

        file_data = uploaded_file.stream.read(MAX_LECTURE_FILE_SIZE + 1)
        if not file_data:
            return jsonify({"message": "File tải lên đang trống."}), 400
        if len(file_data) > MAX_LECTURE_FILE_SIZE:
            return jsonify({"message": "Dung lượng file tối đa là 20 MB."}), 413

        db.session.execute(
            text(
                """
                INSERT INTO lecture_files (
                    class_id, session_id, uploaded_by_lecturer_id,
                    file_name, original_file_name, mime_type, file_extension,
                    file_size_bytes, storage_type, file_data, file_category,
                    visibility
                )
                SELECT
                    s.class_id, s.session_id, CAST(:lecturer_id AS uuid),
                    :file_name, :original_file_name, :mime_type, :file_extension,
                    :file_size, 'BYTEA', :file_data, 'LECTURE', 'CLASS'
                FROM sessions s
                WHERE s.session_id = CAST(:session_id AS uuid)
                """
            ),
            {
                "lecturer_id": lecturer_id,
                "file_name": original_filename,
                "original_file_name": original_filename,
                "mime_type": mimetypes.guess_type(original_filename)[0],
                "file_extension": extension.lstrip("."),
                "file_size": len(file_data),
                "file_data": file_data,
                "session_id": normalized_id,
            },
        )
        db.session.commit()
        material = _get_lecture_material(normalized_id)
        material = dict(material) if material else None
        if (
            material
            and material["storageType"] == "URL"
            and material["extension"] == "pdf"
        ):
            material["previewUrl"] = material["fileUrl"]
        return jsonify({"material": _serialize_lecture_material(material)}), 201
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to upload session lecture material")
        return jsonify({"message": "Không thể tải bài giảng lên."}), 500


@lecturer_session_detail_bp.route(
    "/<file_id>/materials/preview", methods=["GET"]
)
@jwt_required()
def preview_lecturer_session_material(file_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_file_id = _validated_session_id(file_id)
    if not normalized_file_id:
        return jsonify({"message": "Mã file không hợp lệ."}), 400

    try:
        file_row = db.session.execute(
            text(
                """
                SELECT
                    lf.file_data,
                    COALESCE(lf.mime_type, 'application/pdf') AS mime_type,
                    COALESCE(lf.original_file_name, lf.file_name) AS file_name
                FROM lecture_files lf
                JOIN sessions s ON s.session_id = lf.session_id
                JOIN classes c ON c.class_id = s.class_id
                WHERE lf.file_id = CAST(:file_id AS uuid)
                  AND c.lecturer_id = CAST(:lecturer_id AS uuid)
                  AND c.status = 'ACTIVE'
                  AND lf.storage_type = 'BYTEA'
                  AND lower(COALESCE(lf.file_extension, '')) = 'pdf'
                """
            ),
            {"file_id": normalized_file_id, "lecturer_id": lecturer_id},
        ).mappings().first()
        if not file_row:
            return jsonify({"message": "Không tìm thấy file PDF của phiên học."}), 404
        response = send_file(
            BytesIO(bytes(file_row["file_data"])),
            mimetype=file_row["mime_type"],
            as_attachment=False,
            download_name=PurePath(file_row["file_name"]).name,
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to preview session lecture PDF")
        return jsonify({"message": "Không thể mở trang đầu bài giảng."}), 500


def _change_session_status(session_id, target_status, delivery_mode=None):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _validated_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        session = _get_owned_session(normalized_id, lecturer_id, lock=True)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học."}), 404

        current_status = session["status"].upper()
        if target_status == "LIVE":
            if current_status == "LIVE":
                db.session.rollback()
                return jsonify({"session": _serialize_session(session)})
            if current_status != "SCHEDULED":
                db.session.rollback()
                return jsonify({
                    "message": "Chỉ có thể bắt đầu phiên học đang chờ."
                }), 409
            if delivery_mode not in {"ONLINE", "OFFLINE"}:
                db.session.rollback()
                return jsonify({"message": "Vui lòng chọn học online hoặc học offline."}), 400
            db.session.execute(
                text(
                    """
                    UPDATE sessions
                    SET status = 'LIVE',
                        started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                        delivery_mode = :delivery_mode
                    WHERE session_id = CAST(:session_id AS uuid)
                    """
                ),
                {
                    "session_id": normalized_id,
                    "delivery_mode": delivery_mode,
                },
            )
        else:
            if current_status == "ENDED":
                db.session.rollback()
                return jsonify({"session": _serialize_session(session)})
            if current_status != "LIVE":
                db.session.rollback()
                return jsonify({
                    "message": "Chỉ có thể kết thúc phiên học đang diễn ra."
                }), 409
            db.session.execute(
                text(
                    """
                    UPDATE sessions
                    SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP
                    WHERE session_id = CAST(:session_id AS uuid)
                    """
                ),
                {"session_id": normalized_id},
            )

        db.session.commit()
        updated_session = _get_owned_session(normalized_id, lecturer_id)
        return jsonify({"session": _serialize_session(updated_session)})
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to change lecturer session status")
        return jsonify({"message": "Không thể cập nhật trạng thái phiên học."}), 500


@lecturer_session_detail_bp.route("/<session_id>/start", methods=["POST"])
@jwt_required()
def start_lecturer_session(session_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Dữ liệu bắt đầu phiên học không hợp lệ."}), 400
    delivery_mode = payload.get("deliveryMode")
    if not isinstance(delivery_mode, str):
        return jsonify({"message": "Vui lòng chọn học online hoặc học offline."}), 400
    return _change_session_status(session_id, "LIVE", delivery_mode.upper())


@lecturer_session_detail_bp.route("/<session_id>/end", methods=["POST"])
@jwt_required()
def end_lecturer_session(session_id):
    return _change_session_status(session_id, "ENDED")