from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db


giangvien_dashboard_bp = Blueprint(
    "giangvien_dashboard", __name__, url_prefix="/giang-vien/dashboard"
)


OVERVIEW_SQL = text(
    """
    WITH lecturer_classes AS (
        SELECT c.class_id
        FROM classes c
        WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
          AND c.status = 'ACTIVE'
    ),
    class_students AS (
        SELECT DISTINCT cm.student_id
        FROM class_members cm
        JOIN lecturer_classes lc ON lc.class_id = cm.class_id
        WHERE cm.status = 'ACTIVE'
    ),
    class_sessions AS (
        SELECT s.session_id
        FROM sessions s
        JOIN lecturer_classes lc ON lc.class_id = s.class_id
    )
    SELECT
        (SELECT COUNT(*) FROM lecturer_classes) AS total_classes,
        (SELECT COUNT(*) FROM class_students) AS total_students,
        (
            SELECT COUNT(*)
            FROM questions q
            JOIN class_sessions cs ON cs.session_id = q.session_id
        ) AS total_questions,
        (
            SELECT COUNT(*)
            FROM question_groups qg
            JOIN class_sessions cs ON cs.session_id = qg.session_id
        ) AS total_groups
    """
)


QUESTION_GROUPS_SQL = text(
    """
    SELECT
        qg.group_id::text AS id,
        COALESCE(
            NULLIF(qg.group_title, ''),
            NULLIF(rq.original_text, ''),
            'Chưa có tiêu đề'
        ) AS title,
        COUNT(DISTINCT q.question_id) AS question_count,
        COUNT(DISTINCT q.student_session_id) AS students,
        CASE
            WHEN COUNT(q.question_id) = 0 THEN 'Mixed'
            WHEN BOOL_AND(q.language = 'VI') THEN 'Vietnamese'
            WHEN BOOL_AND(q.language = 'EN') THEN 'English'
            ELSE 'Mixed'
        END AS lang,
        CASE
            WHEN qg.status = 'ANSWERED'
                 OR EXISTS (
                     SELECT 1
                     FROM answers a
                     WHERE a.group_id = qg.group_id
                 )
            THEN 'answered'
            ELSE 'pending'
        END AS status
    FROM question_groups qg
    JOIN sessions s ON s.session_id = qg.session_id
    JOIN classes c ON c.class_id = s.class_id
    LEFT JOIN questions rq
        ON rq.question_id = qg.representative_question_id
    LEFT JOIN question_group_members qgm
        ON qgm.group_id = qg.group_id
       AND qgm.is_current = TRUE
    LEFT JOIN questions q ON q.question_id = qgm.question_id
    WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
      AND c.status = 'ACTIVE'
    GROUP BY
        qg.group_id,
        qg.group_title,
        rq.original_text,
        qg.status,
        qg.created_at
    ORDER BY qg.created_at DESC
    LIMIT 6
    """
)


LATENCY_SQL = text(
    """
    SELECT
        tt.processing_time_ms AS latency_ms,
        TO_CHAR(
            tt.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
            'HH24:MI'
        ) AS time
    FROM transcript_translations tt
    JOIN transcripts t ON t.transcript_id = tt.transcript_id
    JOIN sessions s ON s.session_id = t.session_id
    JOIN classes c ON c.class_id = s.class_id
    WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
      AND c.status = 'ACTIVE'
      AND tt.processing_time_ms IS NOT NULL
    ORDER BY tt.created_at DESC
    LIMIT 6
    """
)


ENGAGEMENT_SQL = text(
    """
    WITH lecturer_sessions AS (
        SELECT s.session_id
        FROM sessions s
        JOIN classes c ON c.class_id = s.class_id
        WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
          AND c.status = 'ACTIVE'
    ),
    attendees AS (
        SELECT DISTINCT ss.student_session_id
        FROM student_sessions ss
        JOIN lecturer_sessions ls ON ls.session_id = ss.session_id
    ),
    question_participants AS (
        SELECT DISTINCT q.student_session_id
        FROM questions q
        JOIN lecturer_sessions ls ON ls.session_id = q.session_id
    ),
    poll_participants AS (
        SELECT DISTINCT qqr.student_session_id
        FROM quick_question_responses qqr
        JOIN quick_questions qq
            ON qq.quick_question_id = qqr.quick_question_id
        JOIN lecturer_sessions ls ON ls.session_id = qq.session_id
    ),
    answer_readers AS (
        SELECT DISTINCT ar.student_session_id
        FROM answer_recipients ar
        JOIN answers a ON a.answer_id = ar.answer_id
        JOIN question_groups qg ON qg.group_id = a.group_id
        JOIN lecturer_sessions ls ON ls.session_id = qg.session_id
        WHERE ar.is_read = TRUE
    ),
    engaged AS (
        SELECT student_session_id FROM question_participants
        UNION
        SELECT student_session_id FROM poll_participants
        UNION
        SELECT student_session_id FROM answer_readers
    )
    SELECT
        (SELECT COUNT(*) FROM attendees) AS total_attendees,
        (SELECT COUNT(*) FROM engaged) AS engaged_attendees,
        (SELECT COUNT(*) FROM question_participants) AS question_participants,
        (SELECT COUNT(*) FROM poll_participants) AS poll_participants,
        (SELECT COUNT(*) FROM answer_readers) AS answer_readers
    """
)


