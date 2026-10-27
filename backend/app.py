
from urllib.parse import urlsplit

from flask import Flask, jsonify, request
from flask_jwt_extended import JWTManager

from config import Config
from extensions import db
from audit_service import record_request_activity
from routes import route_blueprints
from routes.giangvien.dashboard import giangvien_dashboard_bp


app = Flask(__name__)
app.config.from_object(Config)
app.config["MAX_CONTENT_LENGTH"] = 21 * 1024 * 1024

# Initialize extensions
db.init_app(app)
JWTManager(app)

# Register existing route blueprints
for route_blueprint in route_blueprints:
    app.register_blueprint(route_blueprint)


@app.after_request
def add_cors_headers(response):
    configured_origin = app.config["FRONTEND_ORIGIN"].rstrip("/")
    allowed_origins = {configured_origin}
    configured_url = urlsplit(configured_origin)

    if configured_url.hostname in ("localhost", "127.0.0.1"):
        alternate_host = (
            "127.0.0.1"
            if configured_url.hostname == "localhost"
            else "localhost"
        )
        alternate_origin = f"{configured_url.scheme}://{alternate_host}"

        if configured_url.port:
            alternate_origin += f":{configured_url.port}"

        allowed_origins.add(alternate_origin)

    origin = request.headers.get("Origin")

    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.vary.add("Origin")
    elif not origin:
        response.headers["Access-Control-Allow-Origin"] = configured_origin

    response.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization"
    )
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PATCH, DELETE, OPTIONS"
    )

    record_request_activity(response)
    return response


@app.route("/")
def home():
    return jsonify({
        "success": True,
        "message": "ClassBridge Backend is running"
    })


if __name__ == "__main__":
    app.run(debug=True)
