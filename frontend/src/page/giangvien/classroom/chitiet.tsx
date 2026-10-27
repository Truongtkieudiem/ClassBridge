"use client";

import axios from "axios";
import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  Users,
  HelpCircle,
  Video,
  MapPin,
  Square,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Layers,
  MessageSquare,
  Upload,
} from "lucide-react";
import api from "../../../services/api";
import styles from "./chitiet.module.css";

type SessionStatus = "upcoming" | "live" | "ended";

type SessionDetails = {
  id: string;
  title: string;
  status: SessionStatus;
  joinCode: string;
  classCode: string;
  className: string;
  startsAt: string | null;
  endsAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  deliveryMode: "ONLINE" | "OFFLINE" | null;
  studentCount: number;
  totalQuestions: number;
  unansweredQuestions: number;
};

type SessionMaterial = {
  fileId: string;
  fileName: string;
  extension: string;
  mimeType: string | null;
  fileSize: number;
  firstSlide: {
    number: number;
    title: string | null;
    text: string | null;
    imageUrl: string | null;
  } | null;
  previewUrl: string | null;
};

export type ChiTietPhienHocProps = {
  sessionId?: string;
  initialStatus?: SessionStatus;
  onBack?: () => void;
};

export default function ChiTietPhienHoc({
  sessionId,
  initialStatus = "upcoming",
  onBack,
}: ChiTietPhienHocProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [materialState, setMaterialState] = useState<{
    sessionId: string;
    material: SessionMaterial | null;
  } | null>(null);
  const [materialLoadedSessionId, setMaterialLoadedSessionId] = useState<
    string | null
  >(null);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    previewUrl: string;
    src: string;
  } | null>(null);
  const material =
    materialState?.sessionId === sessionId ? materialState.material : null;
  const isMaterialLoading = Boolean(
    sessionId && materialLoadedSessionId !== sessionId,
  );
  const previewSrc = material?.previewUrl?.startsWith("/")
    ? previewState?.previewUrl === material.previewUrl
      ? previewState.src
      : ""
    : material?.previewUrl || "";

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      return () => {
        active = false;
      };
    }

    api
      .get<{ session: SessionDetails }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}`,
      )
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setStatus(data.session.status);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
          error,
        )
          ? error.response?.data
          : undefined;
        setErrorMessage(
          responseData?.message ||
            responseData?.msg ||
            "Không thể tải thông tin phiên học.",
        );
      })
      .finally(() => {
        if (active) setIsPageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    if (!sessionId) return () => {
      active = false;
    };
    api
      .get<{ material: SessionMaterial | null }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/materials`,
      )
      .then(({ data }) => {
        if (!active) return;
        setMaterialState({ sessionId, material: data.material });
        setMaterialError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
          error,
        )
          ? error.response?.data
          : undefined;
        setMaterialError(
          responseData?.message ||
            responseData?.msg ||
            "Không thể kiểm tra bài giảng của buổi học.",
        );
      })
      .finally(() => {
        if (active) setMaterialLoadedSessionId(sessionId);
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
        setPreviewState({ previewUrl, src: objectUrl });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
          error,
        )
          ? error.response?.data
          : undefined;
        setMaterialError(
          responseData?.message ||
            responseData?.msg ||
            "Không thể mở trang đầu bài giảng.",
        );
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material?.previewUrl]);

  const formatDateTime = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "medium",
          timeStyle: "short",
          hour12: false,
        }).format(new Date(value))
      : "Chưa có thời gian";

  const handleStartSession = async (deliveryMode: "ONLINE" | "OFFLINE") => {
    if (!sessionId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data } = await api.post<{ session: SessionDetails }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/start`,
        { deliveryMode },
      );
      setSession(data.session);
      setStatus(data.session.status);
      if (deliveryMode === "OFFLINE") {
        navigate(
          `/giangvien/classroom/${encodeURIComponent(sessionId)}/offline`,
        );
      }
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
        error,
      )
        ? error.response?.data
        : undefined;
      setErrorMessage(
        responseData?.message ||
          responseData?.msg ||
          "Không thể bắt đầu phiên học. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (
      !sessionId ||
      !window.confirm("Bạn có chắc chắn muốn kết thúc phiên học này không?")
    ) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data } = await api.post<{ session: SessionDetails }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/end`,
      );
      setSession(data.session);
      setStatus(data.session.status);
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
        error,
      )
        ? error.response?.data
        : undefined;
      setErrorMessage(
        responseData?.message ||
          responseData?.msg ||
          "Không thể kết thúc phiên học. Vui lòng thử lại.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleMaterialUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !sessionId) return;

    const formData = new FormData();
    formData.append("file", file);
    setIsUploadingMaterial(true);
    setMaterialError(null);
    try {
      const { data } = await api.post<{ material: SessionMaterial }>(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/materials`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setMaterialState({ sessionId, material: data.material });
    } catch (error: unknown) {
      const responseData = axios.isAxiosError<{ message?: string; msg?: string }>(
        error,
      )
        ? error.response?.data
        : undefined;
      setMaterialError(
        responseData?.message ||
          responseData?.msg ||
          "Không thể tải bài giảng lên. Vui lòng thử lại.",
      );
    } finally {
      setIsUploadingMaterial(false);
    }
  };

  const lectureMaterialCard = (
    <div className={styles.card}>
      <h3 className={styles.sectionHeading}>Bài giảng hôm nay</h3>
      {isMaterialLoading ? (
        <p className={styles.materialStatus}>Đang kiểm tra bài giảng...</p>
      ) : materialError && !material ? (
        <p className={styles.materialError} role="alert">{materialError}</p>
      ) : material ? (
        <div className={styles.materialContent}>
          <p className={styles.materialFileName}>{material.fileName}</p>
          {material.firstSlide?.imageUrl ? (
            <img
              className={styles.slidePreviewImage}
              src={material.firstSlide.imageUrl}
              alt={material.firstSlide.title || "Trang đầu bài giảng"}
            />
          ) : previewSrc ? (
            <iframe
              className={styles.pdfPreview}
              src={`${previewSrc}#page=1`}
              title={`Trang đầu bài giảng: ${material.fileName}`}
            />
          ) : material.firstSlide?.text ? (
            <div className={styles.slideTextPreview}>
              <strong>{material.firstSlide.title || "Trang đầu"}</strong>
              <p>{material.firstSlide.text}</p>
            </div>
          ) : (
            <p className={styles.materialStatus}>
              Tài liệu đã được tải lên nhưng chưa có bản xem trước trang đầu.
            </p>
          )}
        </div>
      ) : (
        <p className={styles.materialStatus}>
          Chưa có bài giảng cho buổi học này.
        </p>
      )}
      {materialError && material && (
        <p className={styles.materialError} role="alert">{materialError}</p>
      )}
      <label
        className={`${styles.uploadMaterialButton} ${
          isUploadingMaterial || isMaterialLoading
            ? styles.uploadMaterialButtonDisabled
            : ""
        }`}
      >
        {isUploadingMaterial ? (
          <Loader2 size={16} className={styles.spinner} />
        ) : (
          <Upload size={16} />
        )}
        {isUploadingMaterial ? "Đang tải lên..." : material ? "Tải bài giảng khác" : "Import bài giảng"}
        <input
          type="file"
          accept=".pdf,.ppt,.pptx,.doc,.docx,.odt,.odp"
          onChange={(event) => void handleMaterialUpload(event)}
          disabled={isUploadingMaterial || isMaterialLoading || !sessionId}
        />
      </label>
      <span className={styles.materialHint}>
        PDF, PowerPoint, Word, ODT hoặc ODP (tối đa 20 MB)
      </span>
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Breadcrumb / Navigation */}
      <div className={styles.breadcrumbBar}>
        <button
          className={styles.backButton}
          onClick={onBack ?? (() => navigate("/giangvien/classroom"))}
        >
          <ArrowLeft size={16} /> Classroom / Session Details
        </button>
      </div>
      {isPageLoading && sessionId && (
        <div className={styles.card}>Đang tải thông tin phiên học...</div>
      )}
      {(!sessionId || errorMessage) && (
        <div className={styles.errorAlert} role="alert">
          <AlertCircle size={16} />{" "}
          {errorMessage || "Không có mã phiên học trong địa chỉ trang."}
        </div>
      )}

      {/* Header Section */}
      <div className={styles.headerCard}>
        <div className={styles.headerInfo}>
          <div className={styles.metaRow}>
            <span className={styles.classBadge}>
              {session
                ? `${session.classCode} · ${session.className}`
                : "Đang tải lớp học"}
            </span>
            {status === "upcoming" && (
              <span className={styles.badgeUpcoming}>Upcoming</span>
            )}
            {status === "live" && (
              <span className={styles.badgeLive}>
                <span className={styles.pulseDot} /> Live
              </span>
            )}
            {status === "ended" && (
              <span className={styles.badgeEnded}>Ended</span>
            )}
            {status === "live" && session?.deliveryMode && (
              <span className={styles.classBadge}>
                {session.deliveryMode === "ONLINE" ? "Học online" : "Học offline"}
              </span>
            )}
          </div>
          <h1 className={styles.sessionTitle}>
            {session?.title || "Phiên học"}
          </h1>
          <div className={styles.dateTimeRow}>
            <span>
              <Calendar size={14} /> {formatDateTime(session?.startsAt ?? null)}
            </span>
            <span>
              <Clock size={14} />{" "}
              {session?.startsAt && session.endsAt
                ? `${new Intl.DateTimeFormat("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(session.startsAt))}–${new Intl.DateTimeFormat(
                    "vi-VN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    },
                  ).format(new Date(session.endsAt))}`
                : "Chưa có giờ học"}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          {status === "upcoming" && (
            <div className={styles.startOptions}>
              <button
                className={styles.btnPrimary}
                onClick={() => void handleStartSession("ONLINE")}
                disabled={isLoading || isPageLoading || !session}
              >
                {isLoading ? (
                  <Loader2 size={16} className={styles.spinning} />
                ) : (
                  <Video size={16} />
                )}
                Học online
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => void handleStartSession("OFFLINE")}
                disabled={isLoading || isPageLoading || !session}
              >
                {isLoading ? (
                  <Loader2 size={16} className={styles.spinning} />
                ) : (
                  <MapPin size={16} />
                )}
                Học offline
              </button>
            </div>
          )}
          {status === "live" && (
            <div className={styles.startOptions}>
              {session?.deliveryMode === "OFFLINE" && (
                <button
                  className={styles.btnPrimary}
                  onClick={() =>
                    navigate(
                      `/giangvien/classroom/${encodeURIComponent(session.id)}/offline`,
                    )
                  }
                >
                  <MapPin size={16} /> Mở phòng học offline
                </button>
              )}
              <button
                className={styles.btnDanger}
                onClick={() => void handleEndSession()}
                disabled={isLoading}
              >
                <Square size={16} /> Kết thúc phiên học
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content theo từng trạng thái vòng đời phiên học */}
      {status === "upcoming" ? (
        /* BƯỚC 1: TRANG THÁI TRƯỚC KHI BẮT ĐẦU */
        <div className={styles.gridUpcoming}>
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Session Information</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Session ID</span>
                <span className={styles.infoValue}>
                  {session?.id || sessionId || "—"}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Số sinh viên tham gia</span>
                <span className={styles.infoValue}>
                  {session?.studentCount ?? 0}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Tổng số câu hỏi</span>
                <span className={styles.infoValue}>
                  {session?.totalQuestions ?? 0}
                </span>
              </div>
            </div>
          </div>

          {lectureMaterialCard}
        </div>
      ) : (
        /* BƯỚC 4: SESSION DASHBOARD SAU KHI BẮT ĐẦU (LIVE)[cite: 1] */
        <div className={styles.dashboardContainer}>
          {/* Thẻ thống kê nhanh */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div
                className={styles.metricIcon}
                style={{ background: "#eff6ff", color: "#2563eb" }}
              >
                <Users size={20} />
              </div>
              <div>
                <span className={styles.metricLabel}>Sinh viên tham gia</span>
                <span className={styles.metricValue}>
                  {session?.studentCount ?? 0}
                </span>
              </div>
            </div>
            <div className={styles.metricCard}>
              <div
                className={styles.metricIcon}
                style={{ background: "#f3e8ff", color: "#9333ea" }}
              >
                <MessageSquare size={20} />
              </div>
              <div>
                <span className={styles.metricLabel}>Tổng câu hỏi</span>
                <span className={styles.metricValue}>
                  {session?.totalQuestions ?? 0}
                </span>
              </div>
            </div>
            <div className={styles.metricCard}>
              <div
                className={styles.metricIcon}
                style={{ background: "#fef3c7", color: "#d97706" }}
              >
                <HelpCircle size={20} />
              </div>
              <div>
                <span className={styles.metricLabel}>Chưa trả lời</span>
                <span className={styles.metricValue}>
                  {session?.unansweredQuestions ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Khu vực điều hành phiên học */}
          <div className={styles.workspaceGrid}>
            <div className={styles.workspaceMain}>
              <div className={styles.card}>
                <h3 className={styles.sectionHeading}>Điều hành phiên học</h3>
                <div className={styles.toolsGrid}>
                  <div className={styles.toolItem}>
                    <div className={styles.toolHeader}>
                      <MessageSquare size={18} color="#2563eb" />
                      <h4>Anonymous Q&A</h4>
                    </div>
                    <p>Theo dõi câu hỏi ẩn danh từ sinh viên.</p>
                    <button className={styles.btnToolAction}>Mở Q&A</button>
                  </div>

                  <div className={styles.toolItem}>
                    <div className={styles.toolHeader}>
                      <Layers size={18} color="#9333ea" />
                      <h4>Question Clusters</h4>
                    </div>
                    <p>Xem các câu hỏi tương đồng được AI gom nhóm.</p>
                    <button className={styles.btnToolAction}>
                      Xem nhóm câu hỏi
                    </button>
                  </div>

                  <div className={styles.toolItem}>
                    <div className={styles.toolHeader}>
                      <CheckCircle2 size={18} color="#16a34a" />
                      <h4>Câu trả lời</h4>
                    </div>
                    <p>
                      Trả lời câu hỏi đại diện và phân phối câu trả lời cho nhóm
                      liên quan.
                    </p>
                    <button className={styles.btnToolAction}>
                      Quản lý trả lời
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.workspaceSidebar}>
              {lectureMaterialCard}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
