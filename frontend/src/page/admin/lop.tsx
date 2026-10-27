import { useEffect, useRef, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AdminSidebar from "./sidebar";
import styles from "./lop.module.css";
import api from "../../services/api";

type ClassItem = {
  id: string;
  code: string;
  name: string;
  teacher: string;
  lecturerId: string;
  size: number;
  hours: number;
  room: string;
  time: string;
};

type ClassListResponse = {
  items: ClassItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  classes: Array<{ id: string; label: string }>;
  lecturers: Array<{ id: string; name: string }>;
  rooms: string[];
  times: Array<{ value: string; label: string }>;
};

type WeeklySchedule = {
  weekday: string;
  time: string;
};

type ClassForm = {
  lecturerId: string;
  className: string;
  classCode: string;
  hours: string;
  classDate: string;
  weeklySchedules: WeeklySchedule[];
  roomName: string;
};

type ClassImportRow = Omit<ClassForm, "lecturerId" | "weeklySchedules"> & {
  lecturerName: string;
  classWeekday: string;
  classTime: string;
};

const PAGE_SIZE = 7;
const WEEK_DAYS = [
  { value: "MO", label: "Thứ 2" },
  { value: "TU", label: "Thứ 3" },
  { value: "WE", label: "Thứ 4" },
  { value: "TH", label: "Thứ 5" },
  { value: "FR", label: "Thứ 6" },
  { value: "SA", label: "Thứ 7" },
  { value: "SU", label: "Chủ nhật" },
];
const CLASS_IMPORT_COLUMNS = [
  {
    key: "lecturerName",
    label: "Tên giảng viên",
    aliases: ["ten giang vien", "giang vien", "lecturer", "lecturer name", "teacher"],
  },
  {
    key: "className",
    label: "Tên lớp",
    aliases: ["ten lop", "class name", "classname"],
  },
  {
    key: "classCode",
    label: "Mã lớp",
    aliases: ["ma lop", "class code", "classcode", "code"],
  },
  {
    key: "hours",
    label: "Số giờ",
    aliases: ["so gio", "hours", "duration"],
  },
  {
    key: "classDate",
    label: "Ngày học",
    aliases: ["ngay hoc", "ngay", "date", "class date"],
  },
  {
    key: "classWeekday",
    label: "Thứ trong tuần",
    aliases: ["thu trong tuan", "thu hoc", "weekday", "day of week", "week day"],
  },
  {
    key: "classTime",
    label: "Giờ học",
    aliases: ["gio hoc", "gio", "time", "class time", "start time"],
  },
  {
    key: "roomName",
    label: "Phòng học",
    aliases: ["phong hoc", "phong", "room", "room name"],
  },
] as const;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeImportDate(value: unknown) {
  const raw = String(value ?? "").trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localMatch) {
    return `${localMatch[3]}-${localMatch[2].padStart(2, "0")}-${localMatch[1].padStart(2, "0")}`;
  }
  const serialDate = Number(raw);
  if (Number.isFinite(serialDate) && serialDate > 0) {
    const parsed = XLSX.SSF.parse_date_code(serialDate);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return raw;
}

function normalizeImportTime(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const directMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (directMatch) {
    return `${directMatch[1].padStart(2, "0")}:${directMatch[2]}`;
  }
  const amPmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (amPmMatch) {
    const suffix = amPmMatch[3].toUpperCase();
    let hour = Number(amPmMatch[1]) % 12;
    if (suffix === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${amPmMatch[2]}`;
  }
  const serialTime = Number(raw);
  if (Number.isFinite(serialTime) && serialTime >= 0 && serialTime < 1) {
    const totalMinutes = Math.round(serialTime * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  return raw;
}

function normalizeImportWeekday(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const day = normalizeHeader(value);
  const aliases: Record<string, string> = {
    mo: "MO", monday: "MO", thu2: "MO", t2: "MO",
    tu: "TU", tuesday: "TU", thu3: "TU", t3: "TU",
    we: "WE", wednesday: "WE", thu4: "WE", t4: "WE",
    th: "TH", thursday: "TH", thu5: "TH", t5: "TH",
    fr: "FR", friday: "FR", thu6: "FR", t6: "FR",
    sa: "SA", saturday: "SA", thu7: "SA", t7: "SA",
    su: "SU", sunday: "SU", chunhat: "SU", cn: "SU",
  };
  return aliases[day] || "INVALID";
}

function importCellValue(row: Record<string, unknown>, aliases: readonly string[]) {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const matchingKey = Object.keys(row).find((key) =>
    aliasSet.has(normalizeHeader(key)),
  );
  return matchingKey === undefined ? "" : String(row[matchingKey] ?? "").trim();
}

function getImportRows(file: File): Promise<ClassImportRow[]> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("File Excel không có sheet dữ liệu.");

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      firstSheet,
      { defval: "", raw: false },
    );
    if (!rawRows.length) throw new Error("File Excel chưa có dòng dữ liệu.");

    const headers = new Set(Object.keys(rawRows[0]).map(normalizeHeader));
    const missingColumns = CLASS_IMPORT_COLUMNS.filter(
      (column) => column.key !== "classWeekday",
    ).filter(
      (column) => !column.aliases.some((alias) => headers.has(normalizeHeader(alias))),
    ).map((column) => column.label);
    if (missingColumns.length) {
      throw new Error(
        `File thiếu cột bắt buộc: ${missingColumns.join(", ")}.`,
      );
    }
    if (rawRows.length > 500) {
      throw new Error("Mỗi lần chỉ có thể import tối đa 500 lớp.");
    }

    return rawRows.map((row) => ({
      lecturerName: importCellValue(row, CLASS_IMPORT_COLUMNS[0].aliases),
      className: importCellValue(row, CLASS_IMPORT_COLUMNS[1].aliases),
      classCode: importCellValue(row, CLASS_IMPORT_COLUMNS[2].aliases),
      hours: importCellValue(row, CLASS_IMPORT_COLUMNS[3].aliases).replace(",", "."),
      classDate: normalizeImportDate(
        importCellValue(row, CLASS_IMPORT_COLUMNS[4].aliases),
      ),
      classWeekday: normalizeImportWeekday(
        importCellValue(row, CLASS_IMPORT_COLUMNS[5].aliases),
      ),
      classTime: normalizeImportTime(
        importCellValue(row, CLASS_IMPORT_COLUMNS[6].aliases),
      ),
      roomName: importCellValue(row, CLASS_IMPORT_COLUMNS[7].aliases),
    }));
  });
}

export default function AdminClassPage() {
  const [items, setItems] = useState<ClassItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [classes, setClasses] = useState<ClassListResponse["classes"]>([]);
  const [lecturers, setLecturers] = useState<ClassListResponse["lecturers"]>([]);
  const [rooms, setRooms] = useState<string[]>([]);
  const [times, setTimes] = useState<ClassListResponse["times"]>([]);
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [lecturerId, setLecturerId] = useState("");
  const [room, setRoom] = useState("");
  const [time, setTime] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ClassForm>({
    lecturerId: "",
    className: "",
    classCode: "",
    hours: "",
    classDate: todayLocalDate(),
    weeklySchedules: [{ weekday: "", time: "" }],
    roomName: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadClasses() {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get<ClassListResponse>(
          "/auth/admin/classes",
          {
            params: {
              search,
              classId,
              lecturerId,
              room,
              time,
              page,
              pageSize: PAGE_SIZE,
            },
            signal: controller.signal,
          },
        );
        setItems(response.data.items);
        setTotal(response.data.total);
        setTotalPages(Math.max(1, response.data.totalPages));
        setClasses(response.data.classes);
        setLecturers(response.data.lecturers);
        setRooms(response.data.rooms);
        setTimes(response.data.times);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load class list:", loadError);
        setItems([]);
        setTotal(0);
        setError(
          axios.isAxiosError<{ message?: string }>(loadError)
            ? loadError.response?.data?.message ||
                "Không thể tải danh sách lớp. Vui lòng thử lại."
            : loadError instanceof Error
              ? loadError.message
              : "Không thể tải danh sách lớp. Vui lòng thử lại.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadClasses();
    return () => controller.abort();
  }, [search, classId, lecturerId, room, time, page, refreshKey]);

  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, total);

  function openManualForm() {
    setAddMenuOpen(false);
    setFormError(null);
    setImportMessage(null);
    setForm({
      lecturerId: "",
      className: "",
      classCode: "",
      hours: "",
      classDate: todayLocalDate(),
      weeklySchedules: [{ weekday: "", time: "" }],
      roomName: "",
    });
    setFormOpen(true);
  }

  async function submitManualClass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.post("/auth/admin/classes", form);
      setFormOpen(false);
      setRefreshKey((key) => key + 1);
      setImportMessage("Đã thêm lớp học thành công.");
    } catch (submitError) {
      console.error("Failed to create class:", submitError);
      setFormError(
        axios.isAxiosError<{ message?: string }>(submitError)
          ? submitError.response?.data?.message || "Không thể thêm lớp học."
          : submitError instanceof Error
            ? submitError.message
            : "Không thể thêm lớp học.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function importClasses(file: File | null) {
    if (!file) return;
    setAddMenuOpen(false);
    setImportMessage(null);
    if (file.size > 10 * 1024 * 1024) {
      setImportMessage("File không được vượt quá 10 MB.");
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".xlsx", ".xls", ".csv"].includes(extension)) {
      setImportMessage("Chỉ hỗ trợ file .xlsx, .xls hoặc .csv.");
      return;
    }

    setImporting(true);
    try {
      const rows = await getImportRows(file);
      let createdCount = 0;
      const rowErrors: string[] = [];

      type ImportGroup = {
        row: ClassImportRow;
        schedules: WeeklySchedule[];
        oneTimeRows: number;
        rowNumbers: number[];
        invalid: boolean;
      };
      const groups = new Map<string, ImportGroup>();
      const invalidateGroup = (row: ClassImportRow, lineNumber: number) => {
        const key = row.classCode.trim().toLocaleLowerCase();
        if (!key) return;
        const group = groups.get(key);
        if (group) {
          group.invalid = true;
          group.rowNumbers.push(lineNumber);
        } else {
          groups.set(key, {
            row,
            schedules: [],
            oneTimeRows: 0,
            rowNumbers: [lineNumber],
            invalid: true,
          });
        }
      };

      for (const [index, row] of rows.entries()) {
        const missingField = [
          ["Tên giảng viên", row.lecturerName],
          ["Tên lớp", row.className],
          ["Mã lớp", row.classCode],
          ["Số giờ", row.hours],
          ["Ngày học", row.classDate],
          ["Giờ học", row.classTime],
          ["Phòng học", row.roomName],
        ].find(([, value]) => !value);
        if (missingField) {
          rowErrors.push(`Dòng ${index + 2}: thiếu ${missingField[0]}.`);
          invalidateGroup(row, index + 2);
          continue;
        }
        if (row.classWeekday === "INVALID") {
          rowErrors.push(`Dòng ${index + 2}: thứ trong tuần không hợp lệ.`);
          invalidateGroup(row, index + 2);
          continue;
        }

        const key = row.classCode.trim().toLocaleLowerCase();
        let group = groups.get(key);
        if (!group) {
          group = {
            row,
            schedules: [],
            oneTimeRows: 0,
            rowNumbers: [],
            invalid: false,
          };
          groups.set(key, group);
        } else {
          const sameClassDetails =
            group.row.lecturerName.trim().toLocaleLowerCase() === row.lecturerName.trim().toLocaleLowerCase() &&
            group.row.className.trim().toLocaleLowerCase() === row.className.trim().toLocaleLowerCase() &&
            group.row.hours === row.hours &&
            group.row.classDate === row.classDate &&
            group.row.roomName.trim().toLocaleLowerCase() === row.roomName.trim().toLocaleLowerCase();
          if (!sameClassDetails) {
            group.invalid = true;
            rowErrors.push(`Dòng ${index + 2}: thông tin mã lớp ${row.classCode} không đồng nhất giữa các buổi.`);
            continue;
          }
        }

        group.rowNumbers.push(index + 2);
        if (row.classWeekday) {
          group.schedules.push({ weekday: row.classWeekday, time: row.classTime });
        } else {
          group.oneTimeRows += 1;
        }
      }

      for (const group of groups.values()) {
        if (group.invalid) continue;
        const firstLine = group.rowNumbers[0];
        if (group.schedules.length && group.oneTimeRows) {
          rowErrors.push(`Dòng ${firstLine}: không thể trộn lịch theo tuần với lịch ngày đơn cho cùng một lớp.`);
          continue;
        }
        if (group.schedules.length > 21) {
          rowErrors.push(`Dòng ${firstLine}: một lớp chỉ được có tối đa 21 buổi mỗi tuần.`);
          continue;
        }
        if (group.oneTimeRows > 1) {
          rowErrors.push(`Dòng ${firstLine}: các dòng trùng mã lớp cần có thứ trong tuần để gộp lịch.`);
          continue;
        }
        const scheduleKeys = group.schedules.map((item) => `${item.weekday}-${item.time}`);
        if (new Set(scheduleKeys).size !== scheduleKeys.length) {
          rowErrors.push(`Dòng ${firstLine}: lớp có buổi học bị trùng thứ và giờ.`);
          continue;
        }

        const { classWeekday: _classWeekday, classTime: _classTime, ...classData } = group.row;
        const payload = group.schedules.length
          ? { ...classData, weeklySchedules: group.schedules }
          : group.row;
        try {
          await api.post("/auth/admin/classes", payload);
          createdCount += 1;
        } catch (rowError) {
          const message = axios.isAxiosError<{ message?: string }>(rowError)
            ? rowError.response?.data?.message || "Không thể thêm lớp."
            : "Không thể thêm lớp.";
          rowErrors.push(`Dòng ${firstLine}: ${message}`);
        }
      }

      if (createdCount > 0) setRefreshKey((key) => key + 1);
      const summary = createdCount
        ? `Đã thêm ${createdCount} lớp.`
        : "Không có lớp nào được thêm.";
      setImportMessage(
        rowErrors.length
          ? `${summary} ${rowErrors.slice(0, 5).join(" ")}${
              rowErrors.length > 5
                ? ` Còn ${rowErrors.length - 5} lỗi khác.`
                : ""
            }`
          : summary,
      );
    } catch (importError) {
      console.error("Failed to import class spreadsheet:", importError);
      setImportMessage(
        importError instanceof Error
          ? importError.message
          : "Không thể đọc file Excel.",
      );
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function downloadExcelTemplate() {
    const worksheet = XLSX.utils.aoa_to_sheet([
      CLASS_IMPORT_COLUMNS.map((column) => column.label),
    ]);
    const instructions = XLSX.utils.aoa_to_sheet([
      ["Hướng dẫn nhập lịch học"],
      ["Mỗi dòng trong sheet Danh sách lớp tương ứng với một buổi học hằng tuần."],
      ["Nếu lớp có nhiều buổi, lặp lại thông tin lớp và nhập Thứ trong tuần cùng Giờ học cho từng dòng."],
      ["Các dòng có cùng Mã lớp sẽ được gộp thành một lớp với nhiều buổi học."],
      ["Thứ có thể nhập dạng Thứ 2, Thứ 3, ... Chủ nhật hoặc Monday, Tuesday, ... Sunday."],
      ["Ngày học là ngày bắt đầu áp dụng; thời lượng là số giờ của mỗi buổi."],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách lớp");
    XLSX.utils.book_append_sheet(workbook, instructions, "Hướng dẫn");
    XLSX.writeFile(workbook, "mau-import-danh-sach-lop.xlsx");
    setAddMenuOpen(false);
  }

  return (
    <div className={styles.page}>
      <AdminSidebar />

      <div className={styles.contentArea}>
        <main className={styles.main}>
          {importMessage && (
            <div className={styles.importMessage} role="status">
              <span>{importMessage}</span>
              <button
                type="button"
                onClick={() => setImportMessage(null)}
                aria-label="Đóng thông báo"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <header className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Quản lý danh sách lớp</h1>
              <p className={styles.pageSubtitle}>
                Quản lý thông tin, giảng viên và trạng thái các lớp học.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button type="button" className={styles.exportButton}>
                <Download size={16} />
                Export
              </button>
              <div className={styles.addMenuWrap}>
                <button
                  type="button"
                  className={styles.addButton}
                  aria-label="Thêm lớp"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  disabled={saving || importing}
                  onClick={() => setAddMenuOpen((open) => !open)}
                >
                  <Plus size={20} />
                </button>
                {addMenuOpen && (
                  <div className={styles.addMenu} role="menu">
                    <button
                      type="button"
                      className={styles.addMenuItem}
                      role="menuitem"
                      onClick={openManualForm}
                    >
                      <Plus size={15} />
                      Thêm thủ công
                    </button>
                    <button
                      type="button"
                      className={styles.addMenuItem}
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        importInputRef.current?.click();
                      }}
                      disabled={importing}
                    >
                      <FileSpreadsheet size={15} />
                      {importing ? "Đang import..." : "Import file Excel"}
                    </button>
                    <button
                      type="button"
                      className={styles.addMenuItem}
                      role="menuitem"
                      onClick={downloadExcelTemplate}
                    >
                      <Download size={15} />
                      Tải file mẫu
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(event) => {
                  void importClasses(event.target.files?.[0] ?? null);
                }}
              />
            </div>
          </header>

          <section className={styles.toolbar} aria-label="Tìm kiếm và lọc lớp">
            <label className={styles.searchField}>
              <Search size={16} />
              <input
                type="search"
                placeholder="Nhập mã lớp hoặc tên lớp cần tìm..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className={styles.selectField}>
              <select
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo lớp"
              >
                <option value="">Tất cả lớp</option>
                {classes.map((classOption) => (
                  <option key={classOption.id} value={classOption.id}>
                    {classOption.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className={styles.selectField}>
              <select
                value={lecturerId}
                onChange={(event) => {
                  setLecturerId(event.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo giảng viên"
              >
                <option value="">Tất cả giảng viên</option>
                {lecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>
                    {lecturer.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className={styles.selectField}>
              <select
                value={room}
                onChange={(event) => {
                  setRoom(event.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo phòng học"
              >
                <option value="">Tất cả phòng học</option>
                {rooms.map((roomName) => (
                  <option key={roomName} value={roomName}>
                    {roomName}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className={styles.selectField}>
              <select
                value={time}
                onChange={(event) => {
                  setTime(event.target.value);
                  setPage(1);
                }}
                aria-label="Lọc theo giờ học"
              >
                <option value="">Tất cả giờ học</option>
                {times.map((scheduleTime) => (
                  <option key={scheduleTime.value} value={scheduleTime.value}>
                    {scheduleTime.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </label>
          </section>

          {formOpen && (
            <div className={styles.modalOverlay} role="presentation">
              <section
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-class-title"
              >
                <header className={styles.modalHeader}>
                  <div>
                    <h2 id="add-class-title">Thêm lớp học</h2>
                    <p>Nhập thông tin lớp và lịch học.</p>
                  </div>
                  <button
                    type="button"
                    className={styles.modalClose}
                    aria-label="Đóng"
                    onClick={() => setFormOpen(false)}
                    disabled={saving}
                  >
                    <X size={18} />
                  </button>
                </header>
                <form onSubmit={submitManualClass}>
                  <div className={styles.modalBody}>
                    <label className={styles.formField}>
                      <span>Tên giảng viên *</span>
                      <select
                        required
                        value={form.lecturerId}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            lecturerId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Chọn giảng viên</option>
                        {lecturers.map((lecturer) => (
                          <option key={lecturer.id} value={lecturer.id}>
                            {lecturer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.formField}>
                      <span>Tên lớp *</span>
                      <input
                        required
                        maxLength={150}
                        value={form.className}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            className: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Mã lớp *</span>
                      <input
                        required
                        maxLength={30}
                        value={form.classCode}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            classCode: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Thời lượng mỗi buổi (giờ) *</span>
                      <input
                        required
                        type="number"
                        min="0.1"
                        max="24"
                        step="0.1"
                        value={form.hours}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            hours: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.formField}>
                      <span>Ngày bắt đầu học *</span>
                      <input
                        required
                        type="date"
                        value={form.classDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            classDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className={styles.weeklyScheduleField}>
                      <span className={styles.weeklyScheduleTitle}>
                        Giờ học mỗi tuần *
                      </span>
                      <p className={styles.weeklyScheduleHint}>
                        Chọn ngày và giờ cho từng buổi học trong tuần.
                      </p>
                      {form.weeklySchedules.map((schedule, index) => (
                        <div className={styles.weeklyScheduleRow} key={index}>
                          <select
                            required
                            aria-label={`Ngày học buổi ${index + 1}`}
                            value={schedule.weekday}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                weeklySchedules: current.weeklySchedules.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, weekday: event.target.value }
                                      : item,
                                ),
                              }))
                            }
                          >
                            <option value="">Chọn thứ</option>
                            {WEEK_DAYS.map((day) => (
                              <option key={day.value} value={day.value}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                          <input
                            required
                            type="time"
                            aria-label={`Giờ học buổi ${index + 1}`}
                            value={schedule.time}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                weeklySchedules: current.weeklySchedules.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, time: event.target.value }
                                      : item,
                                ),
                              }))
                            }
                          />
                          {form.weeklySchedules.length > 1 && (
                            <button
                              type="button"
                              className={styles.removeScheduleButton}
                              aria-label={`Xóa buổi học ${index + 1}`}
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  weeklySchedules: current.weeklySchedules.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                }))
                              }
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.addScheduleButton}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            weeklySchedules: [
                              ...current.weeklySchedules,
                              { weekday: "", time: "" },
                            ],
                          }))
                        }
                      >
                        + Thêm buổi học trong tuần
                      </button>
                    </div>
                    <label className={styles.formField}>
                      <span>Phòng học *</span>
                      <input
                        required
                        maxLength={100}
                        value={form.roomName}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            roomName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    {formError && (
                      <p className={styles.formError} role="alert">
                        {formError}
                      </p>
                    )}
                  </div>
                  <footer className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => setFormOpen(false)}
                      disabled={saving}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      disabled={saving}
                    >
                      {saving ? "Đang lưu..." : "Thêm lớp"}
                    </button>
                  </footer>
                </form>
              </section>
            </div>
          )}

          <section className={styles.tableCard}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Mã lớp</th>
                    <th>Tên lớp</th>
                    <th>Giảng viên</th>
                    <th>Sĩ số</th>
                    <th>Số giờ</th>
                    <th>Phòng học</th>
                    <th>Thời gian</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className={styles.tableMessage}>
                        Đang tải danh sách lớp...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={8} className={styles.tableMessage} role="alert">
                        {error}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className={styles.tableMessage}>
                        Không có lớp học phù hợp.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td className={styles.codeCell}>{item.code || "—"}</td>
                        <td className={styles.nameCell}>{item.name || "—"}</td>
                        <td className={styles.teacherCell}>{item.teacher}</td>
                        <td className={styles.centerCell}>{item.size}</td>
                        <td className={styles.centerCell}>{item.hours}</td>
                        <td>{item.room}</td>
                        <td className={styles.timeCell}>{item.time}</td>
                        <td>
                          <div className={styles.tableActions}>
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label={`Sửa ${item.name}`}
                              title={`Sửa ${item.name}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className={styles.iconButtonDanger}
                              aria-label={`Xóa ${item.name}`}
                              title={`Xóa ${item.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <span>
                Hiển thị {firstItem}–{lastItem} của {total}
              </span>
              <div className={styles.pageButtons}>
                <button
                  type="button"
                  className={styles.pageButton}
                  aria-label="Trang trước"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`${styles.pageButton} ${pageNumber === page ? styles.pageButtonActive : ""}`}
                      aria-current={pageNumber === page ? "page" : undefined}
                      disabled={loading}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className={styles.pageButton}
                  aria-label="Trang sau"
                  disabled={page >= totalPages || loading}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
