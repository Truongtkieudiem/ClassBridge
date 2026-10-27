import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import styles from "./tuongtac.module.css";
import AdminSidebar from "./sidebar";
import {
  Users,
  UserCheck,
  GraduationCap,
  BookOpen,
  Calendar,
  Activity,
  MessageSquare,
  Search,
  BarChart2,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ChevronRight,
  X,
  Languages,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type DailyActivityPoint = {
  date: string;
  logins: number;
  questions: number;
};

type MonthlyTrendPoint = {
  month: string;
  liveSubtitles: number;
  aiQnaGroup: number;
};

type QaStatusPoint = {
  name: string;
  value: number;
  color: string;
};

type EngagementOverview = {
  totalAccounts: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  activeStudents: number;
  activeLecturers: number;
  totalClasses: number;
  completedSessions: number;
  overallActiveRate: number;
};

type EngagementFeatures = {
  subtitleViews: number;
  questionsSent: number;
  answerViews: number;
  groupsAnswered: number;
  groupsTotal: number;
  answeredPercent: number;
  pendingPercent: number;
};

type EngagementResponse = {
  overview: EngagementOverview;
  dailyActivity: DailyActivityPoint[];
  monthlyTrends: MonthlyTrendPoint[];
  qaStatus: QaStatusPoint[];
  features: EngagementFeatures;
};

const EMPTY_OVERVIEW: EngagementOverview = {
  totalAccounts: 0,
  activeToday: 0,
  activeThisWeek: 0,
  activeThisMonth: 0,
  activeStudents: 0,
  activeLecturers: 0,
  totalClasses: 0,
  completedSessions: 0,
  overallActiveRate: 0,
};

const EMPTY_FEATURES: EngagementFeatures = {
  subtitleViews: 0,
  questionsSent: 0,
  answerViews: 0,
  groupsAnswered: 0,
  groupsTotal: 0,
  answeredPercent: 0,
  pendingPercent: 0,
};

const ROLE_FILTERS = ["All", "Student", "Lecturer"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

const ROLE_FILTER_LABELS: Record<RoleFilter, string> = {
  All: "Tất cả",
  Student: "Sinh viên",
  Lecturer: "Giảng viên",
};

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  role: "Student" | "Lecturer" | "Admin";
  className?: string;
  joinedSessions: number;
  questionsSent: number;
  aiGroupsAnswered?: number;
  sessionsHosted?: number;
  lastActive: string;
  subtitleUsageCount: number;
  answerViewsCount: number;
  activityHistory: { date: string; actions: number }[];
  enrolledClassesList: { code: string; name: string; attendanceRate: number }[];
}

export default function TuongTacAdminPage() {
  const [overview, setOverview] = useState<EngagementOverview>(EMPTY_OVERVIEW);
  const [dailyData, setDailyData] = useState<DailyActivityPoint[]>([]);
  const [trendData, setTrendData] = useState<MonthlyTrendPoint[]>([]);
  const [qaStatusData, setQaStatusData] = useState<QaStatusPoint[]>([]);
  const [features, setFeatures] = useState<EngagementFeatures>(EMPTY_FEATURES);
  const [accounts, setAccounts] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [selectedUser, setSelectedUser] = useState<AccountUser | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEngagement() {
      setLoading(true);
      setError(null);
      try {
        const [overviewResponse, accountsResponse] = await Promise.all([
          api.get<EngagementResponse>("/auth/admin/engagement/overview", {
            signal: controller.signal,
          }),
          api.get<{ accounts: AccountUser[] }>(
            "/auth/admin/engagement/accounts",
            {
              signal: controller.signal,
            },
          ),
        ]);
        setOverview(overviewResponse.data.overview);
        setDailyData(overviewResponse.data.dailyActivity);
        setTrendData(overviewResponse.data.monthlyTrends);
        setQaStatusData(overviewResponse.data.qaStatus);
        setFeatures(overviewResponse.data.features);
        setAccounts(accountsResponse.data.accounts);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load engagement data:", loadError);
        setError("Không thể tải dữ liệu tương tác. Vui lòng thử lại.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadEngagement();
    return () => controller.abort();
  }, [reloadToken]);

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return accounts.filter((user) => {
      const matchSearch =
        !keyword ||
        user.name.toLowerCase().includes(keyword) ||
        user.email.toLowerCase().includes(keyword);
      const matchRole = roleFilter === "All" || user.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [accounts, searchTerm, roleFilter]);

  useEffect(() => {
    if (!selectedUser) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedUser(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedUser]);

  const currentMonthLabel = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `Tháng này: ${month}/${now.getFullYear()}`;
  }, []);

  const displayValue = (value: string | number) =>
    loading || error ? "—" : value;

  function handleRetry() {
    setReloadToken((token) => token + 1);
  }

  return (
    <div className={styles.page}>
      <AdminSidebar />

      <main className={`${styles.contentArea} ${styles.main}`}>
        <div className={styles.container}>
          {/* HEADER */}
          <header className={styles.header}>
            <div className={styles.headerTitleWrapper}>
              <Activity className={styles.headerIcon} aria-hidden="true" />
              <div>
                <h1 className={styles.title}>
                  Thống kê &amp; Mức độ tương tác
                </h1>
                <p className={styles.subtitle}>
                  Báo cáo chi tiết hoạt động hệ thống ClassBridge
                </p>
              </div>
            </div>
            <div className={styles.dateFilterBadge}>
              <Calendar size={16} aria-hidden="true" />
              <span>{currentMonthLabel}</span>
            </div>
          </header>

          {error && (
            <div className={styles.errorBanner} role="alert">
              <span>{error}</span>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={handleRetry}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* SECTION 1: TỔNG QUAN */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <BarChart2 className={styles.sectionIcon} aria-hidden="true" />
              1. Tổng quan mức độ tương tác
            </h2>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricCardHeader}>
                  <div>
                    <p className={styles.metricLabel}>Tài khoản đăng ký</p>
                    <div className={styles.metricValue}>
                      {displayValue(overview.totalAccounts.toLocaleString())}
                    </div>
                  </div>
                  <div
                    className={`${styles.metricIconBox} ${styles.metricIconBoxPrimary}`}
                  >
                    <Users size={20} aria-hidden="true" />
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.trendUp}>
                    <ArrowUpRight size={14} aria-hidden="true" />
                    {displayValue(overview.activeToday)}
                  </span>
                  <span>tài khoản hoạt động hôm nay</span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricCardHeader}>
                  <div>
                    <p className={styles.metricLabel}>Tỷ lệ hoạt động</p>
                    <div className={styles.metricValue}>
                      {displayValue(overview.overallActiveRate)}%
                    </div>
                  </div>
                  <div
                    className={`${styles.metricIconBox} ${styles.metricIconBoxSuccess}`}
                  >
                    <UserCheck size={20} aria-hidden="true" />
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span className={styles.highlightText}>
                    {displayValue(overview.activeThisMonth)}
                  </span>{" "}
                  tài khoản đã tương tác
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricCardHeader}>
                  <div>
                    <p className={styles.metricLabel}>Tài khoản đang hoạt động</p>
                    <div className={styles.metricValue}>
                      {displayValue(
                        overview.activeStudents + overview.activeLecturers,
                      )}
                    </div>
                  </div>
                  <div
                    className={`${styles.metricIconBox} ${styles.metricIconBoxWarning}`}
                  >
                    <GraduationCap size={20} aria-hidden="true" />
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span>
                    {displayValue(overview.activeStudents)} SV |{" "}
                    {displayValue(overview.activeLecturers)} GV
                  </span>
                </div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricCardHeader}>
                  <div>
                    <p className={styles.metricLabel}>Buổi học hoàn thành</p>
                    <div className={styles.metricValue}>
                      {displayValue(overview.completedSessions)}
                    </div>
                  </div>
                  <div
                    className={`${styles.metricIconBox} ${styles.metricIconBoxInfo}`}
                  >
                    <BookOpen size={20} aria-hidden="true" />
                  </div>
                </div>
                <div className={styles.metricFooter}>
                  <span>
                    Thuộc {displayValue(overview.totalClasses)} lớp học đang chạy
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.timeframeSummaryGrid}>
              <div className={styles.timeframeCard}>
                <span className={styles.timeframeLabel}>
                  Hoạt động trong ngày:
                </span>
                <span className={styles.timeframeValue}>
                  {displayValue(overview.activeToday)} tài khoản
                </span>
              </div>
              <div className={styles.timeframeCard}>
                <span className={styles.timeframeLabel}>
                  Hoạt động trong tuần:
                </span>
                <span className={styles.timeframeValue}>
                  {displayValue(overview.activeThisWeek)} tài khoản
                </span>
              </div>
              <div className={styles.timeframeCard}>
                <span className={styles.timeframeLabel}>
                  Hoạt động trong tháng:
                </span>
                <span className={styles.timeframeValue}>
                  {displayValue(overview.activeThisMonth)} tài khoản
                </span>
              </div>
            </div>
          </section>

          {/* SECTION 2: BIỂU ĐỒ HOẠT ĐỘNG */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <TrendingUp className={styles.sectionIcon} aria-hidden="true" />
              2. Biểu đồ hoạt động theo thời gian
            </h2>
            <div className={styles.chartsGrid}>
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.chartTitle}>
                    Đăng nhập &amp; Câu hỏi theo ngày
                  </h3>
                  <span className={styles.chartTag}>7 ngày gần nhất</span>
                </div>
                <div className={styles.chartContainer}>
                  {loading ? (
                    <p className={styles.loadingText}>Đang tải biểu đồ...</p>
                  ) : dailyData.length === 0 ? (
                    <p className={styles.loadingText}>
                      Chưa có dữ liệu hoạt động theo ngày.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={dailyData}
                        margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E2E8F0"
                        />
                        <XAxis dataKey="date" stroke="#64748B" fontSize={12} />
                        <YAxis stroke="#64748B" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            color: "#fff",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="logins"
                          name="Đăng nhập"
                          stroke="#3B82F6"
                          strokeWidth={2.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="questions"
                          name="Câu hỏi gửi"
                          stroke="#10B981"
                          strokeWidth={2.5}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <h3 className={styles.chartTitle}>
                    Xu hướng tính năng ClassBridge
                  </h3>
                  <span className={styles.chartTag}>Theo tháng</span>
                </div>
                <div className={styles.chartContainer}>
                  {loading ? (
                    <p className={styles.loadingText}>Đang tải biểu đồ...</p>
                  ) : trendData.length === 0 ? (
                    <p className={styles.loadingText}>
                      Chưa có dữ liệu xu hướng theo tháng.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={trendData}
                        margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#E2E8F0"
                        />
                        <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
                        <YAxis stroke="#64748B" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            color: "#F8FAFC",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="liveSubtitles"
                          name="Phụ đề song ngữ"
                          fill="#8B5CF6"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="aiQnaGroup"
                          name="AI gom nhóm Q&A"
                          fill="#F59E0B"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 & 4: TƯƠNG TÁC SINH VIÊN & GIẢNG VIÊN */}
          <div className={styles.splitGrid}>
            <div className={styles.engagementCard}>
              <h3 className={styles.engagementHeader}>
                <GraduationCap
                  size={20}
                  className={styles.iconInfo}
                  aria-hidden="true"
                />
                3. Mức độ tương tác của sinh viên
              </h3>
              <div className={styles.subMetricsGrid}>
                <div
                  className={`${styles.subMetricBox} ${styles.subMetricBoxPurple}`}
                >
                  <div
                    className={`${styles.subMetricBoxTitle} ${styles.subMetricBoxTitlePurple}`}
                  >
                    <Languages size={16} aria-hidden="true" /> Phụ đề song ngữ
                  </div>
                  <div className={styles.subMetricBoxValue}>
                    {displayValue(features.subtitleViews.toLocaleString())} lượt
                  </div>
                  <div className={styles.subMetricBoxDesc}>
                    Tổng lượt dùng phụ đề song ngữ trong hệ thống
                  </div>
                </div>
                <div
                  className={`${styles.subMetricBox} ${styles.subMetricBoxPrimary}`}
                >
                  <div
                    className={`${styles.subMetricBoxTitle} ${styles.subMetricBoxTitlePrimary}`}
                  >
                    <MessageSquare size={16} aria-hidden="true" /> Câu hỏi gửi
                  </div>
                  <div className={styles.subMetricBoxValue}>
                    {displayValue(features.questionsSent.toLocaleString())} câu
                  </div>
                  <div className={styles.subMetricBoxDesc}>
                    Tổng câu hỏi sinh viên đã gửi
                  </div>
                </div>
              </div>
              <div className={styles.dataList}>
                <div className={styles.dataListItem}>
                  <span>Tỷ lệ SV tham gia lớp học có hoạt động:</span>
                  <span className={styles.highlightText}>
                    {displayValue(overview.overallActiveRate)}%
                  </span>
                </div>
                <div className={styles.dataListItem}>
                  <span>Lượt xem lại câu trả lời bài giảng:</span>
                  <span className={styles.highlightText}>
                    {displayValue(features.answerViews.toLocaleString())} lượt
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.engagementCard}>
              <h3 className={styles.engagementHeader}>
                <UserCheck
                  size={20}
                  className={styles.iconSuccess}
                  aria-hidden="true"
                />
                4. Mức độ sử dụng của giảng viên
              </h3>
              <div className={styles.pieChartFlex}>
                <div>
                  <p className={styles.subMetricBoxDesc}>
                    Tỷ lệ câu hỏi đã được phản hồi
                  </p>
                  <h4 className={styles.pieValue}>
                    {displayValue(features.answeredPercent)}%
                  </h4>
                  <p className={styles.subMetricBoxDesc}>
                    {displayValue(features.pendingPercent)}% đang chờ xử lý
                  </p>
                </div>
                <div className={styles.pieChartContainer}>
                  {loading ? (
                    <p className={styles.chartPlaceholder}>Đang tải…</p>
                  ) : qaStatusData.length === 0 ? (
                    <p className={styles.chartPlaceholder}>Chưa có dữ liệu</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={qaStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={40}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {qaStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className={styles.dataList}>
                <div className={styles.dataListItem}>
                  <span>Số câu hỏi AI đã gom nhóm:</span>
                  <span className={styles.highlightText}>
                    {displayValue(features.groupsTotal.toLocaleString())} nhóm
                  </span>
                </div>
                <div className={styles.dataListItem}>
                  <span>Số nhóm câu hỏi GV đã giải đáp:</span>
                  <span className={styles.highlightText}>
                    {displayValue(features.groupsAnswered.toLocaleString())}{" "}
                    nhóm
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: ACCOUNT TABLE */}
          <section className={styles.tableCard}>
            <div className={styles.tableHeaderBar}>
              <div>
                <h2 className={styles.sectionTitle}>
                  <Users className={styles.sectionIcon} aria-hidden="true" />
                  5. Danh sách &amp; Chi tiết hoạt động tài khoản
                </h2>
                <p className={styles.subtitle}>
                  Nhấn vào một tài khoản để xem chi tiết thống kê.
                </p>
              </div>

              <div className={styles.filterGroup}>
                <div className={styles.searchBox}>
                  <Search className={styles.searchIcon} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Tìm tên, email..."
                    aria-label="Tìm tài khoản theo tên hoặc email"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                <div
                  className={styles.roleFilterContainer}
                  role="group"
                  aria-label="Lọc theo vai trò"
                >
                  {ROLE_FILTERS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleFilter(role)}
                      aria-pressed={roleFilter === role}
                      className={`${styles.roleBtn} ${
                        roleFilter === role ? styles.roleBtnActive : ""
                      }`}
                    >
                      {ROLE_FILTER_LABELS[role]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.tableResponsive}>
              <table
                className={styles.dataTable}
                aria-label="Danh sách tài khoản và mức độ hoạt động"
                aria-busy={loading}
              >
                <thead>
                  <tr>
                    <th scope="col">Tài khoản</th>
                    <th scope="col">Vai trò</th>
                    <th scope="col">Buổi học tham gia</th>
                    <th scope="col">Câu hỏi / Hoạt động</th>
                    <th scope="col">Hoạt động gần nhất</th>
                    <th scope="col" className={styles.alignRight}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className={styles.tableRow}
                    >
                      <td>
                        <div className={styles.userName}>{user.name}</div>
                        <div className={styles.userEmail}>{user.email}</div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            user.role === "Lecturer"
                              ? styles.badgeLecturer
                              : styles.badgeStudent
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td>
                        {user.role === "Lecturer"
                          ? `${user.sessionsHosted || 0} buổi tổ chức`
                          : `${user.joinedSessions} buổi`}
                      </td>
                      <td>
                        {user.role === "Lecturer"
                          ? `${user.aiGroupsAnswered || 0} nhóm đã trả lời`
                          : `${user.questionsSent} câu hỏi gửi`}
                      </td>
                      <td>
                        <div className={styles.lastActiveCell}>
                          <Clock
                            size={12}
                            className={styles.iconMuted}
                            aria-hidden="true"
                          />
                          {user.lastActive}
                        </div>
                      </td>
                      <td className={styles.alignRight}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          aria-label={`Xem chi tiết hoạt động của ${user.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedUser(user);
                          }}
                        >
                          Chi tiết
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className={styles.emptyCell}>
                        {loading
                          ? "Đang tải danh sách tài khoản..."
                          : accounts.length === 0
                            ? "Chưa có tài khoản nào trong hệ thống."
                            : "Không tìm thấy tài khoản phù hợp."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* MODAL / DRAWER CHI TIẾT */}
      {selectedUser && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className={styles.drawerContainer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="engagement-drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerBody}>
              <div className={styles.drawerHeader}>
                <div className={styles.userInfoHeader}>
                  <div className={styles.avatar} aria-hidden="true">
                    {selectedUser.name.charAt(0)}
                  </div>
                  <div>
                    <h3
                      id="engagement-drawer-title"
                      className={`${styles.title} ${styles.drawerTitle}`}
                    >
                      {selectedUser.name}
                    </h3>
                    <p className={styles.subtitle}>{selectedUser.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className={styles.closeBtn}
                  aria-label="Đóng chi tiết tài khoản"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoBox}>
                  <span className={styles.infoBoxLabel}>Vai trò</span>
                  <div className={styles.infoBoxValue}>{selectedUser.role}</div>
                </div>
                <div className={styles.infoBox}>
                  <span className={styles.infoBoxLabel}>
                    Hoạt động gần nhất
                  </span>
                  <div className={styles.infoBoxValue}>
                    {selectedUser.lastActive}
                  </div>
                </div>
              </div>

              <div className={styles.drawerChartCard}>
                <h4
                  className={`${styles.chartTitle} ${styles.drawerSectionTitle}`}
                >
                  Tần suất tương tác gần đây
                </h4>
                <div className={styles.drawerChartBox}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedUser.activityHistory}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#CBD5E1"
                      />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar
                        dataKey="actions"
                        name="Tương tác"
                        fill="#6366F1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h4
                  className={`${styles.chartTitle} ${styles.drawerSectionTitle}`}
                >
                  Tính năng sử dụng
                </h4>
                <div className={styles.featureStatsGrid}>
                  <div className={styles.featureStatItem}>
                    <span>Lượt xem phụ đề:</span>
                    <strong className={styles.featureStatValue}>
                      {selectedUser.subtitleUsageCount}
                    </strong>
                  </div>
                  <div className={styles.featureStatItem}>
                    <span>Lượt xem câu trả lời:</span>
                    <strong className={styles.featureStatValue}>
                      {selectedUser.answerViewsCount}
                    </strong>
                  </div>
                </div>
              </div>

              <div>
                <h4
                  className={`${styles.chartTitle} ${styles.drawerSectionTitle}`}
                >
                  Lớp học &amp; Chuyên cần
                </h4>
                <div className={styles.classList}>
                  {selectedUser.enrolledClassesList.map((cls) => (
                    <div key={cls.code} className={styles.classListItem}>
                      <span>
                        <strong>{cls.code}</strong> - {cls.name}
                      </span>
                      <span
                        className={`${styles.badge} ${styles.badgeLecturer}`}
                      >
                        {cls.attendanceRate}% Chuyên cần
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.drawerFooter}>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className={styles.closeDrawerBtn}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
