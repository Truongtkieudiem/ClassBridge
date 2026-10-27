import re
from datetime import date
from uuid import UUID
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from account_service import account_email_exists
from email_utils import is_valid_email_format
from extensions import db


admin_accounts_bp = Blueprint(
    "admin_accounts", __name__, url_prefix="/auth/admin/accounts"
)

ACCOUNT_TABLES = {
    "admin": ("admins", "admin_id", "Admin"),
    "lecturer": ("lecturers", "lecturer_id", "Editor"),
    "student": ("students", "student_id", "User"),
}
ROLE_KEYS = {display: key for key, (_, _, display) in ACCOUNT_TABLES.items()}
ACCOUNT_UNION = """
    SELECT 'admin' AS account_type, admin_id::text AS account_id,
           full_name, email, phone, NULL::text AS account_code,
           NULL::text AS avatar_url,
           is_active, created_at, last_login_at
    FROM admins
    UNION ALL
    SELECT 'lecturer', lecturer_id::text, full_name, email, phone,
           lecturer_code, avatar_url, is_active, created_at, last_login_at
    FROM lecturers
    UNION ALL
    SELECT 'student', student_id::text, full_name, email, phone,
           student_code, avatar_url, is_active, created_at, last_login_at
    FROM students
"""
SORT_COLUMNS = {
    "username": "lower(split_part(email, '@', 1))",
    "fullName": "lower(full_name)",
    "studentId": "account_code",
    "email": "lower(email)",
    "status": "is_active",
    "role": "account_type",
    "joinedDate": "created_at",
}


def _admin_required():
    if get_jwt().get("role") != "admin":
        return jsonify({"message": "Administrator access is required."}), 403
    return None


def _serialize_account(row):
    last_login = row["last_login_at"]
    email = row["email"] or ""
    return {
        "id": f'{row["account_type"]}:{row["account_id"]}',
        "fullName": row["full_name"],
        "email": email,
        "username": email.split("@", 1)[0],
        "phone": row["phone"] or "",
        "studentId": row["account_code"] or "",
        "status": "Active" if row["is_active"] else "Inactive",
        "role": ACCOUNT_TABLES[row["account_type"]][2],
        "joinedDate": row["created_at"].date().isoformat(),
        "lastActiveLabel": last_login.isoformat() if last_login else "Chưa đăng nhập",
        "avatarUrl": row["avatar_url"],
    }


def _parse_account_id(account_id):
    account_type, separator, raw_id = account_id.partition(":")
    if not separator or account_type not in ACCOUNT_TABLES:
        return None
    try:
        normalized_id = str(UUID(raw_id))
    except ValueError:
        return None
    return account_type, normalized_id


