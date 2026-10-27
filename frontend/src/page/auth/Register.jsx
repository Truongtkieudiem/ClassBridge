import { useEffect, useRef, useState } from "react";
import { FaChalkboardUser, FaUserGraduate } from "react-icons/fa6";
import { Link, useNavigate } from "react-router-dom";
import authService from "../../services/auth.service";
import Footer from "../../components/footer";
import "./Login.css";
import "./Register.css";

const getCurrentTimestamp = () => Date.now();

const getEmailChecks = (value, isVi) => {
  const email = value;
  const atCount = (email.match(/@/g) || []).length;
  const [localPart = "", domain = ""] = email.split("@");
  const domainLabels = domain.split(".");
  const localPartValid =
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(
      localPart,
    );
  const localPartLengthValid = localPart.length <= 64;
  const domainValid =
    /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(
      domain,
    );
  const dotPlacementValid =
    Boolean(localPart) &&
    Boolean(domain) &&
    !localPart.startsWith(".") &&
    !localPart.endsWith(".") &&
    !localPart.includes("..") &&
    !domain.includes("..") &&
    domainLabels.every(
      (label) =>
        label.length > 0 && !label.startsWith("-") && !label.endsWith("-"),
    );

  return [
    {
      id: "required",
      valid: email.trim().length > 0,
      message: isVi ? "Vui lòng nhập email." : "Please enter an email address.",
    },
    {
      id: "format",
      valid:
        email.length > 0 &&
        atCount === 1 &&
        localPartValid &&
        localPartLengthValid &&
        domainValid &&
        !/\s/.test(email) &&
        dotPlacementValid &&
        email.length <= 254,
      message: isVi
        ? "Nhập email đúng định dạng, ví dụ student@gmail.com (tên tối đa 64 ký tự)."
        : "Enter a valid email, for example student@gmail.com (name up to 64 characters).",
    },
    {
      id: "at",
      valid: atCount === 1,
      message: isVi
        ? "Email phải có đúng một ký tự @."
        : "Email must contain exactly one @ character.",
    },
    {
      id: "parts",
      valid: atCount === 1 && Boolean(localPart) && Boolean(domain),
      message: isVi
        ? "Email phải có tên người dùng và tên miền."
        : "Email must include a name and a domain.",
    },
    {
      id: "domain",
      valid: domainValid,
      message: isVi
        ? "Tên miền chưa hợp lệ, ví dụ gmail.com hoặc outlook.com."
        : "The domain is invalid, for example gmail.com or outlook.com.",
    },
    {
      id: "spaces",
      valid: !/\s/.test(email),
      message: isVi
        ? "Email không được chứa khoảng trắng."
        : "Email cannot contain spaces.",
    },
    {
      id: "dots",
      valid: dotPlacementValid,
      message: isVi
        ? "Không dùng dấu chấm liên tiếp, ở đầu/cuối tên, hoặc sai vị trí trong tên miền."
        : "Dots cannot be repeated or placed incorrectly in the name or domain.",
    },
    {
      id: "length",
      valid: email.length <= 254,
      message: isVi
        ? "Email không được dài quá 254 ký tự."
        : "Email cannot exceed 254 characters.",
    },
  ];
};

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("Sinh viên");
  const [fullName, setFullName] = useState("");
  const [fullNameError, setFullNameError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentIdError, setStudentIdError] = useState("");
  const [lecturerId, setLecturerId] = useState("");
  const [lecturerIdError, setLecturerIdError] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailSendError, setEmailSendError] = useState("");
  const [emailCheck, setEmailCheck] = useState({
    email: "",
    status: "idle",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [verificationChallengeId, setVerificationChallengeId] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationExpiresAt, setVerificationExpiresAt] = useState(null);
  const [verificationSecondsLeft, setVerificationSecondsLeft] = useState(0);
  const [verificationChoices, setVerificationChoices] = useState([]);
  const [selectedVerificationNumber, setSelectedVerificationNumber] =
    useState(null);
  const [verificationError, setVerificationError] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const fullNameInputRef = useRef(null);
  const studentIdInputRef = useRef(null);
  const lecturerIdInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const confirmPasswordInputRef = useRef(null);
  const [language, setLanguage] = useState(
    localStorage.getItem("app_lang") || "vi",
  );
  const isVi = language === "vi";
  const toggleLanguage = () => {
    const nextLanguage = language === "vi" ? "en" : "vi";
    setLanguage(nextLanguage);
    localStorage.setItem("app_lang", nextLanguage);
  };

  const totalSteps = 3;
  const navigate = useNavigate();
  const emailChecks = getEmailChecks(email, isVi);
  const emailFormatValid = emailChecks.every((check) => check.valid);
  const visibleEmailChecks =
    email.length === 0
      ? emailChecks.slice(0, 1)
      : emailChecks.filter((check) => !check.valid);
  const emailCheckMatches =
    email === email.trim() && emailCheck.email === email.toLowerCase();
  const passwordRequirements = [
    {
      id: "length",
      met: password.length >= 8 && password.length <= 64,
      text: isVi ? "Từ 8 đến 64 ký tự" : "8 to 64 characters",
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
      id: "digit",
      met: /[0-9]/.test(password),
      text: isVi ? "Có ít nhất 1 chữ số" : "At least 1 number",
    },
    {
      id: "special",
      met: /[^A-Za-z0-9\s]/.test(password),
      text: isVi
        ? "Có ít nhất 1 ký tự đặc biệt"
        : "At least 1 special character",
    },
    {
      id: "common",
      met:
        Boolean(password) &&
        ![
          "password",
          "password1",
          "password123",
          "password123!",
          "qwerty123",
          "admin123",
          "welcome1",
          "letmein123",
          "iloveyou1",
          "abc12345",
          "12345678",
          "123456789",
          "qwerty123!",
          "student123!",
        ].includes(password.toLowerCase()),
      text: isVi ? "Không phải mật khẩu phổ biến" : "Not a common password",
    },
  ];
  const visiblePasswordRequirements = passwordRequirements.filter(
    (requirement) =>
      !requirement.met && (requirement.id !== "common" || password.length > 0),
  );

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    if (step !== 1 || !emailFormatValid) {
      return undefined;
    }

    let active = true;
    const timerId = window.setTimeout(async () => {
      setEmailCheck({ email: normalizedEmail, status: "checking" });
      try {
        await authService.checkRegistrationEmail(normalizedEmail);
        if (active) {
          setEmailCheck({ email: normalizedEmail, status: "available" });
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const checkStatuses = {
          email_already_registered: "registered",
          email_not_found: "invalid",
          email_could_not_verify: "unknown",
          email_validation_rate_limited: "rate_limited",
          email_check_rate_limited: "rate_limited",
          email_validation_unavailable: "service_error",
          email_validation_configuration_error: "configuration_error",
          email_validation_quota_exceeded: "configuration_error",
        };
        const errorCode = error.response?.data?.code;
        setEmailCheck({
          email: normalizedEmail,
          status:
            checkStatuses[errorCode] ||
            (error.response?.status === 429 ? "rate_limited" : "error"),
        });
      }
    }, 800);

    return () => {
      active = false;
      window.clearTimeout(timerId);
    };
  }, [email, emailFormatValid, step]);

  useEffect(() => {
    if (step !== 2 || verificationExpiresAt === null) {
      return undefined;
    }

    const updateRemainingTime = () => {
      setVerificationSecondsLeft(
        Math.max(0, Math.ceil((verificationExpiresAt - Date.now()) / 1000)),
      );
    };

    updateRemainingTime();
    const timerId = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(timerId);
  }, [step, verificationExpiresAt]);

  const handleVerificationSelection = async (selectedNumber) => {
    if (verificationLoading) {
      return;
    }
    if (verificationSecondsLeft <= 0) {
      setVerificationError(
        isVi
          ? "Mã xác minh đã hết hạn. Vui lòng gửi lại email."
          : "The verification number has expired. Please resend the email.",
      );
      return;
    }

    setSelectedVerificationNumber(selectedNumber);
    setVerificationLoading(true);
    setVerificationError("");
    try {
      const result = await authService.verifyRegistrationCode(
        verificationChallengeId,
        selectedNumber,
      );
      if (result.verified) {
        setStep(3);
        return;
      }

      if (Array.isArray(result.choices)) {
        setVerificationChoices(result.choices);
        setSelectedVerificationNumber(null);
        setVerificationExpiresAt(
          getCurrentTimestamp() + result.expiresIn * 1000,
        );
        setVerificationError(
          isVi
            ? "Số vừa chọn chưa đúng. Đã gửi số mới đến email; hãy chọn trong các lựa chọn mới."
            : "That number was incorrect. A new number was emailed; choose from the refreshed options.",
        );
        return;
      }

      setVerificationError(
        isVi
          ? "Không xác minh được email. Vui lòng thử lại."
          : "Email verification failed. Please try again.",
      );
    } catch (error) {
      setVerificationError(
        error.response?.data?.message ||
          (isVi
            ? "Không xác minh được email. Vui lòng thử lại."
            : "Email verification failed. Please try again."),
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleNext = async () => {
    if (verificationLoading) {
      return;
    }

    if (step === 1 && !fullName.trim()) {
      setFullNameError(
        isVi ? "Vui lòng nhập họ và tên." : "Please enter your full name.",
      );
      return;
    }

    if (step === 1 && role === "Sinh viên" && !/^\d{11}$/.test(studentId)) {
      setStudentIdError(
        isVi
          ? "Mã số sinh viên phải gồm đúng 11 chữ số."
          : "Student ID must contain exactly 11 digits.",
      );
      return;
    }

    if (step === 1 && !email.trim()) {
      setEmailTouched(true);
      return;
    }

    if (step === 1 && !emailFormatValid) {
      setEmailTouched(true);
      return;
    }

    if (
      step === 1 &&
      role === "Giảng viên" &&
      !/^[A-Za-z0-9]{1,30}$/.test(lecturerId)
    ) {
      setLecturerIdError(
        isVi
          ? "Mã giảng viên là bắt buộc, chỉ gồm chữ và số (tối đa 30 ký tự)."
          : "Lecturer ID is required and must contain only letters and digits (up to 30 characters).",
      );
      return;
    }

    if (step === 1) {
      const normalizedEmail = email.trim().toLowerCase();
      if (verificationChallengeId && verificationEmail === normalizedEmail) {
        setStep(2);
        return;
      }

      setVerificationLoading(true);
      setEmailSendError("");
      try {
        const challenge =
          await authService.sendRegistrationVerification(normalizedEmail);
        setVerificationChallengeId(challenge.challengeId);
        setVerificationEmail(normalizedEmail);
        setVerificationExpiresAt(
          getCurrentTimestamp() + challenge.expiresIn * 1000,
        );
        setVerificationChoices(challenge.choices);
        setSelectedVerificationNumber(null);
        setVerificationError("");
        setStep(2);
      } catch (error) {
        const sendErrorCode = error.response?.data?.code;
        setStep(1);
        if (
          sendErrorCode === "email_not_found" ||
          sendErrorCode === "email_already_registered"
        ) {
          setVerificationChallengeId("");
          setVerificationEmail("");
          setVerificationChoices([]);
          setSelectedVerificationNumber(null);
        }
        setEmailSendError(
          sendErrorCode === "email_already_registered"
            ? isVi
              ? "Email này đã có tài khoản ClassBridge. Vui lòng đăng nhập hoặc chọn Quên mật khẩu để khôi phục."
              : "This email already has a ClassBridge account. Sign in or use Forgot password to recover it."
            : sendErrorCode === "email_not_found"
              ? isVi
                ? "Không tìm thấy email này hoặc email không nhận được thư. Vui lòng kiểm tra lại."
                : "This email address could not be found or does not accept mail. Please check it."
              : sendErrorCode === "email_could_not_verify"
                ? isVi
                  ? "Chưa xác minh được email này. Vui lòng kiểm tra địa chỉ hoặc dùng email khác."
                  : "We could not verify this email. Check the address or try another one."
                : sendErrorCode === "email_validation_unavailable"
                  ? isVi
                    ? "Dịch vụ kiểm tra email đang tạm thời không khả dụng. Vui lòng thử lại sau."
                    : "The email validation service is temporarily unavailable. Please try again."
                  : sendErrorCode === "email_validation_configuration_error"
                    ? isVi
                      ? "Cấu hình API kiểm tra email chưa đúng. Vui lòng báo quản trị viên."
                      : "The email validation API key is missing or invalid. Please contact the administrator."
                    : sendErrorCode === "email_validation_quota_exceeded"
                      ? isVi
                        ? "Dịch vụ kiểm tra email đã hết lượt sử dụng. Vui lòng báo quản trị viên."
                        : "The email validation API quota has been reached. Please contact the administrator."
                      : sendErrorCode === "email_validation_rate_limited"
                        ? isVi
                          ? "Bạn vừa kiểm tra email quá nhanh. Vui lòng đợi một chút rồi thử lại."
                          : "Email checks are being requested too quickly. Please wait and try again."
                        : error.response?.data?.message ||
                          (error.response
                            ? isVi
                              ? "Máy chủ không gửi được email xác minh. Vui lòng kiểm tra cấu hình SMTP."
                              : "The server could not send the verification email. Check SMTP configuration."
                            : isVi
                              ? "Không kết nối được máy chủ gửi email. Vui lòng kiểm tra backend."
                              : "Could not connect to the email server. Check that the backend is running."),
        );
      } finally {
        setVerificationLoading(false);
      }
      return;
    }

    if (step === 2) {
      if (selectedVerificationNumber === null) {
        setVerificationError(
          isVi ? "Vui lòng chọn một số." : "Please select a number.",
        );
        return;
      }
      await handleVerificationSelection(selectedVerificationNumber);
      return;
    }

    if (step === totalSteps) {
      if (password.length < 8 || password.length > 64) {
        setRegistrationError(
          isVi
            ? "Mật khẩu phải có từ 8 đến 64 ký tự."
            : "Password must contain 8 to 64 characters.",
        );
        return;
      }
      if (!/[A-Z]/.test(password)) {
        setRegistrationError(
          isVi
            ? "Mật khẩu cần có ít nhất 1 chữ hoa."
            : "Password needs at least one uppercase letter.",
        );
        return;
      }
      if (!/[a-z]/.test(password)) {
        setRegistrationError(
          isVi
            ? "Mật khẩu cần có ít nhất 1 chữ thường."
            : "Password needs at least one lowercase letter.",
        );
        return;
      }
      if (!/[0-9]/.test(password)) {
        setRegistrationError(
          isVi
            ? "Mật khẩu cần có ít nhất 1 chữ số."
            : "Password needs at least one digit.",
        );
        return;
      }
      if (!/[^A-Za-z0-9\s]/.test(password)) {
        setRegistrationError(
          isVi
            ? "Mật khẩu cần có ít nhất 1 ký tự đặc biệt."
            : "Password needs at least one special character.",
        );
        return;
      }
      if (
        [
          "password",
          "password1",
          "password123",
          "password123!",
          "qwerty123",
          "admin123",
          "welcome1",
          "letmein123",
          "iloveyou1",
          "abc12345",
          "12345678",
          "123456789",
          "qwerty123!",
          "student123!",
        ].includes(password.toLowerCase())
      ) {
        setRegistrationError(
          isVi
            ? "Mật khẩu này quá phổ biến. Hãy chọn mật khẩu khác."
            : "This password is too common. Choose another one.",
        );
        return;
      }
      if (password !== confirmPassword) {
        setRegistrationError(
          isVi ? "Mật khẩu nhập lại không khớp." : "Passwords do not match.",
        );
        return;
      }

      setVerificationLoading(true);
      setRegistrationError("");
      try {
        await authService.registerAccount({
          fullName: fullName.trim(),
          email: verificationEmail,
          role: role === "Sinh viên" ? "student" : "lecturer",
          studentCode: role === "Sinh viên" ? studentId : undefined,
          lecturerCode: role === "Giảng viên" ? lecturerId : undefined,
          password,
          confirmPassword,
          challengeId: verificationChallengeId,
        });
        window.alert(
          isVi
            ? "Đăng ký tài khoản ClassBridge thành công!"
            : "Your ClassBridge account has been registered successfully!",
        );
        navigate("/login");
      } catch (error) {
        setRegistrationError(
          error.response?.data?.message ||
            (isVi
              ? "Không thể tạo tài khoản. Vui lòng thử lại."
              : "Could not create the account. Please try again."),
        );
      } finally {
        setVerificationLoading(false);
      }
    }
  };

  const handleFormSubmit = () => {
    if (step === 1) {
      const invalidEmail =
        !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      const missingRequiredField =
        !fullName.trim() ||
        (role === "Sinh viên" && !/^\d{11}$/.test(studentId)) ||
        (role === "Giảng viên" && !/^[A-Za-z0-9]{1,30}$/.test(lecturerId)) ||
        invalidEmail;

      if (missingRequiredField) {
        if (!fullName.trim()) {
          fullNameInputRef.current?.focus();
        } else if (role === "Sinh viên" && !/^\d{11}$/.test(studentId)) {
          studentIdInputRef.current?.focus();
        } else if (
          role === "Giảng viên" &&
          !/^[A-Za-z0-9]{1,30}$/.test(lecturerId)
        ) {
          lecturerIdInputRef.current?.focus();
        } else {
          emailInputRef.current?.focus();
        }
        handleNext();
        return;
      }

      handleNext();
      return;
    }

    if (step === 2) {
      return;
    }

    if (step === 3 && !password) {
      passwordInputRef.current?.focus();
      handleNext();
      return;
    }

    if (step === 3 && !confirmPassword) {
      confirmPasswordInputRef.current?.focus();
      setRegistrationError(
        isVi ? "Vui lòng nhập lại mật khẩu." : "Please confirm your password.",
      );
      return;
    }

    handleNext();
  };

  const handleResendVerification = async () => {
    setVerificationLoading(true);
    setVerificationError("");
    try {
      const challenge =
        await authService.sendRegistrationVerification(verificationEmail);
      setVerificationChallengeId(challenge.challengeId);
      setVerificationExpiresAt(
        getCurrentTimestamp() + challenge.expiresIn * 1000,
      );
      setVerificationChoices(challenge.choices);
      setSelectedVerificationNumber(null);
    } catch (error) {
      setVerificationError(
        error.response?.data?.message ||
          (isVi
            ? "Không gửi lại được email xác minh."
            : "Could not resend the verification email."),
      );
    } finally {
      setVerificationLoading(false);
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const progressPercent = ((step - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="container">
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
          <div className="language-switch" aria-label="Language">
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              onClick={toggleLanguage}
            >
              En
            </button>
            <span />
            <button
              type="button"
              className={language === "vi" ? "active" : ""}
              onClick={toggleLanguage}
            >
              Vi
            </button>
          </div>
          <Link className="header-login" to="/login">
            {isVi ? "Đăng nhập" : "Sign in"}
          </Link>
        </div>
      </header>

      {/* Main Form Box */}
      <main className="mainContent">
        <div className="card">
          {/* Steps Progress Indicator */}
          <div className="stepHeader">
            <div className="stepLabels">
              <span className={step === 1 ? "activeLabel" : ""}>
                {isVi ? "Bước 1 - Vai trò" : "Step 1 - Role"}
              </span>
              <span className={step === 2 ? "activeLabel" : ""}>
                {isVi ? "Bước 2: Xác nhận đ/c" : "Step 2: Verify identity"}
              </span>
              <span className={step === 3 ? "activeLabel" : ""}>
                {isVi ? "Bước 3: Mật khẩu" : "Step 3: Password"}
              </span>
            </div>
            <div className="progressWrapper">
              <div className="progressTrack"></div>
              <div
                className="progressBar"
                style={{ width: `${progressPercent}%` }}
              ></div>

              <div className={`stepDot ${step >= 1 ? "stepDotActive" : ""}`}>
                {step > 1 ? "✓" : "1"}
              </div>
              <div className={`stepDot ${step >= 2 ? "stepDotActive" : ""}`}>
                {step > 2 ? "✓" : "2"}
              </div>
              <div className={`stepDot ${step >= 3 ? "stepDotActive" : ""}`}>
                3
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="titleSection">
            <h1>
              {isVi
                ? "Tạo tài khoản ClassBridge"
                : "Create a ClassBridge account"}
            </h1>
            <p>
              {isVi
                ? "Đăng ký hệ thống tương tác lớp học song ngữ"
                : "Sign up for the bilingual classroom platform"}
            </p>
          </div>

          {/* Form Content */}
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              handleFormSubmit();
            }}
          >
            {/* STEP 1 */}
            {step === 1 && (
              <div>
                <label className="formLabel">
                  {isVi ? "Chọn vai trò của bạn:" : "Choose your role:"}
                </label>
                <div className="roleGrid">
                  <button
                    type="button"
                    onClick={() => {
                      setRole("Giảng viên");
                      setStudentIdError("");
                      setLecturerIdError("");
                    }}
                    className={`roleButton ${role === "Giảng viên" ? "roleButtonActive" : ""}`}
                  >
                    <FaChalkboardUser />
                    <span>{isVi ? "Giảng viên" : "Teacher"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("Sinh viên")}
                    className={`roleButton ${role === "Sinh viên" ? "roleButtonActive" : ""}`}
                  >
                    <FaUserGraduate />
                    <span>{isVi ? "Sinh viên" : "Student"}</span>
                  </button>
                </div>

                <div className="inputGroupGrid">
                  <div>
                    <label className="subLabel">
                      {isVi ? "Họ và tên" : "Full name"}
                    </label>
                    <div className="inputContainer">
                      <input
                        type="text"
                        value={fullName}
                        ref={fullNameInputRef}
                        maxLength={100}
                        onChange={(event) => {
                          setFullName(event.target.value);
                          setFullNameError("");
                        }}
                        placeholder={
                          isVi
                            ? "Ví dụ: Trương Thị Kiều Diễm"
                            : "Example: Trương Thị Kiều Diễm"
                        }
                        className="inputField"
                        aria-invalid={Boolean(fullNameError)}
                        aria-describedby={
                          fullNameError ? "full-name-error" : undefined
                        }
                        autoComplete="name"
                      />
                    </div>
                    {fullNameError && (
                      <p
                        className="fieldError"
                        id="full-name-error"
                        role="alert"
                      >
                        {fullNameError}
                      </p>
                    )}
                  </div>
                  {role === "Sinh viên" ? (
                    <div>
                      <label className="subLabel">
                        {isVi ? "Mã số sinh viên" : "Student ID"}
                      </label>
                      <div className="inputContainer">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={11}
                          value={studentId}
                          ref={studentIdInputRef}
                          onChange={(event) => {
                            const enteredValue = event.target.value;
                            const hasNonDigit = /\D/.test(enteredValue);
                            const digitsOnly = enteredValue
                              .replace(/\D/g, "")
                              .slice(0, 11);

                            setStudentId(digitsOnly);
                            setStudentIdError(
                              hasNonDigit
                                ? isVi
                                  ? "Không được nhập chữ, chỉ được nhập số."
                                  : "Letters are not allowed; enter digits only."
                                : digitsOnly.length > 0 &&
                                    digitsOnly.length < 11
                                  ? isVi
                                    ? "Mã số sinh viên phải đủ 11 số."
                                    : "Student ID must contain 11 digits."
                                  : "",
                            );
                          }}
                          aria-invalid={Boolean(studentIdError)}
                          aria-describedby={
                            studentIdError ? "student-id-error" : undefined
                          }
                          placeholder={
                            isVi ? "Ví dụ: 29209256876" : "Example: 29209256876"
                          }
                          className="inputField"
                        />
                      </div>
                      {studentIdError && (
                        <p
                          className="fieldError"
                          id="student-id-error"
                          role="alert"
                        >
                          {studentIdError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="subLabel" htmlFor="lecturer-id">
                        {isVi ? "Mã giảng viên" : "Lecturer ID"}
                      </label>
                      <div className="inputContainer">
                        <input
                          id="lecturer-id"
                          type="text"
                          value={lecturerId}
                          ref={lecturerIdInputRef}
                          maxLength={30}
                          onChange={(event) => {
                            const inputValue = event.target.value;
                            const validCharacters = inputValue.replace(
                              /[^A-Za-z0-9]/g,
                              "",
                            );
                            setLecturerId(validCharacters);
                            setLecturerIdError(
                              inputValue !== validCharacters
                                ? isVi
                                  ? "Mã giảng viên chỉ được gồm chữ và số."
                                  : "Lecturer ID can contain letters and digits only."
                                : "",
                            );
                          }}
                          placeholder={
                            isVi ? "Ví dụ: GV001" : "Example: LECTURER001"
                          }
                          className="inputField"
                          aria-invalid={Boolean(lecturerIdError)}
                          aria-describedby={
                            lecturerIdError ? "lecturer-id-error" : undefined
                          }
                          required
                        />
                      </div>
                      {lecturerIdError && (
                        <p
                          className="fieldError"
                          id="lecturer-id-error"
                          role="alert"
                        >
                          {lecturerIdError}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="subLabel" htmlFor="register-email">
                    {isVi ? "Email đăng ký" : "Registration email"}
                  </label>
                  <div className="inputContainer">
                    <input
                      id="register-email"
                      type="email"
                      maxLength={320}
                      value={email}
                      ref={emailInputRef}
                      onBlur={() => setEmailTouched(true)}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setEmailTouched(true);
                        setEmailSendError("");
                        setVerificationChallengeId("");
                        setVerificationEmail("");
                      }}
                      placeholder={
                        isVi
                          ? "Ví dụ: ten@example.com"
                          : "Example: name@example.com"
                      }
                      className="inputField"
                      autoComplete="email"
                      aria-invalid={Boolean(
                        emailSendError ||
                        ((emailTouched || email.length > 0) &&
                          !emailFormatValid) ||
                        (emailCheckMatches &&
                          [
                            "registered",
                            "invalid",
                            "unknown",
                            "error",
                            "configuration_error",
                          ].includes(emailCheck.status)),
                      )}
                      aria-describedby={
                        emailSendError
                          ? "register-email-send-error register-email-validation"
                          : visibleEmailChecks.length > 0
                            ? "register-email-validation"
                            : undefined
                      }
                      required
                    />
                  </div>
                  {emailSendError && (
                    <p
                      className="fieldError"
                      id="register-email-send-error"
                      role="alert"
                    >
                      {emailSendError}
                    </p>
                  )}
                  {(emailTouched || email.length > 0) &&
                    visibleEmailChecks.length > 0 && (
                      <ul
                        className="emailRequirements"
                        id="register-email-validation"
                        aria-live="polite"
                      >
                        {visibleEmailChecks.map((check) => (
                          <li key={check.id} className="emailRequirementUnmet">
                            <span aria-hidden="true">•</span> {check.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  {emailCheckMatches && emailCheck.status === "checking" && (
                    <p className="subLabel" role="status">
                      {isVi ? "Đang kiểm tra email..." : "Checking email..."}
                    </p>
                  )}
                  {emailCheckMatches && emailCheck.status === "registered" && (
                    <p
                      className="fieldError"
                      id="register-email-registered-error"
                      role="alert"
                    >
                      {isVi
                        ? "Email này đã có tài khoản ClassBridge. Vui lòng đăng nhập hoặc chọn Quên mật khẩu để khôi phục."
                        : "This email already has a ClassBridge account. Sign in or use Forgot password to recover it."}{" "}
                      <Link to="/login">{isVi ? "Đăng nhập" : "Sign in"}</Link>
                      {" · "}
                      <Link to="/forgot-password">
                        {isVi ? "Quên mật khẩu?" : "Forgot password?"}
                      </Link>
                    </p>
                  )}
                  {emailCheckMatches && emailCheck.status === "invalid" && (
                    <p className="fieldError" role="alert">
                      {isVi
                        ? "Email không hợp lệ hoặc không thể nhận thư. Vui lòng kiểm tra lại."
                        : "This email is invalid or cannot receive mail. Please check it."}
                    </p>
                  )}
                  {emailCheckMatches && emailCheck.status === "unknown" && (
                    <p className="fieldError" role="alert">
                      {isVi
                        ? "Chưa xác minh được email có thể nhận thư hay không. Hãy thử email khác hoặc tiếp tục để gửi mã xác nhận."
                        : "We could not confirm whether this email can receive mail. Try another email or continue to request a verification code."}
                    </p>
                  )}
                  {emailCheckMatches &&
                    emailCheck.status === "configuration_error" && (
                      <p className="fieldError" role="alert">
                        {isVi
                          ? "Dịch vụ kiểm tra email đang gặp lỗi cấu hình hoặc hết lượt."
                          : "Email validation is misconfigured or has reached its quota."}
                      </p>
                    )}
                  {emailCheckMatches &&
                    emailCheck.status === "rate_limited" && (
                      <p className="fieldError" role="alert">
                        {isVi
                          ? "Đã kiểm tra email quá nhiều lần. Vui lòng đợi rồi thử lại."
                          : "Too many email checks. Please wait and try again."}
                      </p>
                    )}
                  {emailCheckMatches &&
                    emailCheck.status === "service_error" && (
                      <p className="fieldError" role="alert">
                        {isVi
                          ? "Không kết nối được dịch vụ kiểm tra email. Vui lòng thử lại sau."
                          : "The email validation service is unavailable. Please try again later."}
                      </p>
                    )}
                  {emailCheckMatches && emailCheck.status === "error" && (
                    <p
                      className="fieldError"
                      id="register-email-check-error"
                      role="alert"
                    >
                      {isVi
                        ? "Không kiểm tra được email lúc này. Vui lòng thử lại."
                        : "Could not check this email right now. Please try again."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: Email number selection */}
            {step === 2 && (
              <div className="verificationStep">
                <label className="formLabel" style={{ textAlign: "left" }}>
                  {isVi
                    ? `Email đã gửi một số đến ${verificationEmail}. Chọn đúng số trong email:`
                    : `A number was sent to ${verificationEmail}. Select the number shown in the email:`}
                </label>
                <p
                  className={`verificationTimer ${
                    verificationSecondsLeft === 0
                      ? "verificationTimerExpired"
                      : ""
                  }`}
                  role="timer"
                  aria-live="off"
                >
                  {verificationSecondsLeft === 0
                    ? isVi
                      ? "Mã đã hết hạn"
                      : "Number expired"
                    : `${isVi ? "Thời gian còn lại" : "Time remaining"}: ${String(
                        Math.floor(verificationSecondsLeft / 60),
                      ).padStart(2, "0")}:${String(
                        verificationSecondsLeft % 60,
                      ).padStart(2, "0")}`}
                </p>
                <div className="verificationChoices">
                  {verificationChoices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={
                        verificationSecondsLeft === 0 || verificationLoading
                      }
                      className={`verificationChoice ${
                        selectedVerificationNumber === choice
                          ? "verificationChoiceSelected"
                          : ""
                      }`}
                      onClick={() => handleVerificationSelection(choice)}
                      aria-pressed={selectedVerificationNumber === choice}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                {verificationError && (
                  <p className="fieldError" role="alert">
                    {verificationError}
                  </p>
                )}
                <p className="resendPrompt">
                  {isVi
                    ? "Không nhận được email?"
                    : "Didn't receive the email?"}{" "}
                  <button
                    type="button"
                    className="resendButton"
                    onClick={handleResendVerification}
                    disabled={verificationLoading}
                  >
                    {isVi ? "Gửi lại" : "Resend"}
                  </button>
                </p>
              </div>
            )}

            {/* STEP 3: Mật khẩu bảo mật */}
            {step === 3 && (
              <div>
                <div style={{ marginBottom: "1rem" }}>
                  <label className="subLabel">
                    {isVi ? "Mật khẩu *" : "Password *"}
                  </label>
                  <div className="inputContainer">
                    <input
                      type="password"
                      value={password}
                      ref={passwordInputRef}
                      maxLength={64}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setRegistrationError("");
                      }}
                      autoComplete="new-password"
                      className="inputField"
                    />
                  </div>
                  {visiblePasswordRequirements.length > 0 && (
                    <ul className="passwordRequirements" aria-live="polite">
                      {visiblePasswordRequirements.map((requirement) => (
                        <li
                          key={requirement.id}
                          className="passwordRequirementUnmet"
                        >
                          <span aria-hidden="true">•</span> {requirement.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="subLabel">
                    {isVi ? "Nhập lại mật khẩu *" : "Confirm password *"}
                  </label>
                  <div className="inputContainer">
                    <input
                      type="password"
                      value={confirmPassword}
                      ref={confirmPasswordInputRef}
                      maxLength={64}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        setRegistrationError("");
                      }}
                      autoComplete="new-password"
                      className="inputField"
                      aria-invalid={Boolean(
                        confirmPassword && confirmPassword !== password,
                      )}
                    />
                  </div>
                  {confirmPassword && confirmPassword !== password && (
                    <p className="fieldError" role="alert">
                      {isVi
                        ? "Mật khẩu nhập lại chưa khớp."
                        : "Passwords do not match yet."}
                    </p>
                  )}
                </div>
                {registrationError && (
                  <p className="fieldError" role="alert">
                    {registrationError}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="actionButtons">
              {step > 1 && (
                <button type="button" onClick={handlePrev} className="backBtn">
                  {isVi ? "Quay lại" : "Back"}
                </button>
              )}
              {step !== 2 && (
                <div
                  style={{
                    width: step > 1 ? "auto" : "100%",
                    flexGrow: step > 1 ? 1 : 0,
                    marginLeft: step > 1 ? "1rem" : "0",
                  }}
                >
                  <button
                    type="submit"
                    className="nextBtn"
                    disabled={verificationLoading}
                  >
                    {verificationLoading
                      ? isVi
                        ? "Đang xử lý..."
                        : "Processing..."
                      : step === totalSteps
                        ? isVi
                          ? "Đăng ký"
                          : "Register"
                        : isVi
                          ? "Tiếp tục"
                          : "Continue"}
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* Footer Link */}
          <div className="footerLink">
            <Link to="/login">
              {isVi
                ? "Đã có tài khoản? Đăng nhập ngay →"
                : "Already have an account? Sign in →"}
            </Link>
          </div>
        </div>
      </main>

      <Footer language={language} />
    </div>
  );
}
