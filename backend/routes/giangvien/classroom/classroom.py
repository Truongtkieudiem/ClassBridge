import secrets
from datetime import date, datetime, time, timedelta, timezone

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from extensions import db


lecturer_classroom_bp = Blueprint(
    "lecturer_classroom", __name__, url_prefix="/auth/lecturer/dashboard"
)

VIETNAM_TZ = timezone(timedelta(hours=7))

CLASSROOM_SESSIONS_SQL = text(
    """
    WITH week_bounds AS (
        SELECT
            (
                (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                - EXTRACT(
                    ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
                )::int + 1
            )::date AS week_start
    )
    SELECT
        s.session_id::text AS id,
        c.class_code AS "classCode",
        c.class_name AS "className",
        s.session_title AS title,
        cs.start_time AS "startsAt",
        cs.end_time AS "endsAt",
        CASE WHEN upper(s.status) = 'LIVE' THEN 'live' ELSE 'upcoming' END AS status,
        COALESCE(question_counts.question_count, 0)::int AS "questionCount",
        COALESCE(student_counts.student_count, 0)::int AS "studentCount"
    FROM sessions s
    JOIN classes c ON c.class_id = s.class_id
    JOIN class_schedules cs ON cs.schedule_id = s.schedule_id
    CROSS JOIN week_bounds b
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS question_count
        FROM questions q
        WHERE q.session_id = s.session_id
    ) question_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS student_count
        FROM student_sessions ss
        WHERE ss.session_id = s.session_id
    ) student_counts ON TRUE
    WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
      AND c.status = 'ACTIVE'
      AND cs.schedule_type = 'CLASS'
      AND cs.status <> 'CANCELLED'
      AND cs.start_time >= timezone('Asia/Ho_Chi_Minh', b.week_start::timestamp)
      AND cs.start_time < timezone(
          'Asia/Ho_Chi_Minh',
          (b.week_start + 7)::timestamp
      )
      AND cs.end_time >= CURRENT_TIMESTAMP
      AND upper(s.status) <> 'CANCELLED'
    ORDER BY cs.start_time ASC
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


def _recurrence_end_date(rule):
    until = next(
        (
            part.removeprefix("UNTIL=")
            for part in (rule or "").split(";")
            if part.startswith("UNTIL=")
        ),
        None,
    )
    if not until:
        return None
    try:
        if len(until) == 8:
            return datetime.strptime(until, "%Y%m%d").date()
        return datetime.strptime(until[:8], "%Y%m%d").date()
    except ValueError:
        return None


def _materialize_existing_recurring_sessions(lecturer_id):
    schedules = db.session.execute(
        text(
            """
            SELECT
                cs.schedule_id::text AS schedule_id,
                cs.class_id::text AS class_id,
                cs.title,
                cs.description,
                cs.start_time,
                cs.end_time,
                cs.status,
                cs.created_by_lecturer_id::text AS lecturer_id,
                cs.recurrence_rule,
                s.session_id::text AS session_id
            FROM class_schedules cs
            JOIN classes c ON c.class_id = cs.class_id
            LEFT JOIN LATERAL (
                SELECT sessions.session_id
                FROM sessions
                WHERE sessions.schedule_id = cs.schedule_id
                ORDER BY sessions.created_at
                LIMIT 1
            ) s ON TRUE
            WHERE c.lecturer_id = CAST(:lecturer_id AS uuid)
              AND c.status = 'ACTIVE'
              AND cs.schedule_type = 'CLASS'
              AND cs.status <> 'CANCELLED'
              AND cs.recurrence_rule LIKE 'FREQ=WEEKLY;BYDAY=%'
            ORDER BY cs.schedule_id
            FOR UPDATE OF cs
            """
        ),
        {"lecturer_id": lecturer_id},
    ).mappings().all()

    for schedule in schedules:
        start_at = schedule["start_time"].astimezone(VIETNAM_TZ)
        end_at = schedule["end_time"].astimezone(VIETNAM_TZ)
        end_date = _recurrence_end_date(schedule["recurrence_rule"])
        if not end_date or end_date < start_at.date():
            end_date = start_at.date()

        if not schedule["session_id"]:
            db.session.execute(
                text(
                    """
                    INSERT INTO sessions (
                        class_id, schedule_id, session_title, status, join_code
                    )
                    VALUES (
                        CAST(:class_id AS uuid), CAST(:schedule_id AS uuid),
                        :title, 'SCHEDULED', :join_code
                    )
                    """
                ),
                {
                    "class_id": schedule["class_id"],
                    "schedule_id": schedule["schedule_id"],
                    "title": schedule["title"],
                    "join_code": secrets.token_urlsafe(9),
                },
            )

        occurrence_date = start_at.date() + timedelta(days=7)
        while occurrence_date <= end_date:
            occurrence_start = datetime.combine(
                occurrence_date, start_at.timetz().replace(tzinfo=None), VIETNAM_TZ
            )
            occurrence_end = datetime.combine(
                occurrence_date, end_at.timetz().replace(tzinfo=None), VIETNAM_TZ
            )
            schedule_id = db.session.execute(
                text(
                    """
                    INSERT INTO class_schedules (
                        class_id, schedule_type, title, description,
                        start_time, end_time, room_name, meeting_url, status,
                        created_by_lecturer_id
                    )
                    SELECT
                        CAST(:class_id AS uuid), source.schedule_type,
                        source.title, source.description, :start_time, :end_time,
                        source.room_name, source.meeting_url, source.status,
                        source.created_by_lecturer_id
                    FROM class_schedules source
                    WHERE source.schedule_id = CAST(:source_id AS uuid)
                    RETURNING schedule_id::text
                    """
                ),
                {
                    "class_id": schedule["class_id"],
                    "source_id": schedule["schedule_id"],
                    "start_time": occurrence_start,
                    "end_time": occurrence_end,
                },
            ).scalar_one()
            db.session.execute(
                text(
                    """
                    INSERT INTO sessions (
                        class_id, schedule_id, session_title, status, join_code
                    )
                    VALUES (
                        CAST(:class_id AS uuid), CAST(:schedule_id AS uuid),
                        :title, 'SCHEDULED', :join_code
                    )
                    """
                ),
                {
                    "class_id": schedule["class_id"],
                    "schedule_id": schedule_id,
                    "title": schedule["title"],
                    "join_code": secrets.token_urlsafe(9),
                },
            )
            occurrence_date += timedelta(days=7)

        db.session.execute(
            text(
                """
                UPDATE class_schedules
                SET recurrence_rule = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE schedule_id = CAST(:schedule_id AS uuid)
                """
            ),
            {"schedule_id": schedule["schedule_id"]},
        )


@lecturer_classroom_bp.route("/classroom-sessions", methods=["GET"])
@jwt_required()
def list_classroom_sessions():
    lecturer_id = _lecturer_id()
    if not lecturer_id:
        return jsonify({"message": "Không tìm thấy tài khoản giảng viên."}), 403

    try:
        _materialize_existing_recurring_sessions(lecturer_id)
        db.session.commit()
        rows = db.session.execute(
            CLASSROOM_SESSIONS_SQL, {"lecturer_id": lecturer_id}
        ).mappings().all()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Failed to load lecturer classroom sessions")
        return jsonify({"message": "Không thể tải danh sách phiên học."}), 500

    return jsonify(
        {
            "sessions": [
                {
                    "id": row["id"],
                    "classCode": row["classCode"],
                    "className": row["className"],
                    "title": row["title"],
                    "startsAt": (
                        row["startsAt"].isoformat() if row["startsAt"] else None
                    ),
                    "endsAt": row["endsAt"].isoformat() if row["endsAt"] else None,
                    "status": row["status"],
                    "questionCount": row["questionCount"],
                    "studentCount": row["studentCount"],
                }
                for row in rows
            ]
        }
    )