def _validate_password(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 64:
        return "Mật khẩu phải dài từ 8 đến 64 ký tự."
    requirements = (
        (r"[A-Z]", "Mật khẩu cần có ít nhất 1 chữ hoa."),
        (r"[a-z]", "Mật khẩu cần có ít nhất 1 chữ thường."),
        (r"[0-9]", "Mật khẩu cần có ít nhất 1 chữ số."),
        (r"[^A-Za-z0-9\s]", "Mật khẩu cần có ít nhất 1 ký tự đặc biệt."),
    )
    for pattern, message in requirements:
        if not re.search(pattern, password):
            return message
    common_passwords = {
        "password", "password1", "password123", "password123!", "qwerty123",
        "admin123", "welcome1", "letmein123", "iloveyou1", "abc12345",
        "12345678", "123456789", "qwerty123!", "student123!",
    }
    if password.casefold() in common_passwords:
        return "Vui lòng chọn mật khẩu ít phổ biến hơn."
    return None


def _account_row(account_type, account_id):
    table, primary_key, _ = ACCOUNT_TABLES[account_type]
    code_column = {
        "admin": "NULL::text",
        "lecturer": "lecturer_code",
        "student": "student_code",
    }[account_type]
    avatar_column = "avatar_url" if account_type != "admin" else "NULL::text"
    return db.session.execute(
        text(
            f"""
            SELECT '{account_type}' AS account_type, {primary_key}::text AS account_id,
                   full_name, email, phone, {code_column} AS account_code,
                   {avatar_column} AS avatar_url,
                   is_active, created_at, last_login_at
            FROM {table}
            WHERE {primary_key} = CAST(:account_id AS uuid)
            """
        ),
        {"account_id": account_id},
    ).mappings().first()


@admin_accounts_bp.route("", methods=["GET"])
@jwt_required()
def list_accounts():
    denied = _admin_required()
    if denied:
        return denied

    try:
        page = max(1, int(request.args.get("page", "1")))
        page_size = min(500, max(1, int(request.args.get("pageSize", "10"))))
    except ValueError:
        return jsonify({"message": "Invalid pagination values."}), 400

    role = request.args.get("role", "")
    if role and role not in ROLE_KEYS:
        return jsonify({"message": "Invalid account role."}), 400

    status = request.args.get("status", "")
    if status and status not in ("Active", "Inactive"):
        return jsonify({"message": "Invalid account status."}), 400

    for date_key in ("dateFrom", "dateTo"):
        if request.args.get(date_key):
            try:
                date.fromisoformat(request.args[date_key])
            except ValueError:
                return jsonify({"message": "Invalid date filter."}), 400

    sort_column = SORT_COLUMNS.get(request.args.get("sortBy", "joinedDate"))
    if not sort_column:
        return jsonify({"message": "Invalid sort column."}), 400
    sort_direction = "DESC" if request.args.get("sortDir") == "desc" else "ASC"

    filters = []
    params = {
        "page_size": page_size,
        "offset": (page - 1) * page_size,
        "query": f'%{request.args.get("q", "").strip()}%',
    }
    if request.args.get("q", "").strip():
        filters.append(
            """(full_name ILIKE :query OR email ILIKE :query
               OR phone ILIKE :query OR account_code ILIKE :query
               OR account_id ILIKE :query)"""
        )
    if role:
        filters.append("account_type = :account_type")
        params["account_type"] = ROLE_KEYS[role]
    if status:
        filters.append("is_active = :is_active")
        params["is_active"] = status == "Active"
    if request.args.get("dateFrom"):
        filters.append("created_at::date >= CAST(:date_from AS date)")
        params["date_from"] = request.args["dateFrom"]
    if request.args.get("dateTo"):
        filters.append("created_at::date <= CAST(:date_to AS date)")
        params["date_to"] = request.args["dateTo"]

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    try:
        total = db.session.execute(
            text(f"WITH accounts AS ({ACCOUNT_UNION}) SELECT COUNT(*) FROM accounts {where_clause}"),
            params,
        ).scalar_one()
        rows = db.session.execute(
            text(
                f"""
                WITH accounts AS ({ACCOUNT_UNION})
                SELECT * FROM accounts
                {where_clause}
                ORDER BY {sort_column} {sort_direction} NULLS LAST, account_type, account_id
                LIMIT :page_size OFFSET :offset
                """
            ),
            params,
        ).mappings().all()
        return jsonify(
            {
                "items": [_serialize_account(row) for row in rows],
                "total": total,
                "page": page,
                "pageSize": page_size,
                "totalPages": max(1, (total + page_size - 1) // page_size),
            }
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account list lookup failed")
        return jsonify({"message": "Không thể tải danh sách tài khoản."}), 503


@admin_accounts_bp.route("", methods=["POST"])
@jwt_required()
def create_account():
    denied = _admin_required()
    if denied:
        return denied

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Yêu cầu tạo tài khoản không hợp lệ."}), 400

    role = payload.get("role")
    account_type = ROLE_KEYS.get(role) if isinstance(role, str) else None
    full_name = payload.get("fullName")
    email = payload.get("email")
    password = payload.get("password")
    phone = payload.get("phone") or None
    account_code = payload.get("studentId") or ""

    if not account_type:
        return jsonify({"message": "Vai trò tài khoản không hợp lệ."}), 400
    if not isinstance(full_name, str) or not full_name.strip() or len(full_name.strip()) > 100:
        return jsonify({"message": "Vui lòng nhập họ tên hợp lệ (tối đa 100 ký tự)."}), 400
    if not is_valid_email_format(email):
        return jsonify({"message": "Email không hợp lệ."}), 400
    password_error = _validate_password(password)
    if password_error:
        return jsonify({"message": password_error}), 400
    if phone is not None and (not isinstance(phone, str) or not re.fullmatch(r"\d{10}", phone)):
        return jsonify({"message": "Số điện thoại phải gồm đúng 10 chữ số."}), 400
    if account_type == "student" and (
        not isinstance(account_code, str) or not re.fullmatch(r"\d{11}", account_code)
    ):
        return jsonify({"message": "Mã sinh viên phải gồm đúng 11 chữ số."}), 400
    if account_type == "lecturer" and (
        not isinstance(account_code, str)
        or not re.fullmatch(r"[A-Za-z0-9]{1,30}", account_code)
    ):
        return jsonify({"message": "Mã giảng viên phải gồm 1 đến 30 chữ cái hoặc chữ số."}), 400

    email = email.strip().lower()
    try:
        db.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:email, 0))"),
            {"email": email},
        )
        if account_email_exists(email):
            db.session.rollback()
            return jsonify({"message": "Email đã được sử dụng."}), 409

        table, primary_key, _ = ACCOUNT_TABLES[account_type]
        if account_type == "admin":
            code_insert = ""
            code_value_placeholder = ""
            code_value = {}
        else:
            code_name = "student_code" if account_type == "student" else "lecturer_code"
            code_insert = f", {code_name}"
            code_value_placeholder = f", :{code_name}"
            code_value = {code_name: account_code.upper() if account_type == "lecturer" else account_code}

        row = db.session.execute(
            text(
                f"""
                INSERT INTO {table} (full_name, email, phone, password_hash{code_insert})
                VALUES (:full_name, :email, :phone, :password_hash{code_value_placeholder})
                RETURNING {primary_key}
                """
            ),
            {
                "full_name": full_name.strip(),
                "email": email,
                "phone": phone,
                "password_hash": generate_password_hash(password),
                **code_value,
            },
        ).first()
        db.session.commit()
        account = _account_row(account_type, row[0])
        return jsonify(_serialize_account(account)), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "Email hoặc mã định danh này đã được sử dụng."}), 409
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account creation failed")
        return jsonify({"message": "Không thể tạo tài khoản."}), 503


