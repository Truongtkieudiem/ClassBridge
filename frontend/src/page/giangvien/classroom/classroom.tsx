import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  CalendarDays,
  Clock3,
  MessageSquare,
  Plus,
  Presentation,
  Radio,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import api from "../../../services/api";
import styles from "./classroom.module.css";

type ClassroomSession = {
  id: string;
  classCode: string;
  className: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  status: "live" | "upcoming";
  questionCount: number;
  studentCount: number;
};

const weekdayLabel = (value: string | null) => {
  if (!value) return "";
  const weekday = new Date(value).getDay();
  return weekday === 0 ? "Chủ nhật" : `Thứ ${weekday + 1}`;
};

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "Chưa có thời gian";

export default function ClassroomPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [classCodeFilter, setClassCodeFilter] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("");
  const [period, setPeriod] = useState<"today" | "week">("today");
  const [sessions, setSessions] = useState<ClassroomSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isCreateNoticeOpen, setIsCreateNoticeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get("/auth/lecturer/dashboard/classroom-sessions")
      .then(({ data }) => {
        if (active) setSessions(data.sessions ?? []);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 401) {
            setLoadError("Phiên đăng nhập đã hết hạn. Vui lòng đăng xuất rồi đăng nhập lại.");
          } else if (status === 403) {
            setLoadError("Tài khoản hiện tại không có quyền truy cập lớp học.");
          } else if (status === 404) {
            setLoadError("Không tìm thấy API phiên học. Vui lòng khởi động lại backend.");
          } else if (status) {
            setLoadError(`Không thể tải phiên học (HTTP ${status}). Vui lòng thử lại.`);
          } else {
            setLoadError("Không kết nối được backend. Hãy kiểm tra backend đang chạy.");
          }
        } else {
          setLoadError("Đã xảy ra lỗi khi tải phiên học. Vui lòng thử lại.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filterOptions = useMemo(
    () => ({
      classes: [...new Set(sessions.map((session) => session.className))],
      classCodes: [...new Set(sessions.map((session) => session.classCode))],
      schedules: [
        ...new Set(
          sessions
            .map((session) => weekdayLabel(session.startsAt))
            .filter(Boolean),
        ),
      ],
    }),
    [sessions],
  );

  const visibleSessions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    return sessions.filter((session) => {
      const startsAt = session.startsAt ? new Date(session.startsAt) : null;
      const matchesQuery =
        !query ||
        [session.title, session.className, session.classCode].some((value) =>
          value.toLocaleLowerCase().includes(query),
        );
      const matchesClass = !classFilter || session.className === classFilter;
      const matchesCode =
        !classCodeFilter || session.classCode === classCodeFilter;
      const matchesSchedule =
        !scheduleFilter || weekdayLabel(session.startsAt) === scheduleFilter;
      const matchesPeriod =
        !startsAt ||
        (period === "today"
          ? startsAt >= today && startsAt < new Date(today.getTime() + 86400000)
          : startsAt >= weekStart && startsAt < weekEnd);
      return (
        matchesQuery &&
        matchesClass &&
        matchesCode &&
        matchesSchedule &&
        matchesPeriod
      );
    });
  }, [
    sessions,
    searchQuery,
    classFilter,
    classCodeFilter,
    scheduleFilter,
    period,
  ]);

  // Thứ 3 chính là lớp đang diễn ra hoặc gần diễn ra nhất trong danh sách đang hiển thị
  const featuredSessionId = useMemo(() => {
    const live = visibleSessions.find((session) => session.status === "live");
    if (live) return live.id;
    const now = Date.now();
    const upcoming = visibleSessions
      .filter(
        (session) =>
          session.startsAt && new Date(session.startsAt).getTime() >= now,
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime(),
      );
    if (upcoming.length > 0) return upcoming[0].id;
    // Fallback: phiên gần nhất theo thời gian (quá khứ gần nhất hoặc đầu danh sách)
    const sorted = [...visibleSessions].sort((a, b) => {
      const ta = a.startsAt
        ? new Date(a.startsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const tb = b.startsAt
        ? new Date(b.startsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
    return sorted[0]?.id ?? null;
  }, [visibleSessions]);

  const openSessionDetails = (session: ClassroomSession) => {
    navigate(`/giangvien/classroom/${encodeURIComponent(session.id)}`, {
      state: { status: session.status },
    });
  };

  return (
    <section className={styles.page}>
      <div className={styles.titleRow}>
        <div className={styles.heading}>
          <h1>Classroom</h1>
          <p>Qu&#7843;n l&#253; c&#225;c phi&#234;n h&#7885;c</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.addButton}
            aria-label="Thêm phiên học"
            onClick={() => setIsCreateNoticeOpen((open) => !open)}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      <div className={styles.filterToolbar}>
        <div className={styles.filtersLeft}>
          <input
            className={styles.searchInput}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tìm theo tên phiên hoặc lớp..."
            aria-label="Tìm kiếm phiên học"
          />
          <select
            aria-label="Lớp"
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
          >
            <option value="">Lớp</option>
            {filterOptions.classes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Mã lớp"
            value={classCodeFilter}
            onChange={(event) => setClassCodeFilter(event.target.value)}
          >
            <option value="">Mã lớp</option>
            {filterOptions.classCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <select
            aria-label="Lịch học"
            value={scheduleFilter}
            onChange={(event) => setScheduleFilter(event.target.value)}
          >
            <option value="">Lịch học</option>
            {filterOptions.schedules.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.periodSwitch} aria-label="Chọn khoảng thời gian">
          <button
            type="button"
            className={period === "today" ? styles.periodActive : ""}
            onClick={() => setPeriod("today")}
          >
            Hôm nay
          </button>
          <button
            type="button"
            className={period === "week" ? styles.periodActive : ""}
            onClick={() => setPeriod("week")}
          >
            Tuần này
          </button>
        </div>
      </div>
      <div className={styles.sessionsList} aria-live="polite">
        {loading ? (
          <p className={styles.sessionsMessage}>Đang tải phiên học...</p>
        ) : loadError ? (
          <p className={styles.sessionsMessage} role="alert">
            {loadError}
          </p>
        ) : visibleSessions.length === 0 ? (
          <p className={styles.sessionsMessage}>
            Không có phiên học phù hợp với bộ lọc.
          </p>
        ) : (
          visibleSessions.map((session) => (
            <article
              key={session.id}
              role="link"
              tabIndex={0}
              onClick={() => openSessionDetails(session)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openSessionDetails(session);
                }
              }}
              className={[
                styles.sessionCard,
                session.status === "live"
                  ? styles.liveCard
                  : styles.upcomingCard,
                session.id === featuredSessionId ? styles.featuredCard : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {session.id === featuredSessionId && (
                <span className={styles.featuredTag}>
                  {session.status === "live" ? (
                    <>
                      <Radio size={12} /> Đang diễn ra
                    </>
                  ) : (
                    <>
                      <Sparkles size={12} /> Gần diễn ra nhất
                    </>
                  )}
                </span>
              )}
              <div className={styles.sessionCardTop}>
                <div className={styles.sessionIdentity}>
                  <span className={styles.sessionIcon}>
                    <Presentation size={19} />
                  </span>
                  <div>
                    <div className={styles.sessionTitleLine}>
                      <h2>{session.title || session.className}</h2>
                      <span
                        className={
                          session.status === "live"
                            ? styles.liveBadge
                            : styles.upcomingBadge
                        }
                      >
                        {session.status === "live" ? (
                          <>
                            <Radio size={12} /> Live
                          </>
                        ) : (
                          <>
                            <Clock3 size={12} /> Sắp diễn ra
                          </>
                        )}
                      </span>
                    </div>
                    <p>
                      {session.className} · {session.classCode}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.moreButton}
                  aria-label="Tùy chọn phiên học"
                  onClick={(event) => event.stopPropagation()}
                >
                  ⋯
                </button>
              </div>
              <div className={styles.sessionMeta}>
                <span>
                  <CalendarDays size={15} /> {weekdayLabel(session.startsAt)} ·{" "}
                  {formatDateTime(session.startsAt)} →{" "}
                  {session.endsAt
                    ? new Intl.DateTimeFormat("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(new Date(session.endsAt))
                    : "—"}
                </span>
                <span>
                  <Users size={15} /> {session.studentCount} SV
                </span>
                <span
                  className={
                    session.status === "live" ? styles.metaHighlight : ""
                  }
                >
                  <MessageSquare size={15} /> {session.questionCount} câu hỏi
                </span>
              </div>
              <button
                type="button"
                className={styles.detailsButton}
                onClick={(event) => {
                  event.stopPropagation();
                  openSessionDetails(session);
                }}
              >
                {session.status === "live" ? (
                  <>
                    <Zap size={15} /> Vào lớp ngay
                  </>
                ) : (
                  "Xem chi tiết"
                )}
              </button>
            </article>
          ))
        )}
      </div>
      {isCreateNoticeOpen && (
        <div className={styles.notice} role="status">
          Ch&#7913;c n&#259;ng th&#234;m phi&#234;n h&#7885;c s&#7869;
          &#273;&#432;&#7907;c b&#7893; sung sau.
        </div>
      )}
    </section>
  );
}
