import importlib

from routes.check_registration_email import check_registration_email_bp
from routes.chat import chat_bp
from routes.activity import activity_bp
from routes.admin.admin_accounts import admin_accounts_bp
from routes.admin.admin_dashboard import admin_dashboard_bp
from routes.admin.ghilog import admin_logs_bp
from routes.admin.lop import admin_classes_bp
from routes.admin.tuongtac import admin_engagement_bp
from routes.giangvien.classroom.classroom import lecturer_classroom_bp
from routes.giangvien.classroom.cauhoi import lecturer_quick_questions_bp
from routes.giangvien.classroom.chitiet import lecturer_session_detail_bp
from routes.giangvien.dashboard import giangvien_dashboard_bp
lecturer_classes_bp = importlib.import_module(
    "routes.giangvien.classes.class"
).lecturer_classes_bp

from routes.login import login_bp
from routes.register_account import register_account_bp
from routes.send_verification import send_verification_bp
from routes.verify_verification import verify_verification_bp

route_blueprints = (
    activity_bp,
    check_registration_email_bp,
    chat_bp,
    admin_accounts_bp,
    admin_dashboard_bp,
    admin_classes_bp,
    admin_engagement_bp,
    admin_logs_bp,
    lecturer_classroom_bp,
    lecturer_quick_questions_bp,
    lecturer_session_detail_bp,
    giangvien_dashboard_bp,
    lecturer_classes_bp,
    login_bp,
    send_verification_bp,
    verify_verification_bp,
    register_account_bp,
)
