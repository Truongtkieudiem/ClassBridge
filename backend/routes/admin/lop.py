import math
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from extensions import db


admin_classes_bp = Blueprint(
    "admin_classes", __name__, url_prefix="/auth/admin/classes"
)


def _admin_required():
    if get_jwt().get("role") != "admin":
        return jsonify({"message": "Administrator access is required."}), 403
    return None


@admin_classes_bp.route("", methods=["GET"])
@jwt_required()
def list_classes():
    denied = _admin_required()
    if denied:
        return denied

    try:
        page = max(1, int(request.args.get("page", "1")))
        page_size = min(100, max(1, int(request.args.get("pageSize", "7"))))
    except ValueError:
        return jsonify({"message": "Invalid pagination values."}), 400

    search = (request.args.get("search", "") or "").strip()
    class_id = (request.args.get("classId", "") or "").strip()
    lecturer_id = (request.args.get("lecturerId", "") or "").strip()
    room = (request.args.get("room", "") or "").strip()
    schedule_time = (request.args.get("time", "") or "").strip()
    filter_params = {
        "search_is_empty": not search,
        "search": f"%{search}%",
        "class_is_empty": not class_id,
        "class_id": class_id,
        "lecturer_is_empty": not lecturer_id,
        "lecturer_id": lecturer_id,
        "room_is_empty": not room,
        "room": room,
        "time_is_empty": not schedule_time,
        "schedule_time": schedule_time,
    }

    class_rows = """
        SELECT
            c.class_id,
            c.class_code,
            COALESCE(NULLIF(c.class_name, ''), course.course_name, '') AS class_name,
            c.lecturer_id,
            lecturer.full_name AS lecturer_name,
            c.status,
            COALESCE(member_counts.student_count, 0) AS student_count,
            COALESCE(schedule_info.total_hours, 0) AS total_hours,
            schedule_info.room_name,
            schedule_info.schedule_search,
            COALESCE(
                NULLIF(CONCAT_WS(' - ',
                    NULLIF(BTRIM(c.semester), ''),
                    NULLIF(BTRIM(c.academic_year), '')
                ), ''),
                schedule_info.schedule_search,
                schedule_info.schedule_period,
                CASE
                    WHEN LOWER(COALESCE(c.status, '')) IN ('completed', 'complete', 'finished', 'ended')
                    THEN 'Hết giảng'
                    ELSE 'Chưa có lịch'
                END
            ) AS class_time
        FROM classes AS c
        LEFT JOIN courses AS course ON course.course_id = c.course_id
        LEFT JOIN lecturers AS lecturer ON lecturer.lecturer_id = c.lecturer_id
        LEFT JOIN (
            SELECT class_id, COUNT(DISTINCT student_id) AS student_count
            FROM class_members
            WHERE status IS NULL
               OR LOWER(status) NOT IN ('inactive', 'removed', 'dropped', 'cancelled', 'canceled')
            GROUP BY class_id
        ) AS member_counts ON member_counts.class_id = c.class_id
        LEFT JOIN (
            SELECT
                class_id,
                ROUND(SUM(
                    CASE
                        WHEN start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time
                        THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
                        ELSE 0
                    END
                )::numeric, 1) AS total_hours,
                MIN(NULLIF(BTRIM(room_name), '')) AS room_name,
                STRING_AGG(
                    DISTINCT CONCAT_WS(
                        ' ',
                        CASE
                            WHEN recurrence_rule LIKE 'FREQ=WEEKLY;BYDAY=%' THEN
                                CASE SPLIT_PART(recurrence_rule, 'BYDAY=', 2)
                                    WHEN 'MO' THEN 'Thứ 2'
                                    WHEN 'TU' THEN 'Thứ 3'
                                    WHEN 'WE' THEN 'Thứ 4'
                                    WHEN 'TH' THEN 'Thứ 5'
                                    WHEN 'FR' THEN 'Thứ 6'
                                    WHEN 'SA' THEN 'Thứ 7'
                                    WHEN 'SU' THEN 'Chủ nhật'
                                END
                            ELSE TO_CHAR(start_time, 'DD/MM/YYYY')
                        END,
                        TO_CHAR(start_time, 'HH24:MI'),
                        CASE
                            WHEN end_time IS NOT NULL THEN '- ' || TO_CHAR(end_time, 'HH24:MI')
                            ELSE NULL
                        END
                    ),
                    ' | '
                ) FILTER (WHERE start_time IS NOT NULL) AS schedule_search,
                CASE
                    WHEN MIN(start_time) IS NOT NULL AND MAX(end_time) IS NOT NULL
                    THEN TO_CHAR(MIN(start_time), 'DD/MM/YYYY') || ' - ' ||
                         TO_CHAR(MAX(end_time), 'DD/MM/YYYY')
                    ELSE NULL
                END AS schedule_period
            FROM class_schedules
            GROUP BY class_id
        ) AS schedule_info ON schedule_info.class_id = c.class_id
    """

    try:
        rows = db.session.execute(
            text(
                f"""
                WITH class_rows AS ({class_rows})
                SELECT
                    c.class_id,
                    c.class_code,
                    c.class_name,
                    c.lecturer_id,
                    c.lecturer_name,
                    c.student_count,
                    c.total_hours,
                    c.room_name,
                    c.class_time,
                    c.schedule_search
                FROM class_rows AS c
                WHERE (
                    :search_is_empty
                    OR c.class_code ILIKE :search
                    OR c.class_name ILIKE :search
                )
                    AND (:class_is_empty OR c.class_id::text = :class_id)
                AND (:lecturer_is_empty OR c.lecturer_id::text = :lecturer_id)
                AND (
                    :room_is_empty OR EXISTS (
                        SELECT 1
                        FROM class_schedules AS schedule_filter
                        WHERE schedule_filter.class_id = c.class_id
                          AND BTRIM(COALESCE(schedule_filter.room_name, '')) = :room
                    )
                  )
                  AND (
                    :time_is_empty OR EXISTS (
                        SELECT 1
                        FROM class_schedules AS schedule_filter
                        WHERE schedule_filter.class_id = c.class_id
                          AND TO_CHAR(schedule_filter.start_time, 'HH24:MI') = :schedule_time
                    )
                  )
                ORDER BY c.class_code NULLS LAST, c.class_name
                LIMIT :limit OFFSET :offset
                """
            ),
            {
                **filter_params,
                "limit": page_size,
                "offset": (page - 1) * page_size,
            },
        ).mappings().all()

        total_result = db.session.execute(
            text(
                f"""
                WITH class_rows AS ({class_rows})
                SELECT COUNT(*)
                FROM class_rows AS c
                WHERE (
                    :search_is_empty
                    OR c.class_code ILIKE :search
                    OR c.class_name ILIKE :search
                )
                    AND (:class_is_empty OR c.class_id::text = :class_id)
                AND (:lecturer_is_empty OR c.lecturer_id::text = :lecturer_id)
                AND (
                    :room_is_empty OR EXISTS (
                        SELECT 1
                        FROM class_schedules AS schedule_filter
                        WHERE schedule_filter.class_id = c.class_id
                          AND BTRIM(COALESCE(schedule_filter.room_name, '')) = :room
                    )
                  )
                  AND (
                    :time_is_empty OR EXISTS (
                        SELECT 1
                        FROM class_schedules AS schedule_filter
                        WHERE schedule_filter.class_id = c.class_id
                          AND TO_CHAR(schedule_filter.start_time, 'HH24:MI') = :schedule_time
                    )
                  )
                """
            ),
            filter_params,
        ).scalar_one()

        classes = db.session.execute(
            text(
                """
                SELECT
                    class_id::text AS id,
                    COALESCE(NULLIF(class_code, ''), class_name, 'Lớp') ||
                    CASE
                        WHEN class_name IS NOT NULL AND class_name <> ''
                        THEN ' - ' || class_name
                        ELSE ''
                    END AS label
                FROM classes
                ORDER BY class_code NULLS LAST, class_name
                """
            )
        ).mappings().all()
        lecturers = db.session.execute(
            text(
                """
                SELECT DISTINCT
                    lecturer.lecturer_id::text AS id,
                    lecturer.full_name AS name
                FROM lecturers AS lecturer
                WHERE lecturer.full_name IS NOT NULL
                  AND lecturer.is_active = true
                ORDER BY lecturer.full_name
                """
            )
        ).mappings().all()
        rooms = db.session.execute(
            text(
                """
                SELECT DISTINCT BTRIM(room_name) AS room
                FROM class_schedules
                WHERE room_name IS NOT NULL AND BTRIM(room_name) <> ''
                ORDER BY room
                """
            )
        ).scalars().all()
        times = db.session.execute(
            text(
                """
                SELECT
                    TO_CHAR(start_time, 'HH24:MI') AS value,
                    TO_CHAR(start_time, 'HH24:MI') ||
                    CASE
                        WHEN MIN(end_time) IS NOT NULL
                        THEN ' - ' || TO_CHAR(MIN(end_time), 'HH24:MI')
                        ELSE ''
                    END AS label
                FROM class_schedules
                WHERE start_time IS NOT NULL
                GROUP BY TO_CHAR(start_time, 'HH24:MI')
                ORDER BY value
                """
            )
        ).mappings().all()
        items = [
            {
                "id": str(row["class_id"]),
                "code": row["class_code"] or "",
                "name": row["class_name"],
                "teacher": row["lecturer_name"] or "Chưa phân công",
                "lecturerId": str(row["lecturer_id"]) if row["lecturer_id"] else "",
                "size": int(row["student_count"]),
                "hours": float(row["total_hours"]),
                "room": row["room_name"] or "—",
                "time": row["class_time"] or "Chưa có lịch",
            }
            for row in rows
        ]

        return jsonify(
            {
                "items": items,
                "total": int(total_result),
                "page": page,
                "pageSize": page_size,
                "totalPages": max(1, math.ceil(total_result / page_size)),
                "classes": [dict(class_option) for class_option in classes],
                "lecturers": [dict(lecturer) for lecturer in lecturers],
                "rooms": rooms,
                "times": [dict(schedule_time) for schedule_time in times],
            }
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin class list lookup failed")
        return jsonify({"message": "Không thể tải danh sách lớp."}), 503


@admin_classes_bp.route("", methods=["POST"])
@jwt_required()
def create_class():
    denied = _admin_required()
    if denied:
        return denied

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"message": "Yêu cầu dữ liệu lớp hợp lệ."}), 400

    class_code = str(body.get("classCode", "")).strip()
    class_name = str(body.get("className", "")).strip()
    lecturer_id = str(body.get("lecturerId", "")).strip()
    lecturer_name = str(body.get("lecturerName", "")).strip()
    room_name = str(body.get("roomName", "")).strip()
    raw_hours = str(body.get("hours", "")).strip().replace(",", ".")
    raw_date = str(body.get("classDate", "")).strip()
    raw_time = str(body.get("classTime", "")).strip()
    raw_weekly_schedules = body.get("weeklySchedules")

    if not class_code or len(class_code) > 30:
        return jsonify({"message": "Mã lớp là bắt buộc và tối đa 30 ký tự."}), 400
    if not class_name or len(class_name) > 150:
        return jsonify({"message": "Tên lớp là bắt buộc và tối đa 150 ký tự."}), 400
    if not room_name or len(room_name) > 100:
        return jsonify({"message": "Phòng học là bắt buộc và tối đa 100 ký tự."}), 400
    if not lecturer_id and not lecturer_name:
        return jsonify({"message": "Vui lòng chọn hoặc nhập tên giảng viên."}), 400

    try:
        duration_hours = Decimal(raw_hours)
        if not duration_hours.is_finite() or duration_hours <= 0 or duration_hours > 24:
            raise InvalidOperation
    except (InvalidOperation, ValueError):
        return jsonify({"message": "Số giờ phải lớn hơn 0 và không quá 24."}), 400

    try:
        class_date = date.fromisoformat(raw_date)
    except ValueError:
        return jsonify({"message": "Ngày học không hợp lệ."}), 400

    schedule_defs = []
    if raw_weekly_schedules is not None:
        if not isinstance(raw_weekly_schedules, list) or not 1 <= len(raw_weekly_schedules) <= 21:
            return jsonify({"message": "Vui lòng thêm từ 1 đến 21 buổi học mỗi tuần."}), 400
        valid_weekdays = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}
        for slot in raw_weekly_schedules:
            if not isinstance(slot, dict):
                return jsonify({"message": "Lịch học không hợp lệ."}), 400
            weekday = str(slot.get("weekday", "")).strip().upper()
            raw_slot_time = str(slot.get("time", "")).strip()
            if weekday not in valid_weekdays or not raw_slot_time:
                return jsonify({"message": "Mỗi buổi học cần có thứ và giờ bắt đầu."}), 400
            try:
                slot_time = time.fromisoformat(raw_slot_time)
            except ValueError:
                return jsonify({"message": "Giờ học không hợp lệ."}), 400
            schedule_defs.append((weekday, slot_time))
        if len(set(schedule_defs)) != len(schedule_defs):
            return jsonify({"message": "Lịch có buổi học bị trùng."}), 400
    else:
        try:
            schedule_defs.append((None, time.fromisoformat(raw_time)))
        except ValueError:
            return jsonify({"message": "Giờ học không hợp lệ."}), 400

    try:
        if lecturer_id:
            try:
                lecturer_uuid = str(UUID(lecturer_id))
            except ValueError:
                return jsonify({"message": "Giảng viên được chọn không hợp lệ."}), 400
            lecturer = db.session.execute(
                text(
                    """
                    SELECT lecturer_id
                    FROM lecturers
                    WHERE lecturer_id = CAST(:lecturer_id AS uuid)
                      AND is_active = true
                    """
                ),
                {"lecturer_id": lecturer_uuid},
            ).mappings().first()
        else:
            matching_lecturers = db.session.execute(
                text(
                    """
                    SELECT lecturer_id
                    FROM lecturers
                    WHERE is_active = true AND LOWER(BTRIM(full_name)) = LOWER(:name)
                    ORDER BY lecturer_id
                    LIMIT 2
                    """
                ),
                {"name": lecturer_name},
            ).mappings().all()
            if len(matching_lecturers) > 1:
                return jsonify(
                    {"message": f"Có nhiều giảng viên tên “{lecturer_name}”; hãy chọn giảng viên theo danh sách."}
                ), 409
            lecturer = matching_lecturers[0] if matching_lecturers else None

        if not lecturer:
            return jsonify({"message": "Không tìm thấy giảng viên đang hoạt động."}), 404

        result = db.session.execute(
            text(
                """
                INSERT INTO classes (
                    lecturer_id, class_code, class_name, status
                )
                VALUES (
                    CAST(:lecturer_id AS uuid), :class_code, :class_name, 'ACTIVE'
                )
                RETURNING class_id::text AS class_id
                """
            ),
            {
                "lecturer_id": str(lecturer["lecturer_id"]),
                "class_code": class_code,
                "class_name": class_name,
            },
        ).mappings().one()
        class_id = result["class_id"]

        day_offsets = {
            "MO": 0, "TU": 1, "WE": 2, "TH": 3,
            "FR": 4, "SA": 5, "SU": 6,
        }
        for weekday, slot_time in schedule_defs:
            slot_date = class_date
            recurrence_rule = None
            if weekday:
                slot_date += timedelta(
                    days=(day_offsets[weekday] - class_date.weekday()) % 7
                )
                recurrence_rule = f"FREQ=WEEKLY;BYDAY={weekday}"
            start_at = datetime.combine(slot_date, slot_time)
            end_at = start_at + timedelta(hours=float(duration_hours))
            db.session.execute(
                text(
                    """
                    INSERT INTO class_schedules (
                        class_id, schedule_type, title, start_time, end_time,
                        room_name, status, created_by_lecturer_id, recurrence_rule
                    )
                    VALUES (
                        CAST(:class_id AS uuid), 'CLASS', :title, :start_time,
                        :end_time, :room_name, 'SCHEDULED',
                        CAST(:lecturer_id AS uuid), :recurrence_rule
                    )
                    """
                ),
                {
                    "class_id": class_id,
                    "title": class_name,
                    "start_time": start_at,
                    "end_time": end_at,
                    "room_name": room_name,
                    "lecturer_id": str(lecturer["lecturer_id"]),
                    "recurrence_rule": recurrence_rule,
                },
            )
        db.session.commit()
        return jsonify({"id": class_id, "message": "Đã thêm lớp học."}), 201
    except IntegrityError as error:
        db.session.rollback()
        if getattr(error.orig, "sqlstate", None) == "23505":
            return jsonify({"message": "Mã lớp đã tồn tại."}), 409
        current_app.logger.exception("Admin class creation constraint failed")
        return jsonify({"message": "Không thể lưu lớp học do dữ liệu không hợp lệ."}), 400
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin class creation failed")
        return jsonify({"message": "Không thể thêm lớp học."}), 503
