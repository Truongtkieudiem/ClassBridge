import axios from "axios";
import {
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  Expand,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Plus,
  Presentation,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../services/api";
import styles from "./offline.module.css";

type SessionStatus = "upcoming" | "live" | "ended";
type LanguageDirection = "vi-en" | "en-vi";

type OfflineSession = {
  id: string;
  title: string;
  status: SessionStatus;
  deliveryMode: "ONLINE" | "OFFLINE" | null;
  classCode: string;
  className: string;
  studentCount: number;
  totalQuestions: number;
  unansweredQuestions: number;
};

type SessionMaterial = {
  fileId: string;
  fileName: string;
  extension: string;
  firstSlide: {
    number: number;
    title: string | null;
    text: string | null;
    imageUrl: string | null;
  } | null;
  previewUrl: string | null;
};

const errorMessage = (error: unknown, fallback: string) => {
  const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
    error,
  )
    ? error.response?.data
    : undefined;
  return responseData?.message || responseData?.msg || fallback;
};

export default function OfflineClassroomPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<OfflineSession | null>(null);
  const [material, setMaterial] = useState<SessionMaterial | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  const [isLoading, setIsLoading] = useState(Boolean(sessionId));
  const [pageError, setPageError] = useState(
    sessionId ? "" : "Không có mã phiên học trong địa chỉ trang.",
  );
  const [languageDirection, setLanguageDirection] =
    useState<LanguageDirection>("vi-en");
  const [showBilingual, setShowBilingual] = useState(false);
  const [showExitMenu, setShowExitMenu] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [micNotice, setMicNotice] = useState(false);
  const [presentationError, setPresentationError] = useState("");

  const startPresentation = async () => {
    const slideCanvas = document.querySelector<HTMLElement>(
      `.${styles.slideCanvas}`,
    );
    if (!slideCanvas?.requestFullscreen) {
      setPresentationError("Trình duyệt này không hỗ trợ trình chiếu toàn màn hình.");
      return;
    }
    try {
      await slideCanvas.requestFullscreen();
      setPresentationError("");
    } catch {
      setPresentationError("Không thể bật chế độ trình chiếu toàn màn hình.");
    }
  };

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { data } = await api.get<{ session: OfflineSession }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}`,
      );
      setSession(data.session);
      setPageError("");
    } catch (error: unknown) {
      setPageError(errorMessage(error, "Không thể tải thông tin buổi học."));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const initialLoad = window.setTimeout(() => void loadSession(), 0);
    const timer = window.setInterval(() => void loadSession(), 15000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadSession, sessionId]);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      return () => {
        active = false;
      };
    }

    api
      .get<{ material: SessionMaterial | null }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/materials`,
      )
      .then(({ data }) => {
        if (active) setMaterial(data.material);
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(
            errorMessage(error, "Không thể tải bài giảng của buổi học."),
          );
        }
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const previewUrl = material?.previewUrl;
    if (!previewUrl?.startsWith("/")) {
      return () => {
        active = false;
      };
    }

    api
      .get(previewUrl, { responseType: "blob" })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setPreviewSrc(objectUrl);
      })
      .catch((error: unknown) => {
        if (active) {
          setPageError(
            errorMessage(error, "Không thể mở trang đầu bài giảng."),
          );
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material?.previewUrl]);

  const handleEndSession = async () => {
    if (
      !sessionId ||
      !window.confirm("Kết thúc buổi học sẽ ngắt phiên của cả lớp. Tiếp tục?")
    ) {
      return;
    }
    setIsEndingSession(true);
    try {
      await api.post(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/end`,
      );
      navigate("/giangvien/classroom", { replace: true });
    } catch (error: unknown) {
      setPageError(errorMessage(error, "Không thể kết thúc buổi học."));
      setIsEndingSession(false);
    }
  };

  const renderedPreview = material?.firstSlide?.imageUrl ? (
    <img
      className={styles.slideImage}
      src={material.firstSlide.imageUrl}
      alt={material.firstSlide.title || "Slide bài giảng"}
    />
  ) : previewSrc ? (
    <iframe
      className={styles.slidePdf}
      src={`${previewSrc}#page=1&toolbar=0&navpanes=0`}
      title={`Slide bài giảng: ${material?.fileName || ""}`}
    />
  ) : material?.firstSlide?.text ? (
    <div className={styles.slideText}>
      <h2>{material.firstSlide.title || "Bài giảng"}</h2>
      <p>{material.firstSlide.text}</p>
    </div>
  ) : (
    <div className={styles.emptySlide}>
      <Presentation size={56} />
      <strong>
        {material
          ? "Tài liệu chưa có bản xem trước"
          : "Chưa có bài giảng cho buổi học này"}
      </strong>
      <span>
        {material?.fileName || "Thêm file bài giảng từ trang chi tiết buổi học."}
      </span>
    </div>
  );

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            navigate(`/giangvien/classroom/${encodeURIComponent(sessionId || "")}`)
          }
        >
          <ArrowLeft size={17} />
          <span>Rời phòng học</span>
        </button>
        <div className={styles.sessionIdentity}>
          <span className={styles.liveDot} />
          <span>{session?.classCode || "Phòng học offline"}</span>
          <span className={styles.identityDivider}>/</span>
          <strong>{session?.title || "Đang tải buổi học..."}</strong>
        </div>
        <div className={styles.topRight}>
          <span className={styles.modeBadge}>Học offline</span>
          <button
            type="button"
            className={styles.languageSelect}
            onClick={() => setShowBilingual((visible) => !visible)}
            aria-expanded={showBilingual}
          >
            {showBilingual ? "Tắt song ngữ" : "Bật song ngữ"}
          </button>
        </div>
      </header>

      {pageError && (
        <div className={styles.pageError} role="alert">
          {pageError}
          <button type="button" onClick={() => setPageError("")} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
      )}
      {presentationError && (
        <div className={styles.pageError} role="alert">
          {presentationError}
          <button
            type="button"
            onClick={() => setPresentationError("")}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className={styles.classroom}>
        <div className={styles.presentationPanel}>
          <div className={styles.presentationToolbar}>
            <span className={styles.presentationTitle}>
              {material?.fileName || "Bài giảng"}
            </span>
            <div className={styles.presentationActions}>
              <span className={styles.slideCount}>
                {material?.firstSlide?.number
                  ? `Slide ${material.firstSlide.number}`
                  : material
                    ? "Trang 1"
                    : "Chưa có slide"}
              </span>
              <button
                type="button"
                className={styles.presentButton}
                onClick={() => void startPresentation()}
                title="Chỉ trình chiếu slide; nhấn Esc để thoát"
                aria-label="Trình chiếu riêng slide toàn màn hình"
              >
                <Expand size={16} />
                <span>Trình chiếu</span>
              </button>
            </div>
          </div>
          <div className={styles.slideCanvas}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <Loader2 className={styles.spinner} size={28} />
                <span>Đang tải phòng học...</span>
              </div>
            ) : (
              renderedPreview
            )}
          </div>
          {showBilingual && (
            <section className={styles.subtitlePanel} aria-live="polite">
              <div className={styles.subtitleHeading}>
                <span className={styles.subtitleLiveDot} />
                <strong>Phụ đề song ngữ</strong>
                <button
                  type="button"
                  className={styles.directionButton}
                  onClick={() =>
                    setLanguageDirection((current) =>
                      current === "vi-en" ? "en-vi" : "vi-en",
                    )
                  }
                >
                  {languageDirection === "vi-en" ? "VI → EN" : "EN → VI"}
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className={styles.bilingualText}>
                <div>
                  <strong>
                    {languageDirection === "vi-en" ? "Tiếng Việt" : "English"}
                  </strong>
                  <p>
                    Phụ đề gốc sẽ hiển thị tại đây khi tích hợp dịch vụ giọng nói.
                  </p>
                </div>
                <div>
                  <strong>
                    {languageDirection === "vi-en" ? "English" : "Tiếng Việt"}
                  </strong>
                  <p>
                    Bản dịch sẽ hiển thị tại đây khi tích hợp dịch vụ giọng nói.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className={styles.sidePanel}>
          <div className={styles.sidePanelHeader}>
            <div>
              <span className={styles.eyebrow}>PHÒNG HỌC</span>
              <h1>{session?.className || "Lớp học"}</h1>
            </div>
            <span className={styles.statusBadge}>
              <span className={styles.liveDot} />
              {session?.status === "live"
                ? "Đang diễn ra"
                : session?.status || "Đang tải"}
            </span>
          </div>
          <button
            type="button"
            className={styles.micSetupButton}
            onClick={() => setMicNotice(true)}
          >
            <Mic size={17} />
            Kết nối mic
            <span>Chưa kết nối</span>
          </button>
          {micNotice && (
            <div className={styles.inlineNotice} role="status">
              Thu âm và dịch trực tiếp sẽ được bật sau khi tích hợp backend.
              Hiện tại trang chưa truy cập microphone.
            </div>
          )}
          <div className={styles.privacyNote}>
            <MicOff size={15} />
            Mic chưa thu âm. Nội dung lời giảng chưa được gửi hoặc lưu.
          </div>
          {material && (
            <div className={styles.materialInfo}>
              <Presentation size={17} />
              <span>{material.fileName}</span>
            </div>
          )}
        </aside>
      </section>

      <footer className={styles.controlBar}>
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={styles.chatButton}
            onClick={() =>
              navigate(
                `/giangvien/classroom/${encodeURIComponent(sessionId || "")}/chat`,
              )
            }
            aria-label="Mở chat của buổi học"
          >
            <MessageSquareText size={19} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => setMicNotice(true)}
            aria-label="Microphone"
          >
            <Mic size={20} />
            <span>Mic</span>
          </button>
        </div>
        <div className={styles.controlDivider} />
        <div className={styles.controlGroup}>
          <div className={styles.statItem}>
            <Users size={20} />
            <span className={styles.statValue}>
              {session?.studentCount ?? 0}
            </span>
            <span>Sinh viên</span>
          </div>
          <div className={styles.statItem}>
            <MessageSquareText size={20} />
            <span className={styles.statValue}>
              {session?.totalQuestions ?? 0}
            </span>
            <span>Câu hỏi</span>
          </div>
          <div className={styles.statItem}>
            <CircleHelp size={20} />
            <span className={styles.statValue}>
              {session?.unansweredQuestions ?? 0}
            </span>
            <span>Chưa trả lời</span>
          </div>
        </div>
        <div className={styles.controlDivider} />
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={styles.quickQuestionButton}
            onClick={() =>
              navigate(
                `/giangvien/classroom/${encodeURIComponent(sessionId || "")}/cauhoi`,
              )
            }
            disabled={session?.status !== "live"}
          >
            <Plus size={19} />
            <span>Tạo câu hỏi nhanh</span>
          </button>
          <div className={styles.exitContainer}>
            <button
              type="button"
              className={styles.exitButton}
              onClick={() => setShowExitMenu((visible) => !visible)}
              aria-expanded={showExitMenu}
            >
              Thoát <ChevronDown size={15} />
            </button>
            {showExitMenu && (
              <div className={styles.exitMenu}>
                <button
                  type="button"
                  onClick={() => void handleEndSession()}
                  disabled={isEndingSession}
                >
                  {isEndingSession ? (
                    <Loader2 size={16} className={styles.spinner} />
                  ) : (
                    <X size={16} />
                  )}
                  Kết thúc lớp học
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/giangvien/classroom/${encodeURIComponent(sessionId || "")}`,
                    )
                  }
                >
                  <ArrowLeft size={16} />
                  Rời khỏi lớp học
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>

    </main>
  );
}