import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import authService from "../../services/auth.service";
import Footer from "../../components/footer";
import "./Login.css";

const getEmailValidationMessage = (email, isVi) => {
  if (!email) {
    return isVi ? "Vui lòng nhập email." : "Please enter an email address.";
  }
  if (/\s/.test(email)) {
    return isVi
      ? "Email không được chứa khoảng trắng."
      : "Email cannot contain spaces.";
  }
  if (email.length > 254) {
    return isVi
      ? "Email không được dài quá 254 ký tự."
      : "Email cannot exceed 254 characters.";
  }
  if ((email.match(/@/g) || []).length !== 1) {
    return isVi
      ? "Email phải có đúng một ký tự @."
      : "Email must contain exactly one @ character.";
  }

  const [localPart, domain] = email.split("@");
  const localPartValid =
    localPart.length <= 64 &&
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(
      localPart,
    );
  const domainValid =
    /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(
      domain,
    );

  if (!localPart || !domain || !localPartValid || !domainValid) {
    return isVi
      ? "Email chưa đúng định dạng, ví dụ student@gmail.com."
      : "Enter a valid email, for example student@gmail.com.";
  }
  if (localPart.includes("..") || domain.includes("..")) {
    return isVi
      ? "Email không được có hai dấu chấm liên tiếp."
      : "Email cannot contain consecutive dots.";
  }
  return "";
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const location = useLocation();
  const [error, setError] = useState(() =>
    location.state?.sessionExpired
      ? localStorage.getItem("app_lang") === "vi"
        ? "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại."
        : "Your session is invalid or has expired. Please sign in again."
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState(
    localStorage.getItem("app_lang") || "vi",
  );

  const navigate = useNavigate();
  const isVi = language === "vi";
  const emailValidationMessage =
    emailError || getEmailValidationMessage(email, isVi);
  const showEmailValidation = emailTouched || email.length > 0;
  const emailIsValid = !emailValidationMessage;
  const passwordValidationMessage =
    passwordError ||
    (!password && passwordTouched
      ? isVi
        ? "Vui lòng nhập mật khẩu."
        : "Please enter your password."
      : "");
  const passwordRequirements = [
    {
      id: "minimum",
      met: password.length >= 8,
      text: isVi ? "Tối thiểu 8 ký tự" : "At least 8 characters",
    },
    {
      id: "uppercase",
      met: /[A-Z]/.test(password),
      text: isVi ? "Có ít nhất 1 chữ hoa" : "At least 1 uppercase letter",
    },
    {
      id: "lowercase",
      met: /[a-z]/.test(password),
      text: isVi ? "Có ít nhất 1 chữ thường" : "At least 1 lowercase letter",
    },
    {
      id: "special",
      met: /[^A-Za-z0-9\s]/.test(password),
      text: isVi
        ? "Có ít nhất 1 ký tự đặc biệt"
        : "At least 1 special character",
    },
    {
      id: "number",
      met: /[0-9]/.test(password),
      text: isVi ? "Có ít nhất 1 chữ số" : "At least 1 number",
    },
  ];
  const unmetPasswordRequirements = passwordRequirements.filter(
    (requirement) => !requirement.met,
  );
  const toggleLanguage = () => {
    const nextLanguage = language === "vi" ? "en" : "vi";
    setLanguage(nextLanguage);
    localStorage.setItem("app_lang", nextLanguage);
  };
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    setPasswordError("");
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!emailIsValid) {
      document.getElementById("login-email")?.focus();
      return;
    }
    if (!password) {
      document.getElementById("login-password")?.focus();
      return;
    }
    setLoading(true);

    try {
      const data = await authService.login(email.toLowerCase(), password);
      const role = data.user?.role;

      if (role === "sinh_vien") navigate("/sinhvien");
      else if (role === "giang_vien") navigate("/giangvien");
      else if (role === "admin") navigate("/admin");
      else
        setError(isVi ? "Tài khoản không hợp lệ." : "This account no valid .");
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code;
      if (code === "email_not_found") {
        setEmailError(
          isVi
            ? "Email này chưa được đăng ký."
            : "This email is not registered.",
        );
        setEmailTouched(true);
        setEmail("");
        setPassword("");
      } else if (code === "account_disabled") {
        setEmailError(
          isVi
            ? "Tài khoản này đã bị vô hiệu hóa."
            : "This account has been disabled.",
        );
      } else if (
        code === "password_incorrect" ||
        code === "invalid_credentials"
      ) {
        setPassword("");
        setPasswordTouched(true);
        setPasswordError(
          isVi ? "Mật khẩu không chính xác." : "The password is incorrect.",
        );
      } else if (code === "invalid_password") {
        setPassword("");
        setPasswordTouched(true);
        setPasswordError(
          isVi
            ? "Mật khẩu phải có từ 1 đến 64 ký tự."
            : "Password must contain 1 to 64 characters.",
        );
      } else if (code === "invalid_email") {
        setEmailTouched(true);
      }
      if (
        status === 429 ||
        status === 503 ||
        ![
          "email_not_found",
          "account_disabled",
          "password_incorrect",
          "invalid_credentials",
          "invalid_password",
          "invalid_email",
        ].includes(code)
      ) {
        setError(
          status === 429
            ? isVi
              ? "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau."
              : "Too many login attempts. Please try again later."
            : status === 503
              ? isVi
                ? "Đăng nhập tạm thời không khả dụng. Vui lòng thử lại sau."
                : "Login is temporarily unavailable. Please try again later."
              : isVi
                ? "Đăng nhập thất bại. Vui lòng thử lại."
                : "Login failed. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-page">
      <header className="login-header">
        <Link
          className="brand"
          to="/login"
          aria-label="ClassBridge - Đăng nhập"
        >
          <img
            src="/ClassBridge.png"
            alt="ClassBridge logo"
            className="brand-icon"
          />
          <span>ClassBridge</span>
        </Link>

        <div className="header-actions">
          <div className="language-switch">
            <button
              className={language === "en" ? "active" : ""}
              onClick={toggleLanguage}
              type="button"
            >
              En
            </button>
            <span />
            <button
              className={language === "vi" ? "active" : ""}
              onClick={toggleLanguage}
              type="button"
            >
              Vi
            </button>
          </div>
          <Link className="header-login" to="/register">
            {isVi ? "Đăng ký" : "Sign up"}
          </Link>
        </div>
      </header>

      <main className="login-main">
        <section className="login-card">
          <h1>{isVi ? "Đăng nhập Tài khoản" : "Sign in to your account"}</h1>
          <p className="login-description">
            {isVi
              ? "Chào mừng bạn quay trở lại ClassBridge"
              : "Welcome back to ClassBridge"}
          </p>

          <form onSubmit={handleLogin} noValidate>
            <div className="form-field">
              <label htmlFor="login-email">
                {isVi ? "Địa chỉ email" : "Email address"}
              </label>
              <input
                id="login-email"
                type="email"
                maxLength={254}
                placeholder={isVi ? "Nhập email của bạn" : "Enter your email"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailTouched(true);
                  setEmailError("");
                  setError("");
                  setPasswordError("");
                }}
                onBlur={() => setEmailTouched(true)}
                autoComplete="email"
                aria-invalid={Boolean(showEmailValidation && !emailIsValid)}
                aria-describedby={
                  showEmailValidation && !emailIsValid
                    ? "login-email-error"
                    : undefined
                }
              />
              {showEmailValidation && !emailIsValid && (
                <p
                  className="login-field-error"
                  id="login-email-error"
                  role="alert"
                >
                  {emailValidationMessage}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="login-password">
                {isVi ? "Mật khẩu" : "Password"}
              </label>
              <div className="password-wrapper">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  maxLength={64}
                  placeholder={isVi ? "Nhập mật khẩu" : "Enter your password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                    setPasswordTouched(true);
                    setPasswordError("");
                  }}
                  onBlur={() => setPasswordTouched(true)}
                  autoComplete="current-password"
                  aria-invalid={Boolean(passwordValidationMessage)}
                  aria-describedby={
                    passwordValidationMessage
                      ? "login-password-error login-password-requirements"
                      : undefined
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3L21 21M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.9 5.2A10.7 10.7 0 0112 5c5 0 8.5 4.5 9 7-.2 1.1-1 2.4-2.2 3.6M6.2 6.2C3.9 7.6 2.4 10 3 12c.5 2.5 4 7 9 7 1.2 0 2.3-.3 3.3-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordValidationMessage && (
                <p
                  className="login-field-error"
                  id="login-password-error"
                  role="alert"
                >
                  {passwordValidationMessage}
                </p>
              )}
              {passwordTouched && unmetPasswordRequirements.length > 0 && (
                <ul
                  className="login-password-requirements"
                  id="login-password-requirements"
                  aria-live="polite"
                >
                  {unmetPasswordRequirements.map((requirement) => (
                    <li key={requirement.id}>
                      <span aria-hidden="true">•</span> {requirement.text}
                    </li>
                  ))}
                </ul>
              )}

              <div className="forgot-row">
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                >
                  {isVi ? "Quên mật khẩu?" : "Forgot password?"}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="submit-button" disabled={loading}>
              {loading
                ? isVi
                  ? "Đang đăng nhập..."
                  : "Signing in..."
                : isVi
                  ? "Đăng nhập"
                  : "Sign in"}
            </button>
          </form>

          <p className="register-prompt">
            {isVi ? "Bạn chưa có tài khoản?" : "Don't have an account?"}{" "}
            <button type="button" onClick={() => navigate("/register")}>
              {isVi ? "Đăng ký ngay" : "Register now"}
              <span aria-hidden="true"> →</span>
            </button>
          </p>
        </section>
      </main>

      <Footer language={language} />
    </div>
  );
};

export default Login;
