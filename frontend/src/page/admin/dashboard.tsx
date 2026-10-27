import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import styles from "./dashboard.module.css";
import api from "../../services/api";
import AdminSidebar from "./sidebar";
import {
  LuActivity,
  LuBookOpen,
  LuCircleHelp,
  LuClock,
  LuLayers,
  LuPlay,
  LuUsersRound,
} from "react-icons/lu";

type DashboardStats = {
  totalAccounts: number;
  lecturers: number;
  students: number;
  classes: number;
  classesActive: number;
  sessions: number;
  sessionsOngoing: number;
  questions: number;
  questionGroups: number;
};

type AccountDistribution = {
  admin: number;
  lecturer: number;
  student: number;
};

type ActivityItem = {
  id: string;
  time: string;
  title: string;
  description: string;
  actor: string;
};

type ActivityPoint = {
  date: string;
  accounts: number;
  sessions: number;
  questions: number;
  questionGroups: number;
};

type DashboardData = {
  stats: DashboardStats;
  distribution: AccountDistribution;
  activities: ActivityItem[];
  systemOverview: ActivityPoint[];
  admin: { name: string; email: string };
};

const EMPTY_DATA: DashboardData = {
  stats: {
    totalAccounts: 0,
    lecturers: 0,
    students: 0,
    classes: 0,
    classesActive: 0,
    sessions: 0,
    sessionsOngoing: 0,
    questions: 0,
    questionGroups: 0,
  },
  distribution: { admin: 0, lecturer: 0, student: 0 },
  activities: [],
  systemOverview: [],
  admin: { name: "", email: "" },
};

const formatNumber = (value: number) => value.toLocaleString("vi-VN");

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ size?: number }>;
  iconClass: string;
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statCardTop}>
        <span className={`${styles.statIcon} ${iconClass}`}>
          <Icon size={20} />
        </span>
        <LuActivity size={16} className={styles.statChevron} />
      </div>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{formatNumber(value)}</p>
      {detail && <p className={styles.statTrend}>{detail}</p>}
    </article>
  );
}

