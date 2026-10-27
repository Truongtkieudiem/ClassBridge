from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required
from sqlalchemy import text

from extensions import db


admin_engagement_bp = Blueprint(
    "admin_engagement", __name__, url_prefix="/auth/admin/engagement"
)


def _admin_required():
    if get_jwt().get("role") != "admin":
        return jsonify({"message": "Administrator access is required."}), 403
    return None


def _check_admin():
    admin = db.session.execute(
        text(
            """
            SELECT 1
            FROM admins
            WHERE lower(email) = lower(:email) AND is_active = true
            """
        ),
        {"email": get_jwt_identity()},
    ).first()
    if not admin:
        return jsonify({"message": "Administrator account is not available."}), 403
    return None


def _format_relative_time(seconds):
    if seconds is None:
        return "Chưa có hoạt động"
    try:
        seconds = float(seconds)
    except (TypeError, ValueError):
        return "Chưa có hoạt động"
    if seconds < 60:
        return "Vừa xong"
    minutes = seconds / 60
    if minutes < 60:
        return f"{int(minutes)} phút trước"
    hours = minutes / 60
    if hours < 24:
        return f"{int(hours)} giờ trước"
    days = hours / 24
    if days < 30:
        return f"{int(days)} ngày trước"
    months = days / 30
    if months < 12:
        return f"{int(months)} tháng trước"
    return "Hơn 1 năm trước"


