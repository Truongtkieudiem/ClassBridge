import { useEffect, useState } from "react";
import { Calendar, ChevronDown, Download, Search, X } from "lucide-react";
import AdminSidebar from "./sidebar";
import styles from "./ghilog.module.css";
import api from "../../services/api";

type LogStatus = "Thành công" | "Thất bại" | "Đang chờ";

type ActivityLog = {
  id: string;
  time: string;
  user: string;
  fullName?: string;
  email: string;
  role: string;
  action: string;
  target: string;
  session: string;
  status: LogStatus;
  detail: string;
};

type LogsResponse = {
  items: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 8;

function statusClass(status: LogStatus) {
  switch (status) {
    case "Thành công":
      return styles.statusSuccess;
    case "Thất bại":
      return styles.statusError;
    case "Đang chờ":
      return styles.statusPending;
    default:
      return styles.statusSuccess;
  }
}

function formatLogTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

export default function AdminActivityLogsPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const minDateStr = "2000-01-01";
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchLogs = () => {
      setLoading(true);
      setError("");

      api
        .get<LogsResponse>("/auth/admin/logs", {
          params: {
            search,
            role,
            fromDate,
            toDate,
            page,
            pageSize: PAGE_SIZE,
          },
        })
        .then(({ data }) => {
          if (cancelled) return;
          setLogs(data.items ?? []);
          setTotal(data.total ?? 0);
          setTotalPages(Math.max(1, data.totalPages ?? 1));
        })
        .catch((requestError: unknown) => {
          if (cancelled) return;
          const message =
            typeof requestError === "object" && requestError !== null &&
            "response" in requestError
              ? (requestError as { response?: { data?: { message?: string } } })
                  .response?.data?.message
              : undefined;
          setError(message || "Không thể tải nhật ký hoạt động. Vui lòng thử lại.");
          setLogs([]);
          setTotal(0);
          setTotalPages(1);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    fetchLogs();
    const intervalId = window.setInterval(fetchLogs, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [fromDate, page, role, search, toDate]);

  function sanitizeDateInput(value: string, isFromDate: boolean) {
    if (!value) return "";
    if (value > todayStr) return todayStr;
    if (value < minDateStr) return minDateStr;

    if (isFromDate) {
      if (toDate && value > toDate) {
        setToDate(value);
      }
      return value;
    }

    if (fromDate && value < fromDate) {
      setFromDate(value);
    }
    return value;
  }

  function handleFromDateChange(value: string) {
    const safeValue = sanitizeDateInput(value, true);
    setFromDate(safeValue);
    setPage(1);
  }

  function handleToDateChange(value: string) {
    const safeValue = sanitizeDateInput(value, false);
    setToDate(safeValue);
    setPage(1);
  }

  function exportLogs() {
    const columns = ["Thời gian", "Họ và tên", "Vai trò", "Email", "Loại sự kiện", "Đối tượng", "Lớp/Session", "Kết quả", "Chi tiết"];
    const rows = logs.map((log) => [
      formatLogTime(log.time), log.user, log.role, log.email, log.action, log.target, log.session, log.status, log.detail,
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-logs-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className={styles.page}>
      <AdminSidebar />
      <main className={`${styles.contentArea} ${styles.main}`}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Activity Log</h1>
            <p className={styles.pageSubtitle}>
              Theo dõi hoạt động hệ thống và người dùng.
            </p>
          </div>
          <div className={styles.pageHeaderActions}>
            <button type="button" className={styles.secondaryButton} onClick={exportLogs} disabled={!logs.length}>
              <Download size={15} /> Export
            </button>
          </div>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.searchWrap}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Tìm kiếm nhật ký"
              aria-label="Tìm kiếm nhật ký"
            />
          </label>
          <div className={styles.filterGroup}>
            <div className={styles.filterSelect}>
              <select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }} aria-label="Chọn vai trò">
                <option value="all">Tất cả vai trò</option>
                <option value="ADMIN">Admin</option>
                <option value="LECTURER">Lecturer</option>
                <option value="STUDENT">Student</option>
              </select>
              <ChevronDown size={14} className={styles.selectChevron} />
            </div>
            <div className={styles.dateInputWrap}>
              <span className={styles.inputLabel}>Từ ngày</span>
              <Calendar size={15} className={styles.inputIcon} />
              <input
                type="date"
                value={fromDate}
                min={minDateStr}
                max={todayStr}
                onChange={(event) => handleFromDateChange(event.target.value)}
              />
            </div>
            <div className={styles.dateInputWrap}>
              <span className={styles.inputLabel}>Đến ngày</span>
              <Calendar size={15} className={styles.inputIcon} />
              <input
                type="date"
                value={toDate}
                min={minDateStr}
                max={todayStr}
                onChange={(event) => handleToDateChange(event.target.value)}
              />
            </div>
          </div>
        </div>

        <section className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>
                <th>Thời gian</th><th>Họ và tên</th><th>Vai trò</th><th>Loại sự kiện</th>
                <th>Đối tượng</th><th>Lớp/Session</th><th>Kết quả</th><th>Chi tiết</th>
              </tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className={styles.emptyState}>Đang tải nhật ký...</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className={styles.errorState}>{error}</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={8} className={styles.emptyState}>Chưa có dữ liệu nhật ký.</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatLogTime(log.time)}</td><td title={log.email}>{log.fullName || log.user}</td><td>{log.role}</td><td>{log.action}</td>
                    <td>{log.target}</td><td>{log.session || "—"}</td>
                    <td><span className={`${styles.statusBadge} ${statusClass(log.status)}`}>{log.status}</span></td>
                    <td><button type="button" className={styles.detailButton} onClick={() => setSelectedLog(log)}>Xem</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.footerBar}>
            <span>Hiển thị {from}–{to} trong tổng số {total} kết quả</span>
            <div className={styles.pagination}>
              <button type="button" className={styles.pageButton} disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} aria-label="Trang trước">‹</button>
              <span>Trang {page} / {totalPages}</span>
              <button type="button" className={styles.pageButton} disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} aria-label="Trang sau">›</button>
            </div>
          </div>
        </section>
      </main>

      {selectedLog && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLog(null); }}>
          <section className={styles.detailModal} role="dialog" aria-modal="true" aria-labelledby="log-detail-title">
            <header className={styles.detailModalHeader}>
              <h2 id="log-detail-title">Chi tiết hoạt động</h2>
              <button type="button" onClick={() => setSelectedLog(null)} aria-label="Đóng"><X size={18} /></button>
            </header>
            <dl className={styles.detailList}>
              <dt>Thời gian</dt><dd>{formatLogTime(selectedLog.time)}</dd>
              <dt>Người dùng</dt><dd>{selectedLog.fullName || selectedLog.user}</dd>
              <dt>Email</dt><dd>{selectedLog.email}</dd>
              <dt>Vai trò</dt><dd>{selectedLog.role}</dd>
              <dt>Loại sự kiện</dt><dd>{selectedLog.action}</dd>
              <dt>Đối tượng</dt><dd>{selectedLog.target}</dd>
              <dt>Lớp/Session</dt><dd>{selectedLog.session || "—"}</dd>
              <dt>Kết quả</dt><dd>{selectedLog.status}</dd>
              <dt>Mô tả</dt><dd>{selectedLog.detail}</dd>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
