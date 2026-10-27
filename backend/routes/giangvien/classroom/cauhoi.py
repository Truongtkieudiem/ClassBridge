import base64
import binascii
import json
from pathlib import PurePath
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db


lecturer_quick_questions_bp = Blueprint(
    "lecturer_quick_questions",
    __name__,
    url_prefix="/auth/lecturer/sessions",
)

QUESTION_TYPES = {
    "POLL",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
    "ORDERING",
    "MATCHING",
}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024
MAX_QUESTION_IMAGES_SIZE_BYTES = 8 * 1024 * 1024


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


def _normalize_session_id(session_id):
    try:
        return str(UUID(session_id))
    except (ValueError, TypeError, AttributeError):
        return None


def _decode_image(option):
    image_data_url = option.get("imageDataUrl")
    image_name = option.get("imageName")
    if image_data_url in (None, ""):
        return None
    if not isinstance(image_data_url, str) or not image_data_url.startswith("data:"):
        raise ValueError("Ảnh lựa chọn không hợp lệ.")

    header, separator, encoded_data = image_data_url.partition(",")
    mime_type = header[5:].removesuffix(";base64")
    if (
        not separator
        or not header.endswith(";base64")
        or mime_type not in ALLOWED_IMAGE_MIME_TYPES
    ):
        raise ValueError("Ảnh chỉ hỗ trợ định dạng PNG, JPG hoặc WebP.")

    try:
        image_bytes = base64.b64decode(encoded_data, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Dữ liệu ảnh không hợp lệ.") from None
    if not image_bytes:
        raise ValueError("File ảnh đang trống.")
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Mỗi ảnh lựa chọn có dung lượng tối đa 2 MB.")
    valid_signature = (
        mime_type == "image/png"
        and image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    ) or (
        mime_type == "image/jpeg"
        and image_bytes.startswith(b"\xff\xd8\xff")
    ) or (
        mime_type == "image/webp"
        and image_bytes.startswith(b"RIFF")
        and image_bytes[8:12] == b"WEBP"
    )
    if not valid_signature:
        raise ValueError("Nội dung file không khớp với định dạng ảnh.")

    normalized_name = (
        PurePath(image_name).name[:255]
        if isinstance(image_name, str) and image_name.strip()
        else None
    )
    return {
        "bytes": image_bytes,
        "mimeType": mime_type,
        "name": normalized_name,
    }


def _normalize_question(payload):
    if not isinstance(payload, dict):
        raise ValueError("Dữ liệu câu hỏi không hợp lệ.")

    question_text = payload.get("question")
    question_type = payload.get("questionType")
    if not isinstance(question_text, str) or not question_text.strip():
        raise ValueError("Vui lòng nhập nội dung câu hỏi.")
    question_text = question_text.strip()
    if len(question_text) > 500:
        raise ValueError("Câu hỏi không được dài quá 500 ký tự.")
    if not isinstance(question_type, str) or question_type not in QUESTION_TYPES:
        raise ValueError("Loại câu hỏi không được hỗ trợ.")

    question_payload = {}
    raw_options = payload.get("options", [])
    if question_type == "MATCHING":
        pairs = payload.get("pairs")
        if not isinstance(pairs, list) or not 2 <= len(pairs) <= 8:
            raise ValueError("Câu hỏi nối đôi cần từ 2 đến 8 cặp.")
        normalized_pairs = []
        for pair in pairs:
            if not isinstance(pair, dict):
                raise ValueError("Nội dung mỗi cặp nối không hợp lệ.")
            left = pair.get("left")
            right = pair.get("right")
            if (
                not isinstance(left, str)
                or not left.strip()
                or not isinstance(right, str)
                or not right.strip()
            ):
                raise ValueError("Vui lòng điền đủ hai vế của mỗi cặp nối.")
            if len(left.strip()) > 200 or len(right.strip()) > 200:
                raise ValueError("Mỗi vế của cặp nối không được dài quá 200 ký tự.")
            normalized_pairs.append({"left": left.strip(), "right": right.strip()})
        if (
            len({pair["left"].casefold() for pair in normalized_pairs})
            != len(normalized_pairs)
            or len({pair["right"].casefold() for pair in normalized_pairs})
            != len(normalized_pairs)
        ):
            raise ValueError("Mỗi mục ở hai cột nối đôi cần khác nhau.")
        raw_options = [
            {"text": pair["left"], "isCorrect": False}
            for pair in normalized_pairs
        ]
        question_payload["pairs"] = normalized_pairs
    elif question_type == "SHORT_ANSWER":
        raw_options = []
    elif not isinstance(raw_options, list):
        raise ValueError("Danh sách lựa chọn không hợp lệ.")

    minimum_options = 2 if question_type in {
        "POLL",
        "MULTIPLE_CHOICE",
        "TRUE_FALSE",
        "ORDERING",
        "MATCHING",
    } else 0
    maximum_options = 8 if question_type in {"ORDERING", "MATCHING"} else 6
    if not minimum_options <= len(raw_options) <= maximum_options:
        raise ValueError(
            "Câu hỏi cần có từ 2 đến 6 lựa chọn, hoặc từ 2 đến 8 mục cho dạng sắp xếp/nối đôi."
        )
    if question_type == "TRUE_FALSE" and len(raw_options) != 2:
        raise ValueError("Câu hỏi đúng/sai phải có đúng hai lựa chọn.")

    normalized_options = []
    total_image_bytes = 0
    for raw_option in raw_options:
        if not isinstance(raw_option, dict):
            raise ValueError("Nội dung lựa chọn không hợp lệ.")
        option_text = raw_option.get("text", "")
        if not isinstance(option_text, str):
            raise ValueError("Nội dung lựa chọn không hợp lệ.")
        option_text = option_text.strip()
        image = _decode_image(raw_option)
        if not option_text and not image:
            raise ValueError("Mỗi lựa chọn cần có nội dung hoặc hình ảnh.")
        if len(option_text) > 200:
            raise ValueError("Mỗi lựa chọn không được dài quá 200 ký tự.")
        if image:
            total_image_bytes += len(image["bytes"])
        normalized_options.append(
            {
                "text": option_text,
                "isCorrect": raw_option.get("isCorrect") is True,
                "image": image,
            }
        )

    if total_image_bytes > MAX_QUESTION_IMAGES_SIZE_BYTES:
        raise ValueError("Tổng dung lượng ảnh trong câu hỏi tối đa 8 MB.")
    if question_type in {"TRUE_FALSE", "ORDERING"}:
        option_texts = [option["text"].casefold() for option in normalized_options]
        if len(set(option_texts)) != len(option_texts):
            raise ValueError("Các lựa chọn trong câu hỏi cần khác nhau.")
    if question_type in {"MULTIPLE_CHOICE", "TRUE_FALSE"} and sum(
        option["isCorrect"] for option in normalized_options
    ) != 1:
        raise ValueError("Vui lòng chọn đúng một đáp án đúng.")
    if question_type in {"POLL", "ORDERING", "MATCHING", "SHORT_ANSWER"}:
        for option in normalized_options:
            option["isCorrect"] = False
    if question_type == "ORDERING":
        question_payload["correctOrder"] = [
            option["text"] for option in normalized_options
        ]

    return question_text, question_type, question_payload, normalized_options


def _owned_live_session(session_id, lecturer_id, *, lock=False):
    lock_clause = " FOR UPDATE OF s" if lock else ""
    return db.session.execute(
        text(
            f"""
            SELECT s.session_id::text AS id, s.status
            FROM sessions s
            JOIN classes c ON c.class_id = s.class_id
            WHERE s.session_id = CAST(:session_id AS uuid)
              AND c.lecturer_id = CAST(:lecturer_id AS uuid)
              AND c.status = 'ACTIVE'
            {lock_clause}
            """
        ),
        {"session_id": session_id, "lecturer_id": lecturer_id},
    ).mappings().first()


def _serialize_question(row):
    return {
        "id": row["option_id"],
        "text": row["option_text"],
        "isCorrect": row["is_correct"],
        "hasImage": row["has_image"],
        "imageName": row["image_name"],
    }


@lecturer_quick_questions_bp.route("/<session_id>/quick-questions", methods=["GET"])
@jwt_required()
def list_quick_questions(session_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _normalize_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        session = _owned_live_session(normalized_id, lecturer_id)
        if not session:
            return jsonify({"message": "Không tìm thấy phiên học đang diễn ra."}), 404

        rows = db.session.execute(
            text(
                """
                WITH recent_questions AS (
                    SELECT
                        quick_question_id,
                        question_text,
                        question_type,
                        question_payload,
                        is_published,
                        created_at
                    FROM quick_questions
                    WHERE session_id = CAST(:session_id AS uuid)
                      AND lecturer_id = CAST(:lecturer_id AS uuid)
                    ORDER BY created_at DESC
                    LIMIT 50
                )
                SELECT
                    q.quick_question_id::text AS id,
                    q.question_text AS question,
                    q.question_type AS "questionType",
                    q.question_payload AS payload,
                    q.is_published AS "isPublished",
                    q.created_at AS "createdAt",
                    o.option_id::text AS option_id,
                    o.option_text AS option_text,
                    o.is_correct AS is_correct,
                    (o.image_data IS NOT NULL) AS has_image,
                    o.image_name AS image_name
                FROM quick_questions q
                LEFT JOIN quick_question_options o
                    ON o.quick_question_id = q.quick_question_id
                ORDER BY q.created_at DESC, o.option_order
                """
            ),
            {"session_id": normalized_id, "lecturer_id": lecturer_id},
        ).mappings().all()

        questions_by_id = {}
        for row in rows:
            question = questions_by_id.setdefault(
                row["id"],
                {
                    "id": row["id"],
                    "question": row["question"],
                    "questionType": row["questionType"],
                    "payload": row["payload"] or {},
                    "isPublished": row["isPublished"],
                    "createdAt": row["createdAt"].isoformat(),
                    "options": [],
                },
            )
            if row["option_id"]:
                question["options"].append(_serialize_question(row))
        return jsonify({"questions": list(questions_by_id.values())})
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to load lecturer quick questions")
        return jsonify({"message": "Không thể tải danh sách câu hỏi."}), 500


@lecturer_quick_questions_bp.route(
    "/<session_id>/quick-questions", methods=["POST"]
)
@jwt_required()
def create_quick_question(session_id):
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    normalized_id = _normalize_session_id(session_id)
    if not normalized_id:
        return jsonify({"message": "Mã phiên học không hợp lệ."}), 400

    try:
        question_text, question_type, question_payload, options = _normalize_question(
            request.get_json(silent=True)
        )
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    try:
        session = _owned_live_session(normalized_id, lecturer_id, lock=True)
        if not session:
            return jsonify(
                {"message": "Chỉ giảng viên phụ trách mới được tạo câu hỏi trong phiên đang diễn ra."}
            ), 404

        question_id = db.session.execute(
            text(
                """
                INSERT INTO quick_questions (
                    session_id, lecturer_id, question_text, question_type,
                    question_payload, is_published, opened_at
                )
                VALUES (
                    CAST(:session_id AS uuid), CAST(:lecturer_id AS uuid),
                    :question_text, :question_type,
                    CAST(:question_payload AS jsonb), TRUE, CURRENT_TIMESTAMP
                )
                RETURNING quick_question_id::text
                """
            ),
            {
                "session_id": normalized_id,
                "lecturer_id": lecturer_id,
                "question_text": question_text,
                "question_type": question_type,
                "question_payload": json.dumps(question_payload),
            },
        ).scalar_one()

        if options:
            db.session.execute(
                text(
                    """
                    INSERT INTO quick_question_options (
                        quick_question_id, option_text, option_order, is_correct,
                        image_data, image_mime_type, image_name
                    )
                    VALUES (
                        CAST(:question_id AS uuid), :option_text, :option_order,
                        :is_correct, :image_data, :image_mime_type, :image_name
                    )
                    """
                ),
                [
                    {
                        "question_id": question_id,
                        "option_text": option["text"],
                        "option_order": order,
                        "is_correct": option["isCorrect"],
                        "image_data": option["image"]["bytes"]
                        if option["image"]
                        else None,
                        "image_mime_type": option["image"]["mimeType"]
                        if option["image"]
                        else None,
                        "image_name": option["image"]["name"]
                        if option["image"]
                        else None,
                    }
                    for order, option in enumerate(options, start=1)
                ],
            )

        db.session.commit()
        return jsonify(
            {
                "message": "Đã tạo câu hỏi nhanh.",
                "question": {
                    "id": question_id,
                    "question": question_text,
                    "questionType": question_type,
                    "payload": question_payload,
                    "options": [
                        {
                            "text": option["text"],
                            "isCorrect": option["isCorrect"],
                            "imageName": option["image"]["name"]
                            if option["image"]
                            else None,
                        }
                        for option in options
                    ],
                },
            }
        ), 201
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to create lecturer quick question")
        return jsonify({"message": "Không thể tạo câu hỏi nhanh."}), 500