FEEDBACK_SQL = text(
    """
    SELECT
        sf.feedback_id::text AS id,
        CASE
            WHEN sf.respondent_role = 'LECTURER'
                THEN COALESCE(l.full_name, 'Giảng viên')
            ELSE COALESCE(st.full_name, 'Sinh viên ẩn danh')
        END AS author,
        CASE
            WHEN sf.respondent_role = 'LECTURER' THEN 'Giảng viên'
            ELSE 'Sinh viên'
        END AS role,
        sf.feedback_text AS comment,
        COALESCE(sf.rating, 0)::int AS rating,
        TO_CHAR(
            sf.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
            'HH12:MI AM'
        ) AS time
    FROM session_feedback sf
    JOIN sessions s ON s.session_id = sf.session_id
    JOIN classes c ON c.class_id = s.class_id
    LEFT JOIN lecturers l ON l.lecturer_id = sf.lecturer_id
    LEFT JOIN students st ON st.student_id = sf.student_id
    WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
      AND c.status = 'ACTIVE'
      AND NULLIF(BTRIM(sf.feedback_text), '') IS NOT NULL
    ORDER BY sf.created_at DESC
    LIMIT 5
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


def _percentage(part, total):
    return round(part * 100 / total) if total else 0


@giangvien_dashboard_bp.route("", methods=["GET"])
@jwt_required()
def get_lecturer_dashboard():
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    try:
        overview = db.session.execute(
            OVERVIEW_SQL, {"lecturer_id": lecturer_id}
        ).mappings().one()
        groups = db.session.execute(
            QUESTION_GROUPS_SQL,
            {"lecturer_id": lecturer_id},
        ).mappings().all()
        latency_rows = db.session.execute(
            LATENCY_SQL, {"lecturer_id": lecturer_id}
        ).mappings().all()
        engagement = db.session.execute(
            ENGAGEMENT_SQL, {"lecturer_id": lecturer_id}
        ).mappings().one()
        feedback_rows = db.session.execute(
            FEEDBACK_SQL, {"lecturer_id": lecturer_id}
        ).mappings().all()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Lecturer dashboard database query failed")
        return jsonify({"message": "Không thể tải dữ liệu dashboard từ cơ sở dữ liệu."}), 500

    total_questions = int(overview["total_questions"] or 0)
    total_groups = int(overview["total_groups"] or 0)
    total_attendees = int(engagement["total_attendees"] or 0)
    engaged_attendees = int(engagement["engaged_attendees"] or 0)

    latency_logs = [
        {
            "time": row["time"],
            "latencyMs": int(row["latency_ms"]),
        }
        for row in reversed(latency_rows)
    ]
    average_latency = (
        round(sum(log["latencyMs"] for log in latency_logs) / len(latency_logs))
        if latency_logs
        else None
    )

    engagement_breakdown = [
        {
            "category": "Đặt câu hỏi trực tiếp",
            "percentage": _percentage(
                int(engagement["question_participants"] or 0), total_attendees
            ),
            "color": "#2563eb",
        },
        {
            "category": "Trả lời câu hỏi nhanh",
            "percentage": _percentage(
                int(engagement["poll_participants"] or 0), total_attendees
            ),
            "color": "#16a34a",
        },
        {
            "category": "Đọc câu trả lời",
            "percentage": _percentage(
                int(engagement["answer_readers"] or 0), total_attendees
            ),
            "color": "#9333ea",
        },
        {
            "category": "Chưa ghi nhận tương tác",
            "percentage": _percentage(
                max(total_attendees - engaged_attendees, 0), total_attendees
            ),
            "color": "#64748b",
        },
    ]

    return jsonify(
        {
            "success": True,
            "data": {
                "overview": {
                    "totalClasses": int(overview["total_classes"] or 0),
                    "totalStudents": int(overview["total_students"] or 0),
                    "totalQuestions": total_questions,
                    "beforeGrouping": total_questions,
                    "afterGrouping": total_groups,
                    "reductionRate": (
                        round((total_questions - total_groups) / total_questions * 100, 1)
                        if total_questions
                        else 0.0
                    ),
                },
                "questionGroups": [
                    {
                        "id": group["id"],
                        "title": group["title"],
                        "students": int(group["students"] or 0),
                        "questionCount": int(group["question_count"] or 0),
                        "lang": group["lang"],
                        "status": group["status"],
                    }
                    for group in groups
                ],
                "translationLatencyLogs": latency_logs,
                "averageLatencyMs": average_latency,
                "engagement": {
                    "score": (
                        _percentage(engaged_attendees, total_attendees)
                        if total_attendees
                        else None
                    ),
                    "breakdown": engagement_breakdown,
                },
                "feedbackList": [
                    {
                        "id": row["id"],
                        "author": row["author"],
                        "role": row["role"],
                        "comment": row["comment"],
                        "rating": int(row["rating"] or 0),
                        "time": row["time"],
                    }
                    for row in feedback_rows
                ],
            },
        }
    )