@admin_accounts_bp.route("/<path:account_id>", methods=["PATCH"])
@jwt_required()
def update_account(account_id):
    denied = _admin_required()
    if denied:
        return denied

    parsed_id = _parse_account_id(account_id)
    payload = request.get_json(silent=True)
    if parsed_id is None or not isinstance(payload, dict):
        return jsonify({"message": "Yêu cầu cập nhật tài khoản không hợp lệ."}), 400
    account_type, account_id_value = parsed_id
    try:
        current = _account_row(account_type, account_id_value)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account lookup for update failed")
        return jsonify({"message": "Không thể tải thông tin tài khoản."}), 503
    if not current:
        return jsonify({"message": "Không tìm thấy tài khoản."}), 404

    updates = {}
    if "fullName" in payload:
        full_name = payload["fullName"]
        if not isinstance(full_name, str) or not full_name.strip() or len(full_name.strip()) > 100:
            return jsonify({"message": "Vui lòng nhập họ tên hợp lệ."}), 400
        updates["full_name"] = full_name.strip()
    if "email" in payload:
        email = payload["email"]
        if not is_valid_email_format(email):
            return jsonify({"message": "Email không hợp lệ."}), 400
        email = email.strip().lower()
        if email != (current["email"] or "").lower():
            try:
                if account_email_exists(email):
                    return jsonify({"message": "Email đã được sử dụng."}), 409
            except Exception:
                db.session.rollback()
                current_app.logger.exception("Admin account email check failed")
                return jsonify({"message": "Không thể kiểm tra email tài khoản."}), 503
        updates["email"] = email
    if "phone" in payload:
        phone = payload["phone"]
        if phone and (not isinstance(phone, str) or not re.fullmatch(r"\d{10}", phone)):
            return jsonify({"message": "Số điện thoại phải gồm đúng 10 chữ số."}), 400
        updates["phone"] = phone or None
    if "studentId" in payload and account_type != "admin":
        code = payload["studentId"]
        if account_type == "student" and (
            not isinstance(code, str) or not re.fullmatch(r"\d{11}", code)
        ):
            return jsonify({"message": "Mã sinh viên phải gồm đúng 11 chữ số."}), 400
        if account_type == "lecturer" and (
            not isinstance(code, str) or not re.fullmatch(r"[A-Za-z0-9]{1,30}", code)
        ):
            return jsonify({"message": "Mã giảng viên phải gồm 1 đến 30 chữ cái hoặc chữ số."}), 400
        updates["student_code" if account_type == "student" else "lecturer_code"] = (
            code.upper() if account_type == "lecturer" else code
        )
    if "status" in payload:
        if payload["status"] not in ("Active", "Inactive"):
            return jsonify({"message": "Trạng thái tài khoản không hợp lệ."}), 400
        updates["is_active"] = payload["status"] == "Active"
    if payload.get("password"):
        password_error = _validate_password(payload["password"])
        if password_error:
            return jsonify({"message": password_error}), 400
        updates["password_hash"] = generate_password_hash(payload["password"])
    if not updates:
        return jsonify({"message": "Không có thông tin nào để cập nhật."}), 400

    table, primary_key, _ = ACCOUNT_TABLES[account_type]
    assignments = ", ".join(f"{column} = :{column}" for column in updates)
    try:
        db.session.execute(
            text(f"UPDATE {table} SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE {primary_key} = CAST(:account_id AS uuid)"),
            {**updates, "account_id": account_id_value},
        )
        db.session.commit()
        return jsonify(_serialize_account(_account_row(account_type, account_id_value)))
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "Email hoặc mã định danh này đã được sử dụng."}), 409
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account update failed")
        return jsonify({"message": "Không thể cập nhật tài khoản."}), 503


