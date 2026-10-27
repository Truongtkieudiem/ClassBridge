from sqlalchemy import text

from extensions import db


def account_email_exists(email):
    return db.session.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1 FROM students WHERE lower(email) = :email
                UNION ALL
                SELECT 1 FROM lecturers WHERE lower(email) = :email
                UNION ALL
                SELECT 1 FROM admins WHERE lower(email) = :email
            )
            """
        ),
        {"email": email},
    ).scalar_one()