@admin_engagement_bp.route("/overview", methods=["GET"])
@jwt_required()
def get_engagement_overview():
    denied = _admin_required()
    if denied:
        return denied
    admin_denied = _check_admin()
    if admin_denied:
        return admin_denied

    try:
        stats = db.session.execute(
            text(
                """
                WITH account_counts AS (
                    SELECT
                        (SELECT COUNT(*) FROM admins)
                            + (SELECT COUNT(*) FROM lecturers)
                            + (SELECT COUNT(*) FROM students) AS total_accounts,
                        (SELECT COUNT(*) FROM lecturers) AS total_lecturers,
                        (SELECT COUNT(*) FROM students) AS total_students,
                        (SELECT COUNT(*) FROM classes) AS total_classes,
                        (
                            SELECT COUNT(*)
                            FROM sessions
                            WHERE ended_at IS NOT NULL
                               OR lower(status) IN ('ended', 'completed', 'finished', 'done')
                        ) AS completed_sessions,
                        (SELECT COUNT(*) FROM students WHERE is_active = true) AS active_students,
                        (SELECT COUNT(*) FROM lecturers WHERE is_active = true) AS active_lecturers
                ),
                login_activity AS (
                    SELECT
                        -- Gộp sinh viên và giảng viên: mỗi tài khoản chỉ thuộc một vai trò.
                        COUNT(DISTINCT student_id) FILTER (
                            WHERE created_at::date = CURRENT_DATE
                        ) + COUNT(DISTINCT lecturer_id) FILTER (
                            WHERE created_at::date = CURRENT_DATE
                        ) AS active_today,
                        COUNT(DISTINCT student_id) FILTER (
                            WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
                        ) + COUNT(DISTINCT lecturer_id) FILTER (
                            WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
                        ) AS active_week,
                        COUNT(DISTINCT student_id) FILTER (
                            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
                        ) AS active_students_month,
                        COUNT(DISTINCT lecturer_id) FILTER (
                            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
                        ) AS active_lecturers_month
                    FROM audit_logs
                    WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
                )
                SELECT
                    a.total_accounts,
                    a.total_lecturers,
                    a.total_students,
                    a.total_classes,
                    a.completed_sessions,
                    a.active_students,
                    a.active_lecturers,
                    COALESCE(l.active_today, 0) AS active_today,
                    COALESCE(l.active_week, 0) AS active_week,
                    COALESCE(l.active_students_month, 0) AS active_month,
                    COALESCE(l.active_lecturers_month, 0) AS active_lecturers_month
                FROM account_counts a
                CROSS JOIN login_activity l
                """
            ),
        ).mappings().one()

        daily_rows = db.session.execute(
            text(
                """
                WITH days AS (
                    SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS day
                ),
                logins AS (
                    SELECT created_at::date AS day, COUNT(*) AS logins
                    FROM audit_logs
                    WHERE lower(action) IN ('đăng nhập', 'login', 'logged in')
                      AND created_at >= CURRENT_DATE - INTERVAL '6 days'
                    GROUP BY 1
                ),
                question_counts AS (
                    SELECT created_at::date AS day, COUNT(*) AS questions
                    FROM questions
                    WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
                    GROUP BY 1
                )
                SELECT to_char(d.day, 'DD/MM') AS date,
                       COALESCE(l.logins, 0)::int AS logins,
                       COALESCE(q.questions, 0)::int AS questions
                FROM days d
                LEFT JOIN logins l ON l.day = d.day
                LEFT JOIN question_counts q ON q.day = d.day
                ORDER BY d.day
                """
            ),
        ).mappings().all()

        monthly_rows = db.session.execute(
            text(
                """
                WITH months AS (
                    SELECT generate_series(
                        date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                        date_trunc('month', CURRENT_DATE),
                        INTERVAL '1 month'
                    )::date AS month
                ),
                subtitle_month AS (
                    SELECT date_trunc('month', t.created_at)::date AS month, COUNT(*) AS subtitles
                    FROM transcript_translations t
                    WHERE t.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
                    GROUP BY 1
                ),
                qa_month AS (
                    SELECT date_trunc('month', q.created_at)::date AS month, COUNT(*) AS questions
                    FROM questions q
                    WHERE q.created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
                    GROUP BY 1
                )
                SELECT TO_CHAR(m.month, 'MM') AS month_num,
                       COALESCE(s.subtitles, 0)::int AS live_subtitles,
                       COALESCE(qa.questions, 0)::int AS ai_qna_group
                FROM months m
                LEFT JOIN subtitle_month s ON s.month = m.month
                LEFT JOIN qa_month qa ON qa.month = m.month
                ORDER BY m.month
                """
            ),
        ).mappings().all()

        qa_status = db.session.execute(
            text(
                """
                SELECT
                    CASE status
                        WHEN 'ANSWERED' THEN 'Đã trả lời'
                        ELSE 'Chờ xử lý'
                    END AS name,
                    COUNT(*)::int AS value
                FROM question_groups
                GROUP BY 1
                """
            ),
        ).mappings().all()

        feature_stats = db.session.execute(
            text(
                """
                SELECT
                    (SELECT COUNT(*) FROM transcript_translations) AS subtitle_views,
                    (SELECT COUNT(*) FROM questions) AS questions_sent,
                    (SELECT COUNT(*) FROM answer_recipients) AS answer_views,
                    (SELECT COUNT(*) FROM question_groups) AS groups_total,
                    (SELECT COUNT(*) FROM question_groups WHERE status = 'ANSWERED') AS groups_answered,
                    (SELECT COUNT(*) FROM session_feedback) AS feedback_total,
                    (SELECT COUNT(*) FROM slide_interactions) AS slide_interactions_total
                """
            ),
        ).mappings().one()

        total_accounts = int(stats["total_accounts"] or 0)
        active_month = int(stats["active_month"] or 0) + int(
            stats["active_lecturers_month"] or 0
        )
        active_rate = (
            round(active_month * 100.0 / total_accounts, 1) if total_accounts else 0.0
        )

        qa_colors = {"Đã trả lời": "#10B981", "Chờ xử lý": "#F59E0B"}
        qa_status_data = [
            {
                "name": row["name"],
                "value": int(row["value"]),
                "color": qa_colors.get(row["name"], "#94A3B8"),
            }
            for row in qa_status
        ]
        total_groups = sum(entry["value"] for entry in qa_status_data)
        if total_groups:
            qa_status_data = [
                {
                    **entry,
                    "value": round(entry["value"] * 100.0 / total_groups),
                }
                for entry in qa_status_data
            ]

        answered_groups = int(feature_stats["groups_answered"] or 0)
        groups_total = int(feature_stats["groups_total"] or 0)
        answered_percent = (
            round(answered_groups * 100.0 / groups_total) if groups_total else 0
        )
        pending_percent = 100 - answered_percent

        monthly_usage = [
            {
                "month": row["month_num"],
                "liveSubtitles": row["live_subtitles"],
                "aiQnaGroup": row["ai_qna_group"],
            }
            for row in monthly_rows
        ]

        return jsonify(
            {
                "overview": {
                    "totalAccounts": total_accounts,
                    "activeToday": int(stats["active_today"] or 0),
                    "activeThisWeek": int(stats["active_week"] or 0),
                    "activeThisMonth": active_month,
                    "activeStudents": int(stats["active_students"] or 0),
                    "activeLecturers": int(stats["active_lecturers"] or 0),
                    "totalClasses": int(stats["total_classes"] or 0),
                    "completedSessions": int(stats["completed_sessions"] or 0),
                    "overallActiveRate": active_rate,
                },
                "dailyActivity": [
                    {
                        "date": row["date"],
                        "logins": row["logins"],
                        "questions": row["questions"],
                    }
                    for row in daily_rows
                ],
                "monthlyTrends": monthly_usage,
                "qaStatus": qa_status_data,
                "features": {
                    "subtitleViews": int(feature_stats["subtitle_views"] or 0),
                    "questionsSent": int(feature_stats["questions_sent"] or 0),
                    "answerViews": int(feature_stats["answer_views"] or 0),
                    "groupsAnswered": answered_groups,
                    "groupsTotal": groups_total,
                    "answeredPercent": answered_percent,
                    "pendingPercent": pending_percent,
                },
            }
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin engagement overview failed")
        return jsonify({"message": "Không thể tải dữ liệu tương tác."}), 503


@admin_engagement_bp.route("/accounts", methods=["GET"])
@jwt_required()
def get_engagement_accounts():
    denied = _admin_required()
    if denied:
        return denied
    admin_denied = _check_admin()
    if admin_denied:
        return admin_denied

    try:
        search = (request.args.get("search", "") or "").strip()
        role = (request.args.get("role", "") or "").strip().upper()
        try:
            limit = min(200, max(1, int(request.args.get("limit", "100"))))
        except ValueError:
            limit = 100

        params: dict[str, object] = {"limit": limit}
        where = []
        if search:
            params["search"] = f"%{search}%"
            where.append("(p.full_name ILIKE :search OR p.email ILIKE :search)")
        if role in ("STUDENT", "LECTURER"):
            params["role"] = role
            where.append("p.role = :role")
        where_clause = f"WHERE {' AND '.join(where)}" if where else ""

        rows = db.session.execute(
            text(
                f"""
                WITH persons AS (
                    SELECT student_id AS person_id, 'STUDENT' AS role, full_name,
                           email, last_login_at
                    FROM students
                    UNION ALL
                    SELECT lecturer_id, 'LECTURER', full_name, email, last_login_at
                    FROM lecturers
                ),
                activity AS (
                    SELECT student_id AS actor_id, created_at
                    FROM audit_logs
                    WHERE actor_role = 'STUDENT' AND student_id IS NOT NULL
                    UNION ALL
                    SELECT lecturer_id, created_at
                    FROM audit_logs
                    WHERE actor_role = 'LECTURER' AND lecturer_id IS NOT NULL
                ),
                last_activity AS (
                    SELECT actor_id,
                           MAX(created_at) AS last_action
                    FROM activity
                    GROUP BY actor_id
                ),
                joined_sessions AS (
                    SELECT student_id, COUNT(*) AS joined_sessions
                    FROM student_sessions
                    GROUP BY student_id
                ),
                question_stats AS (
                    SELECT ss.student_id, COUNT(q.question_id) AS questions_sent
                    FROM student_sessions ss
                    JOIN questions q ON q.student_session_id = ss.student_session_id
                    GROUP BY ss.student_id
                ),
                hosted AS (
                    SELECT c.lecturer_id, COUNT(*) AS hosted_sessions
                    FROM sessions s
                    JOIN classes c ON c.class_id = s.class_id
                    GROUP BY c.lecturer_id
                ),
                answered_groups AS (
                    SELECT lecturer_id, COUNT(DISTINCT group_id) AS answered_groups
                    FROM answers
                    GROUP BY lecturer_id
                ),
                student_subtitle_usage AS (
                    SELECT ss.student_id, COUNT(*) AS subtitle_views
                    FROM student_sessions ss
                    JOIN transcripts t ON t.session_id = ss.session_id
                    JOIN transcript_translations tt
                        ON tt.transcript_id = t.transcript_id
                    GROUP BY ss.student_id
                ),
                student_answer_views AS (
                    SELECT ss.student_id, COUNT(*) AS answer_views
                    FROM student_sessions ss
                    JOIN answer_recipients ar
                        ON ar.student_session_id = ss.student_session_id
                    GROUP BY ss.student_id
                ),
                daily_activity AS (
                    SELECT actor_id,
                           jsonb_agg(
                               jsonb_build_object('date', to_char(day, 'DD/MM'), 'actions', total)
                               ORDER BY day
                           ) AS activity_history
                    FROM (
                        SELECT actor_id, created_at::date AS day, COUNT(*) AS total
                        FROM activity
                        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
                        GROUP BY actor_id, created_at::date
                    ) per_day
                    GROUP BY actor_id
                ),
                attendance AS (
                    SELECT ss.student_id,
                           s.class_id,
                           COALESCE(
                               ROUND(
                                   COUNT(*) FILTER (
                                       WHERE ss.is_active OR ss.left_at IS NOT NULL
                                   )::numeric * 100.0 / NULLIF(COUNT(*), 0)
                               ),
                               0
                           )::int AS attendance_rate
                    FROM student_sessions ss
                    JOIN sessions s ON s.session_id = ss.session_id
                    GROUP BY ss.student_id, s.class_id
                ),
                enrolled AS (
                    SELECT cm.student_id,
                           jsonb_agg(
                               jsonb_build_object(
                                   'code', COALESCE(NULLIF(c.class_code, ''), c.class_name, ''),
                                   'name', COALESCE(NULLIF(c.class_name, ''), c.class_code, ''),
                                   'attendanceRate', COALESCE(att.attendance_rate, 0)
                               )
                               ORDER BY COALESCE(
                                   NULLIF(c.class_code, ''), c.class_name, ''
                               )
                           ) AS enrolled_classes
                    FROM class_members cm
                    JOIN classes c ON c.class_id = cm.class_id
                    LEFT JOIN attendance att
                        ON att.student_id = cm.student_id
                       AND att.class_id = cm.class_id
                    WHERE cm.status = 'ACTIVE'
                    GROUP BY cm.student_id
                )
                SELECT
                    p.person_id::text AS id,
                    p.role,
                    p.full_name,
                    COALESCE(p.email, '') AS email,
                    EXTRACT(
                        EPOCH FROM (NOW() - GREATEST(la.last_action, p.last_login_at))
                    )::bigint AS last_seen_seconds,
                    COALESCE(js.joined_sessions, 0) AS joined_sessions,
                    COALESCE(h.hosted_sessions, 0) AS hosted_sessions,
                    COALESCE(qs.questions_sent, 0) AS questions_sent,
                    COALESCE(ag.answered_groups, 0) AS answered_groups,
                    COALESCE(daily.activity_history, '[]'::jsonb) AS activity_history,
                    COALESCE(sub.subtitle_views, 0) AS subtitle_views,
                    COALESCE(avw.answer_views, 0) AS answer_views,
                    COALESCE(en.enrolled_classes, '[]'::jsonb) AS enrolled_classes
                FROM persons p
                LEFT JOIN last_activity la ON la.actor_id = p.person_id
                LEFT JOIN joined_sessions js ON js.student_id = p.person_id
                LEFT JOIN question_stats qs ON qs.student_id = p.person_id
                LEFT JOIN hosted h ON h.lecturer_id = p.person_id
                LEFT JOIN answered_groups ag ON ag.lecturer_id = p.person_id
                LEFT JOIN daily_activity daily ON daily.actor_id = p.person_id
                LEFT JOIN student_subtitle_usage sub ON sub.student_id = p.person_id
                LEFT JOIN student_answer_views avw ON avw.student_id = p.person_id
                LEFT JOIN enrolled en ON en.student_id = p.person_id
                {where_clause}
                ORDER BY la.last_action DESC NULLS LAST, p.full_name
                LIMIT :limit
                """
            ),
            params,
        ).mappings().all()

        accounts = []
        for row in rows:
            is_lecturer = row["role"] == "LECTURER"
            activity_history = row["activity_history"] or []
            enrolled_classes = row["enrolled_classes"] or []
            accounts.append(
                {
                    "id": row["id"],
                    "name": row["full_name"],
                    "email": row["email"],
                    "role": "Lecturer" if is_lecturer else "Student",
                    "className": None,
                    "joinedSessions": int(row["joined_sessions"] or 0),
                    "questionsSent": int(row["questions_sent"] or 0),
                    "aiGroupsAnswered": (
                        int(row["answered_groups"] or 0) if is_lecturer else None
                    ),
                    "sessionsHosted": (
                        int(row["hosted_sessions"] or 0) if is_lecturer else None
                    ),
                    "lastActive": _format_relative_time(row["last_seen_seconds"]),
                    "subtitleUsageCount": int(row["subtitle_views"] or 0),
                    "answerViewsCount": int(row["answer_views"] or 0),
                    "activityHistory": activity_history,
                    "enrolledClassesList": enrolled_classes,
                }
            )

        return jsonify({"accounts": accounts})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin engagement accounts failed")
        return jsonify({"message": "Không thể tải danh sách tài khoản."}), 503