@admin_accounts_bp.route("/<path:account_id>", methods=["DELETE"])
@jwt_required()
def delete_account(account_id):
    denied = _admin_required()
    if denied:
        return denied
    parsed_id = _parse_account_id(account_id)
    if parsed_id is None:
        return jsonify({"message": "Mã tài khoản không hợp lệ."}), 400
    account_type, account_id_value = parsed_id
    table, primary_key, _ = ACCOUNT_TABLES[account_type]
    try:
        result = db.session.execute(
            text(f"DELETE FROM {table} WHERE {primary_key} = CAST(:account_id AS uuid)"),
            {"account_id": account_id_value},
        )
        if result.rowcount == 0:
            db.session.rollback()
            return jsonify({"message": "Không tìm thấy tài khoản."}), 404
        db.session.commit()
        return jsonify({"success": True})
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "Không thể xóa tài khoản đang được dữ liệu khác sử dụng."}), 409
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account deletion failed")
        return jsonify({"message": "Không thể xóa tài khoản."}), 503


@admin_accounts_bp.route("/<path:account_id>/activity", methods=["GET"])
@jwt_required()
def account_activity(account_id):
    denied = _admin_required()
    if denied:
        return denied
    parsed_id = _parse_account_id(account_id)
    if parsed_id is None:
        return jsonify({"message": "Mã tài khoản không hợp lệ."}), 400
    account_type, account_id_value = parsed_id
    audit_column = {
        "admin": "admin_id",
        "lecturer": "lecturer_id",
        "student": "student_id",
    }[account_type]
    try:
        logs = db.session.execute(
            text(
                f"""
                SELECT log_id, action, description, created_at
                FROM audit_logs
                WHERE {audit_column} = CAST(:account_id AS uuid)
                   OR entity_id::text = :account_id_text
                ORDER BY created_at DESC
                LIMIT 50
                """
            ),
            {"account_id": account_id_value, "account_id_text": account_id_value},
        ).mappings().all()
        return jsonify(
            {
                "items": [
                    {
                        "id": str(row["log_id"]),
                        "time": row["created_at"].isoformat(),
                        "title": row["action"],
                        "description": row["description"] or row["action"],
                    }
                    for row in logs
                ]
            }
        )
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Admin account activity lookup failed")
        return jsonify({"message": "Không thể tải lịch sử hoạt động."}), 503