function AccountDistribution({
  distribution,
}: {
  distribution: AccountDistribution;
}) {
  const total = distribution.admin + distribution.lecturer + distribution.student;
  const adminEnd = total ? (distribution.admin / total) * 100 : 0;
  const lecturerEnd = total
    ? adminEnd + (distribution.lecturer / total) * 100
    : 0;
  const items = [
    { label: "Admin", count: distribution.admin, className: styles.legendDotBlue },
    {
      label: "Lecturer",
      count: distribution.lecturer,
      className: styles.legendDotPurple,
    },
    { label: "Student", count: distribution.student, className: styles.legendDotGreen },
  ];

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitleRow}>
        <LuUsersRound size={17} className={styles.panelTitleIcon} />
        Số tài khoản theo vai trò
      </h2>
      {total === 0 ? (
        <p className={styles.emptyText}>Chưa có tài khoản.</p>
      ) : (
        <div className={styles.distributionRow}>
          <div
            className={styles.donut}
            style={{
              background: `conic-gradient(#2563eb 0% ${adminEnd}%, #8b5cf6 ${adminEnd}% ${lecturerEnd}%, #22c55e ${lecturerEnd}% 100%)`,
            }}
            role="img"
            aria-label={`Admin ${distribution.admin}, Lecturer ${distribution.lecturer}, Student ${distribution.student}`}
          >
            <div className={styles.donutHole}>
              <span className={styles.donutTotal}>{formatNumber(total)}</span>
              <span className={styles.donutTotalLabel}>Tài khoản</span>
            </div>
          </div>
          <div className={styles.distributionLegend}>
            {items.map((item) => (
              <div className={styles.legendRow} key={item.label}>
                <span className={`${styles.legendDot} ${item.className}`} />
                <span className={styles.legendLabel}>{item.label}</span>
                <strong className={styles.legendValue}>
                  {formatNumber(item.count)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const CHART_SERIES = [
  { key: "accounts", label: "Tài khoản", color: "#2563eb" },
  { key: "sessions", label: "Phiên học", color: "#8b5cf6" },
  { key: "questions", label: "Câu hỏi", color: "#22c55e" },
  { key: "questionGroups", label: "Nhóm câu hỏi AI", color: "#f97316" },
] as const;

function ActivityChart({ points }: { points: ActivityPoint[] }) {
  if (!points.length) {
    return <p className={styles.emptyText}>Chưa có dữ liệu hoạt động.</p>;
  }

  const width = 640;
  const height = 220;
  const padding = { top: 14, right: 16, bottom: 32, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) =>
      CHART_SERIES.map((series) => point[series.key]),
    ),
  );
  const scale = 10 ** Math.floor(Math.log10(maxValue));
  const maxY = Math.max(scale, Math.ceil(maxValue / scale) * scale);
  const x = (index: number) =>
    padding.left +
    (points.length > 1 ? (index / (points.length - 1)) * chartWidth : chartWidth / 2);
  const y = (value: number) =>
    padding.top + chartHeight - (value / maxY) * chartHeight;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Biểu đồ hoạt động theo thời gian"
      >
        {[0, 0.5, 1].map((ratio) => {
          const gridY = padding.top + chartHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={gridY}
                x2={width - padding.right}
                y2={gridY}
                stroke="#e7eaf3"
              />
              <text
                x={padding.left - 8}
                y={gridY + 4}
                textAnchor="end"
                fontSize="11"
                fill="#8b98ad"
              >
                {Math.round(maxY * ratio)}
              </text>
            </g>
          );
        })}
        {CHART_SERIES.map((series) => {
          const path = points
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"} ${x(index)} ${y(point[series.key])}`,
            )
            .join(" ");
          return (
            <g key={series.key}>
              <path
                d={path}
                fill="none"
                stroke={series.color}
                strokeWidth="2.5"
              />
              {points.map((point, index) => (
                <circle
                  key={`${series.key}-${point.date}`}
                  cx={x(index)}
                  cy={y(point[series.key])}
                  r="3"
                  fill={series.color}
                />
              ))}
            </g>
          );
        })}
        {points.map((point, index) => (
          <text
            key={point.date}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="#667085"
          >
            {point.date}
          </text>
        ))}
      </svg>
      <div className={styles.chartLegend}>
        {CHART_SERIES.map((series) => (
          <span className={styles.chartLegendItem} key={series.key}>
            <span
              className={styles.chartSeriesDot}
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<"day" | "week">("day");
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    try {
      const response = await api.get("/auth/admin/dashboard", {
        params: { period },
      });
      setData(response.data);
    } catch (requestError) {
      console.error("Failed to load admin dashboard:", requestError);
      if (
        axios.isAxiosError(requestError) &&
        [401, 422].includes(requestError.response?.status ?? 0)
      ) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", {
          replace: true,
          state: { sessionExpired: true },
        });
        return;
      }
      setError("Không thể tải dữ liệu dashboard. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [navigate, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = data.stats;

  return (
    <div className={styles.page}>
      <AdminSidebar />
      <main className={`${styles.contentArea} ${styles.main}`}>
        <section className={styles.welcomeBanner}>
          <div>
            <h1 className={styles.welcomeTitle}>
              Dashboard {data.admin.name ? `- ${data.admin.name}` : ""}
            </h1>
            <p className={styles.welcomeSubtitle}>
              Tổng quan hoạt động và dữ liệu ClassBridge
            </p>
          </div>
        </section>

        {error && (
          <div className={styles.panel} role="alert">
            <p className={styles.emptyText}>
              {error}{" "}
              <button
                type="button"
                className={styles.viewAllLink}
                onClick={() => {
                  setError("");
                  setLoading(true);
                  loadData();
                }}
              >
                Thử lại
              </button>
            </p>
          </div>
        )}

        <section className={styles.statsGrid} aria-label="Chỉ số dashboard">
          <StatCard
            icon={LuUsersRound}
            iconClass={styles.statIconBlue}
            label="Tổng số tài khoản"
            value={stats.totalAccounts}
          />
          <StatCard
            icon={LuBookOpen}
            iconClass={styles.statIconOrange}
            label="Tổng số lớp học"
            value={stats.classes}
          />
          <StatCard
            icon={LuBookOpen}
            iconClass={styles.statIconGreen}
            label="Lớp đang hoạt động"
            value={stats.classesActive}
          />
          <StatCard
            icon={LuPlay}
            iconClass={styles.statIconPurple}
            label="Tổng số phiên học"
            value={stats.sessions}
          />
          <StatCard
            icon={LuPlay}
            iconClass={styles.statIconCyan}
            label="Phiên học đang diễn ra"
            value={stats.sessionsOngoing}
          />
          <StatCard
            icon={LuCircleHelp}
            iconClass={styles.statIconPink}
            label="Tổng số câu hỏi"
            value={stats.questions}
          />
          <StatCard
            icon={LuLayers}
            iconClass={styles.statIconOrange}
            label="Nhóm câu hỏi AI đã gom"
            value={stats.questionGroups}
          />
        </section>

        <section className={styles.dashboardGrid}>
          <AccountDistribution distribution={data.distribution} />

          <section className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <h2 className={styles.panelTitleRow}>
                <LuActivity size={17} className={styles.panelTitleIcon} />
                Biểu đồ hoạt động
              </h2>
              <div className={styles.periodSwitch} aria-label="Khoảng thời gian">
                <button
                  type="button"
                  className={period === "day" ? styles.periodActive : ""}
                  aria-pressed={period === "day"}
                  onClick={() => {
                    setError("");
                    setLoading(true);
                    setPeriod("day");
                  }}
                >
                  Ngày
                </button>
                <button
                  type="button"
                  className={period === "week" ? styles.periodActive : ""}
                  aria-pressed={period === "week"}
                  onClick={() => {
                    setError("");
                    setLoading(true);
                    setPeriod("week");
                  }}
                >
                  Tuần
                </button>
              </div>
            </div>
            {loading ? (
              <p className={styles.loadingText}>Đang tải biểu đồ...</p>
            ) : (
              <ActivityChart points={data.systemOverview} />
            )}
          </section>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeaderRow}>
            <h2 className={styles.panelTitleRow}>
              <LuClock size={17} className={styles.panelTitleIcon} />
              Hoạt động gần đây
            </h2>
          </div>
          {loading ? (
            <p className={styles.loadingText}>Đang tải hoạt động...</p>
          ) : data.activities.length === 0 ? (
            <p className={styles.emptyText}>Chưa có hoạt động nào được ghi nhận.</p>
          ) : (
            <div className={styles.activityList}>
              {data.activities.map((activity) => (
                <article className={styles.activityRow} key={activity.id}>
                  <span className={styles.activityDot} />
                  <div className={styles.activityBody}>
                    <p className={styles.activityTitle}>{activity.title}</p>
                    <p className={styles.activityDesc}>{activity.description}</p>
                  </div>
                  <span className={styles.activityActor}>{activity.actor}</span>
                  <time className={styles.activityTime}>
                    {new Date(activity.time).toLocaleString("vi-VN")}
                  </time>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
