from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text

from extensions import db


admin_dashboard_bp = Blueprint(
    "admin_dashboard", __name__, url_prefix="/auth/admin"
)


@admin_dashboard_bp.route("/dashboard", methods=["GET"])
@jwt_required()
def get_admin_dashboard():
    if get_jwt().get("role") != "admin":
        return jsonify({"message": "Administrator access is required."}), 403

    period = request.args.get("period", "day")
    if period not in ("day", "week"):
        return jsonify({"message": "Period must be day or week."}), 400

    try:
        admin = db.session.execute(
            text(
                """
                SELECT full_name, email
                FROM admins
                WHERE lower(email) = lower(:email) AND is_active = true
                """
            ),
            {"email": get_jwt_identity()},
        ).mappings().first()
        if not admin:
            return jsonify({"message": "Administrator account is not available."}), 403

        stats = db.session.execute(
            text(
                """
                SELECT
                    (SELECT COUNT(*) FROM admins)
                    + (SELECT COUNT(*) FROM lecturers)
                    + (SELECT COUNT(*) FROM students) AS "totalAccounts",
                    (
                        SELECT COUNT(*)
                        FROM (
                            SELECT created_at FROM admins
                            UNION ALL SELECT created_at FROM lecturers
                            UNION ALL SELECT created_at FROM students
                        ) AS accounts
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    ) AS "accountsAddedThisWeek",
                    (SELECT COUNT(*) FROM lecturers) AS lecturers,
                    (SELECT COUNT(*) FROM lecturers WHERE is_active = true)
                        AS "lecturersActive",
                    (SELECT COUNT(*) FROM students) AS students,
                    (
                        SELECT COUNT(DISTINCT student_id)
                        FROM student_sessions
                        WHERE student_id IS NOT NULL
                          AND is_active = true
                          AND last_active_at >= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
                    ) AS "studentsOnline",
                    (SELECT COUNT(*) FROM classes) AS classes,
                    (SELECT COUNT(*) FROM classes WHERE lower(status) = 'active')
                        AS "classesActive",
                    (SELECT COUNT(*) FROM sessions) AS sessions,
                    (
                        SELECT COUNT(*)
                        FROM sessions
                        WHERE lower(status) IN (
                            'live', 'active', 'ongoing', 'in_progress',
                            'in progress', 'running'
                        )
                          AND started_at IS NOT NULL
                          AND started_at <= CURRENT_TIMESTAMP
                          AND ended_at IS NULL
                    ) AS "sessionsOngoing",
                    (SELECT COUNT(*) FROM questions) AS questions,
                    (
                        SELECT COUNT(*) FROM questions
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    ) AS "questionsAddedThisWeek",
                    (SELECT COUNT(*) FROM question_groups) AS "questionGroups",
                    (
                        SELECT COUNT(*) FROM question_groups
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    ) AS "questionGroupsAddedThisWeek"
                """
            )
        ).mappings().one()

        distribution = db.session.execute(
            text(
                """
                SELECT
                    (SELECT COUNT(*) FROM admins) AS admin,
                    (SELECT COUNT(*) FROM lecturers) AS lecturer,
                    (SELECT COUNT(*) FROM students) AS student
                """
            )
        ).mappings().one()

        activities = db.session.execute(
            text(
                """
                SELECT log_id, action, description, actor_role, created_at
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT 8
                """
            )
        ).mappings().all()

        if period == "week":
            bucket_interval = "1 week"
            series_start = "date_trunc('week', CURRENT_DATE) - INTERVAL '6 weeks'"
            series_end = "date_trunc('week', CURRENT_DATE)"
        else:
            bucket_interval = "1 day"
            series_start = "CURRENT_DATE - INTERVAL '6 days'"
            series_end = "CURRENT_DATE"

        overview_sql = f"""
            SELECT to_char(buckets.bucket, 'DD/MM') AS date,
                (
                    SELECT COUNT(*) FROM (
                        SELECT created_at FROM admins
                        UNION ALL SELECT created_at FROM lecturers
                        UNION ALL SELECT created_at FROM students
                    ) AS accounts
                    WHERE accounts.created_at >= buckets.bucket
                      AND accounts.created_at < buckets.bucket + INTERVAL '{bucket_interval}'
                ) AS accounts,
                (
                    SELECT COUNT(*) FROM questions
                    WHERE questions.created_at >= buckets.bucket
                      AND questions.created_at < buckets.bucket + INTERVAL '{bucket_interval}'
                ) AS questions,
                (
                    SELECT COUNT(*) FROM sessions
                    WHERE sessions.created_at >= buckets.bucket
                      AND sessions.created_at < buckets.bucket + INTERVAL '{bucket_interval}'
                ) AS sessions,
                (
                    SELECT COUNT(*) FROM question_groups
                    WHERE question_groups.created_at >= buckets.bucket
                      AND question_groups.created_at < buckets.bucket + INTERVAL '{bucket_interval}'
                ) AS "questionGroups"
            FROM generate_series(
                {series_start},
                {series_end},
                INTERVAL '{bucket_interval}'
            ) AS buckets(bucket)
            ORDER BY buckets.bucket
        """
        system_overview = db.session.execute(
            text(overview_sql)
        ).mappings().all()

        return jsonify(
            {
                "stats": dict(stats),
                "distribution": dict(distribution),
                "activities": [
                    {
                        "id": str(item["log_id"]),
                        "time": item["created_at"].isoformat(),
                        "title": item["action"],
                        "description": item["description"] or item["action"],
                        "actor": item["actor_role"],
                    }
                    for item in activities
                ],
                "systemOverview": [dict(point) for point in system_overview],
                "admin": {"name": admin["full_name"], "email": admin["email"]},
            }
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin dashboard data lookup failed")
        return jsonify(
            {"message": "Dashboard data is temporarily unavailable. Please try again."}
        ), 503
