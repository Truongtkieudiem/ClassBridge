import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import styles from "./accountList.module.css";
import AdminSidebar from "./sidebar";
import api from "../../services/api";
import {
  ChevronDown,
  Search,
  Plus,
  Download,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  MoreVertical,
} from "lucide-react";

type UserStatus = "Active" | "Inactive";
type UserRole = "Admin" | "Editor" | "User";

type Account = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  phone?: string;
  studentId?: string;
  status: UserStatus;
  role: UserRole;
  joinedDate: string;
  lastActiveLabel: string;
  avatarUrl?: string | null;
};

type ActivityLog = {
  id: string;
  time: string;
  title: string;
  description: string;
};

type AccountsResponse = {
  items: Account[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Status" },
  { value: "Active", label: "Active (Đang hoạt động)" },
  { value: "Inactive", label: "Inactive (Không hoạt động)" },
];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Roles" },
  { value: "Admin", label: "Admin" },
  { value: "Editor", label: "Lecture" },
  { value: "User", label: "Students" },
];

const FULLNAME_REGEX = /^[\p{L}]+(?:\s[\p{L}]+)*$/u;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const PHONE_REGEX = /^\d{10}$/;
const COMMON_PASSWORDS = new Set([
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
]);

function getPasswordRequirements(password: string) {
  return [
    {
      id: "length",
      met: password.length >= 8 && password.length <= 64,
      text: "Từ 8 đến 64 ký tự",
    },
    {
      id: "uppercase",
      met: /[A-Z]/.test(password),
      text: "Có ít nhất 1 chữ hoa",
    },
    {
      id: "lowercase",
      met: /[a-z]/.test(password),
      text: "Có ít nhất 1 chữ thường",
    },
    { id: "digit", met: /[0-9]/.test(password), text: "Có ít nhất 1 chữ số" },
    {
      id: "special",
      met: /[^A-Za-z0-9\s]/.test(password),
      text: "Có ít nhất 1 ký tự đặc biệt",
    },
    {
      id: "common",
      met: Boolean(password) && !COMMON_PASSWORDS.has(password.toLowerCase()),
      text: "Không phải mật khẩu phổ biến",
    },
  ];
}

function normalizeExcelHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRoleName(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");
  if (!raw) return "User";
  const roleMap: Record<string, string> = {
    admin: "Admin",
    administrator: "Admin",
    lecturer: "Editor",
    editor: "Editor",
    giangvien: "Editor",
    teacher: "Editor",
    student: "User",
    user: "User",
    sinhvien: "User",
    hocsinh: "User",
    hocvien: "User",
    studentrole: "User",
  };
  return roleMap[raw] ?? "User";
}

function getExcelCellValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const matchKey = Object.keys(row).find(
      (cellKey) => normalizeExcelHeader(cellKey) === normalizeExcelHeader(key),
    );
    if (matchKey !== undefined) {
      const value = row[matchKey];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

const REQUIRED_IMPORT_COLUMN_GROUPS = [
  {
    label: "Full Name",
    aliases: [
      "fullname",
      "full_name",
      "full name",
      "hovatent",
      "hovaten",
      "name",
      "ten",
    ],
  },
  {
    label: "Mã định danh",
    aliases: [
      "studentid",
      "student_id",
      "madinhdanh",
      "masinhvien",
      "accountcode",
      "account_code",
      "mssv",
      "magiangvien",
      "lecturerid",
    ],
  },
  { label: "Email", aliases: ["email", "gmail", "emailaddress"] },
  {
    label: "Password",
    aliases: ["password", "matkhau", "mat_khau", "pass", "passwd"],
  },
  { label: "Role", aliases: ["role", "vaitro", "accounttype", "account_type"] },
] as const;

function getHeaderValueSet(headerKeys: string[]): Set<string> {
  return new Set(headerKeys.map((key) => normalizeExcelHeader(key)));
}

function findMissingImportColumns(headerKeys: string[]): string[] {
  const headerSet = getHeaderValueSet(headerKeys);

  return REQUIRED_IMPORT_COLUMN_GROUPS.filter(
    ({ aliases }) =>
      !aliases.some((alias) => headerSet.has(normalizeExcelHeader(alias))),
  ).map(({ label }) => label);
}

function parseExcelFileRows(file: File): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          resolve([]);
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: "",
          raw: false,
        });

        resolve(
          rows
            .map((row) => ({
              fullName: getExcelCellValue(row, ["fullName", "full_name", "name", "hoVaTen", "hovaten", "fullname", "họ và tên", "ten"]),
              email: getExcelCellValue(row, ["email", "gmail", "emailaddress"]),
              password: getExcelCellValue(row, ["password", "matKhau", "pass", "passwd"]),
              phone: getExcelCellValue(row, ["phone", "sdt", "phoneNumber", "telephone"]),
              studentId: getExcelCellValue(row, ["studentId", "studentid", "maDinhDanh", "madinhdanh", "maSinhVien", "masinhvien", "lecturerId", "lecturerid", "maGiangVien", "magiangvien"]),
              role: getExcelCellValue(row, ["role", "vaiTro", "vaitro", "accountType", "accounttype"]),
            }))
            .filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== "")),
        );
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("Không thể đọc file Excel."));
    reader.readAsArrayBuffer(file);
  });
}

type FieldName =
  | "fullName"
  | "password"
  | "email"
  | "phone"
  | "studentId";
type FieldErrors = Partial<Record<FieldName, string>>;

function validateField(
  field: FieldName,
  rawValue: string,
  role?: string,
): string | undefined {
  const value = field === "password" ? rawValue : rawValue.trim();
  switch (field) {
    case "fullName":
      if (!value) return "Vui lòng nhập họ và tên.";
      if (/\d/.test(value)) return "Họ và tên không được chứa số.";
      if (!FULLNAME_REGEX.test(value))
        return "Họ và tên chỉ được chứa chữ cái.";
      return undefined;
    case "password":
      if (!value) return "Vui lòng nhập mật khẩu.";
      return getPasswordRequirements(value).find(
        (requirement) => !requirement.met,
      )?.text;
    case "email":
      if (!value) return "Vui lòng nhập email.";
      if (!EMAIL_REGEX.test(value))
        return "Email phải đúng định dạng và kết thúc bằng @gmail.com.";
      return undefined;
    case "phone":
      if (!value) return undefined;
      if (!PHONE_REGEX.test(value))
        return "Số điện thoại phải gồm đúng 10 chữ số, không chứa chữ.";
      return undefined;
    case "studentId":
      if (role === "Admin" || (!value && role !== "Editor")) return undefined;
      if (!value) return "Vui lòng nhập mã định danh.";
      if (role === "Editor" && !/^[A-Za-z0-9]{1,30}$/.test(value))
        return "Mã giảng viên gồm 1–30 chữ cái hoặc chữ số.";
      if (role === "User" && !/^\d{11}$/.test(value))
        return "Mã sinh viên phải gồm đúng 11 chữ số.";
      return undefined;
    default:
      return undefined;
  }
}

async function fetchAccounts(params: {
  q: string;
  status: string;
  role: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}): Promise<AccountsResponse> {
  const response = await api.get("/auth/admin/accounts", { params });
  return response.data;
}

async function createAccount(body: {
  password: string;
  email: string;
  phone?: string;
  studentId?: string;
  fullName?: string;
  role: string;
}): Promise<Account> {
  const response = await api.post("/auth/admin/accounts", body);
  return response.data;
}

async function updateAccount(
  id: string,
  body: Partial<{
    password: string;
    email: string;
    phone: string;
    studentId: string;
    fullName: string;
    role: string;
    status: string;
  }>,
): Promise<Account> {
  const response = await api.patch(`/auth/admin/accounts/${encodeURIComponent(id)}`, body);
  return response.data;
}

async function deleteAccount(id: string): Promise<void> {
  await api.delete(`/auth/admin/accounts/${encodeURIComponent(id)}`);
}

async function fetchActivityHistory(userId: string): Promise<ActivityLog[]> {
  const response = await api.get(
    `/auth/admin/accounts/${encodeURIComponent(userId)}/activity`,
  );
  return response.data.items;
}

function statusClass(status: UserStatus): string {
  switch (status) {
    case "Active":
      return styles.statusActive;
    case "Inactive":
      return styles.statusInactive;
    default:
      return styles.statusInactive;
  }
}

function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function AdminAccountsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortBy, setSortBy] = useState<string>("joinedDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [items, setItems] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editUser, setEditUser] = useState<Account | null>(null);
  const [deleteUser, setDeleteUser] = useState<Account | null>(null);
  const [detailUser, setDetailUser] = useState<Account | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    fullName: "",
    password: "",
    email: "",
    phone: "",
    studentId: "",
    role: "User" as string,
    status: "Active" as string,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const hasSelection = selectedIds.size > 0;

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccounts({
        q,
        status: statusFilter,
        role: roleFilter,
        dateFrom: dateFilter,
        dateTo: dateFilter,
        page,
        pageSize,
        sortBy,
        sortDir,
      });
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(Math.max(1, data.totalPages ?? 1));
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      if (
        axios.isAxiosError(err) &&
        [401, 422].includes(err.response?.status ?? 0)
      ) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", {
          replace: true,
          state: { sessionExpired: true },
        });
        return;
      }
      setError(
        getRequestErrorMessage(
          err,
          "Không thể tải danh sách tài khoản. Vui lòng thử lại.",
        ),
      );
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    statusFilter,
    roleFilter,
    dateFilter,
    page,
    pageSize,
    sortBy,
    sortDir,
    navigate,
  ]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function onSearchChange(value: string) {
    setQ(value);
    setPage(1);
  }

  function handleDateChange(value: string) {
    if (value && value > todayStr) {
      setDateError("Không được chọn ngày trong tương lai. Vui lòng chọn lại.");
      return;
    }
    setDateError(null);
    setDateFilter(value);
    setPage(1);
  }

  function toggleSort(column: string) {
    if (sortBy === column) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortDir("asc");
    }
    setPage(1);
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((u) => u.id)));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateFormField(field: FieldName, value: string) {
    if (field === "studentId") {
      const normalizedValue =
        form.role === "User" ? value.replace(/\D/g, "") : value;
      setForm((f) => ({ ...f, studentId: normalizedValue }));
      setFieldErrors((fe) => ({
        ...fe,
        studentId: validateField("studentId", normalizedValue, form.role),
      }));
      return;
    }
    setForm((f) => ({ ...f, [field]: value }));
    if (field === "password" && editUser && value === "") {
      setFieldErrors((fe) => ({ ...fe, password: undefined }));
      return;
    }
    setFieldErrors((fe) => ({ ...fe, [field]: validateField(field, value) }));
  }

  function openAddModal() {
    setAddMenuOpen(false);
    setForm({
      fullName: "",
      password: "",
      email: "",
      phone: "",
      studentId: "",
      role: "User",
      status: "Active",
    });
    setFieldErrors({});
    setFormError(null);
    setAddOpen(true);
  }

  function openImportExcel() {
    setAddMenuOpen(false);
    if (importInputRef.current) {
      importInputRef.current.value = "";
      importInputRef.current.click();
    }
  }

  function openEditModal(user: Account) {
    setMenuOpenId(null);
    setForm({
      fullName: user.fullName,
      password: "",
      email: user.email,
      phone: user.phone ?? "",
      studentId: user.studentId ?? "",
      role: user.role,
      status: user.status,
    });
    setFieldErrors({});
    setFormError(null);
    setEditUser(user);
  }

  async function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errors: FieldErrors = {
      fullName: validateField("fullName", form.fullName),
      password: validateField("password", form.password),
      email: validateField("email", form.email),
      phone: validateField("phone", form.phone),
      studentId: validateField("studentId", form.studentId, form.role),
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setFormError(
        "Vui lòng kiểm tra lại các trường được đánh dấu lỗi bên dưới.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await createAccount({
        password: form.password,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        studentId: form.studentId.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
      });
      setAddOpen(false);
      await loadAccounts();
    } catch (err) {
      setFormError(getRequestErrorMessage(err, "Lỗi tạo tài khoản"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExcelImport(file: File | null) {
    if (!file) return;
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(extension)) {
      setFormError("Chỉ hỗ trợ file Excel hoặc CSV (.xlsx, .xls, .csv).");
      return;
    }

    setImportingFile(true);
    setFormError(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setFormError("File Excel không có sheet dữ liệu.");
        return;
      }

      const firstSheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
        raw: false,
      });

      if (!rawRows.length) {
        setFormError("File không chứa dữ liệu tài khoản hợp lệ.");
        return;
      }

      const missingColumns = findMissingImportColumns(Object.keys(rawRows[0] ?? {}));
      if (missingColumns.length > 0) {
        setFormError(
          `File Excel thiếu cột bắt buộc: ${missingColumns.join(", ")}. Yêu cầu có các cột Full Name, Mã định danh, Email, Password, Role.`,
        );
        return;
      }

      const rows = await parseExcelFileRows(file);
      if (!rows.length) {
        setFormError("File không chứa dữ liệu tài khoản hợp lệ.");
        return;
      }

      let createdCount = 0;
      const rowErrors: string[] = [];

      for (const [index, row] of rows.entries()) {
        const fullName = (row.fullName || "").trim();
        const password = (row.password || "").trim();
        const email = (row.email || "").trim();
        const phone = (row.phone || "").trim();
        const studentId = (row.studentId || "").trim();
        const role = normalizeRoleName(row.role || "User");

        const rowError = {
          fullName: validateField("fullName", fullName),
          password: validateField("password", password),
          email: validateField("email", email),
          phone: validateField("phone", phone),
          studentId: validateField("studentId", studentId, role),
        };

        if (Object.values(rowError).some(Boolean)) {
          rowErrors.push(
            `Dòng ${index + 2}: ${
              Object.values(rowError).find(Boolean) || "Dữ liệu không hợp lệ"
            }`,
          );
          continue;
        }

        try {
          await createAccount({
            password,
            email,
            phone: phone || undefined,
            studentId,
            fullName,
            role,
          });
          createdCount += 1;
        } catch (err) {
          rowErrors.push(
            `Dòng ${index + 2}: ${getRequestErrorMessage(err, "Không thể tạo tài khoản")}`,
          );
        }
      }

      if (createdCount > 0) {
        setAddOpen(false);
        await loadAccounts();
        setToast(`Đã thêm ${createdCount} tài khoản từ file Excel.`);
      }

      if (rowErrors.length > 0) {
        setFormError(rowErrors.slice(0, 3).join("; "));
      }
    } catch (err) {
      setFormError(getRequestErrorMessage(err, "Không thể đọc file Excel."));
    } finally {
      setImportingFile(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setFormError(null);
    const errors: FieldErrors = {
      fullName: validateField("fullName", form.fullName),
      email: validateField("email", form.email),
      phone: validateField("phone", form.phone),
      studentId: validateField("studentId", form.studentId, form.role),
    };
    if (form.password)
      errors.password = validateField("password", form.password);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      setFormError(
        "Vui lòng kiểm tra lại các trường được đánh dấu lỗi bên dưới.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        studentId: form.studentId.trim(),
        status: form.status,
      };
      if (form.password) body.password = form.password;
      await updateAccount(editUser.id, body);
      setEditUser(null);
      await loadAccounts();
    } catch (err) {
      setFormError(getRequestErrorMessage(err, "Lỗi cập nhật"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteUser) return;
    setSubmitting(true);
    try {
      await deleteAccount(deleteUser.id);
      setDeleteUser(null);
      if (detailUser?.id === deleteUser.id) setDetailUser(null);
      await loadAccounts();
    } catch (err) {
      alert(getRequestErrorMessage(err, "Không thể xóa"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(`Xóa ${selectedIds.size} tài khoản đã chọn? Không thể hoàn tác.`)
    )
      return;
    setSubmitting(true);
    try {
      const count = selectedIds.size;
      for (const id of selectedIds) {
        await deleteAccount(id);
      }
      setSelectedIds(new Set());
      if (detailUser && selectedIds.has(detailUser.id)) setDetailUser(null);
      setToast(`Đã xóa ${count} tài khoản thành công.`);
      await loadAccounts();
    } catch (err) {
      alert(getRequestErrorMessage(err, "Không thể xóa"));
    } finally {
      setSubmitting(false);
    }
  }
  async function openDetailPanel(user: Account) {
    setMenuOpenId(null);
    setDetailUser(user);
    setActivityLogs([]);
    setActivityError(null);
    setActivityLoading(true);
    try {
      setActivityLogs(await fetchActivityHistory(user.id));
    } catch (err) {
      console.error(err);
      setActivityError(
        getRequestErrorMessage(err, "Không thể tải lịch sử hoạt động."),
      );
    } finally {
      setActivityLoading(false);
    }
  }

  async function handleExport() {
    const header = [
      "ID",
      "Username",
      "Full Name",
      "Email",
      "Phone",
      "Status",
      "Role",
      "Joined Date",
      "Activity History",
    ];
    const rows = items.map((u) =>
      [
        u.id,
        u.username,
        u.fullName,
        u.email,
        u.phone ?? "",
        u.status,
        u.role,
        u.joinedDate,
        u.lastActiveLabel,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleShowMore() {
    setPageSize((s) => s + PAGE_SIZE);
    setPage(1);
  }

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxShow = 5;
    let start = Math.max(1, page - Math.floor(maxShow / 2));
    let end = Math.min(totalPages, start + maxShow - 1);
    start = Math.max(1, end - maxShow + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [page, totalPages]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={styles.page}>
      <AdminSidebar />
      <main className={`${styles.contentArea} ${styles.main}`}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Account Management</h1>
            <p className={styles.pageSubtitle}>
              Quản lý tài khoản — tìm kiếm, lọc, thêm / sửa / xóa và xem lịch sử
              hoạt động.
            </p>
          </div>

          <div className={styles.pageHeaderActions}>
            <button
              type="button"
              className={styles.btnExport}
              onClick={handleExport}
            >
              <Download size={16} /> Export
            </button>

            <div className={styles.addMenuWrapper} ref={addMenuRef}>
              <button
                type="button"
                className={styles.btnAddIcon}
                onClick={() => setAddMenuOpen((value) => !value)}
                aria-label="Thêm tài khoản"
              >
                <Plus size={18} />
              </button>
              {addMenuOpen && (
                <div className={styles.addMenu} role="menu">
                  <button
                    type="button"
                    className={styles.addMenuItem}
                    onClick={openAddModal}
                  >
                    Thêm thủ công
                  </button>
                  <button
                    type="button"
                    className={styles.addMenuItem}
                    onClick={openImportExcel}
                  >
                    Import bằng file Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.mainWithPanel}>
          <div className={styles.mainCol}>
            {hasSelection ? (
              <div className={styles.bulkBar}>
                <span className={styles.bulkInfo}>
                  Đã chọn {selectedIds.size} tài khoản
                </span>
                <div className={styles.bulkActions}>
                  <button
                    type="button"
                    className={styles.btnBulkCancel}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className={styles.btnBulkDelete}
                    onClick={handleBulkDelete}
                    disabled={submitting}
                  >
                    <Trash2 size={16} /> Xóa
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.toolbarContainer}>
                <div className={styles.filtersBar}>
                  <label className={styles.searchInputWrap}>
                    <Search size={16} />
                    <input
                      type="search"
                      placeholder="Tìm theo Tên, Email, SĐT hoặc ID..."
                      value={q}
                      onChange={(e) => onSearchChange(e.target.value)}
                    />
                  </label>
                  <div className={styles.filterSelect}>
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value || "all-s"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                  <div className={styles.filterSelect}>
                    <select
                      value={roleFilter}
                      onChange={(e) => {
                        setRoleFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value || "all-r"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                  <div className={styles.dateInputWrap}>
                    <Calendar size={14} />
                    <input
                      type="date"
                      value={dateFilter}
                      max={todayStr}
                      onChange={(e) => handleDateChange(e.target.value)}
                      aria-label="Ngày đăng ký"
                    />
                  </div>
                </div>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void handleExcelImport(file);
                  }}
                />
              </div>
            )}

            {dateError && <p className={styles.inlineError}>{dateError}</p>}
            {error && (
              <div className={styles.errorBanner}>
                {error}{" "}
                <button
                  type="button"
                  onClick={loadAccounts}
                  className={styles.retryLink}
                >
                  Thử lại
                </button>
              </div>
            )}

            <div className={styles.tablePanel}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCell}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={
                            items.length > 0 &&
                            selectedIds.size === items.length
                          }
                          onChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th className={styles.idCell}>ID</th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("username")}
                      >
                        Username
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("fullName")}
                      >
                        Full Name
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("studentId")}
                      >
                        Mã định danh
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("email")}
                      >
                        Email
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("status")}
                      >
                        Status
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("role")}
                      >
                        Role
                      </th>
                      <th
                        className={styles.sortable}
                        onClick={() => toggleSort("joinedDate")}
                      >
                        Joined Date
                      </th>
                      <th>Activity History</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={11} className={styles.loadingState}>
                          Loading...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={11} className={styles.emptyState}>
                          Không thể hiển thị dữ liệu tài khoản.
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={11} className={styles.emptyState}>
                          Không có tài khoản nào phù hợp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      items.map((user) => {
                        const rowId = user.id.split(":")[1].slice(0, 8);
                        return (
                          <tr
                            key={user.id}
                            className={
                              selectedIds.has(user.id)
                                ? styles.selected
                                : undefined
                            }
                            onClick={() => openDetailPanel(user)}
                            onKeyDown={(event) => {
                              if (
                                event.target === event.currentTarget &&
                                (event.key === "Enter" || event.key === " ")
                              ) {
                                event.preventDefault();
                                openDetailPanel(user);
                              }
                            }}
                            tabIndex={0}
                            aria-label={`View account ${user.username}`}
                          >
                            <td className={styles.checkboxCell}>
                              <input
                                type="checkbox"
                                className={styles.checkbox}
                                checked={selectedIds.has(user.id)}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  toggleSelect(user.id);
                                }}
                                onClick={(event) => event.stopPropagation()}
                                aria-label={`Select ${user.username}`}
                              />
                            </td>
                            <td className={styles.idCell} title={user.id}>
                              {rowId}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.userNameLink}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDetailPanel(user);
                                }}
                              >
                                {user.username}
                              </button>
                            </td>
                            <td className={styles.usernameCell}>
                              {user.fullName}
                            </td>
                            <td className={styles.dateCell}>
                              {user.studentId || "—"}
                            </td>
                            <td className={styles.emailCell}>{user.email}</td>
                            <td>
                              <span
                                className={`${styles.statusBadge} ${statusClass(user.status)}`}
                              >
                                {user.status}
                              </span>
                            </td>
                            <td className={styles.roleCell}>{user.role}</td>
                            <td className={styles.dateCell}>
                              {user.joinedDate}
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.activityLink}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDetailPanel(user);
                                }}
                              >
                                {user.lastActiveLabel || "View history"}
                              </button>
                            </td>
                            <td>
                              <div
                                className={styles.kebabWrap}
                                ref={
                                  menuOpenId === user.id ? menuRef : undefined
                                }
                              >
                                <button
                                  type="button"
                                  className={styles.kebabBtn}
                                  aria-label="More actions"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuOpenId((id) =>
                                      id === user.id ? null : user.id,
                                    );
                                  }}
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {menuOpenId === user.id && (
                                  <div
                                    className={styles.kebabMenu}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className={styles.kebabItem}
                                      onClick={() => openEditModal(user)}
                                    >
                                      <Pencil size={14} /> Chỉnh sửa
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.kebabItem} ${styles.kebabItemDanger}`}
                                      onClick={() => {
                                        setMenuOpenId(null);
                                        setDeleteUser(user);
                                      }}
                                    >
                                      <Trash2 size={14} /> Xóa
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {total > 0 && (
                <div className={styles.pagination}>
                  <span className={styles.paginationInfo}>
                    Showing {from}–{to} of {total}
                  </span>
                  <div className={styles.paginationCenter}>
                    <button
                      type="button"
                      className={styles.btnShowMore}
                      onClick={handleShowMore}
                      title="Xem thêm tài khoản trên 1 trang"
                    >
                      Show more
                    </button>
                  </div>
                  <div className={styles.paginationControls}>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {pageNumbers.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.pageBtn} ${n === page ? styles.pageBtnActive : ""}`}
                        onClick={() => setPage(n)}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {detailUser && (
            <aside className={styles.detailPanel}>
              <button
                type="button"
                className={styles.detailCloseX}
                onClick={() => setDetailUser(null)}
                aria-label="Đóng profile"
              >
                <X size={16} />
              </button>
              <div className={styles.detailHeader}>
                <div className={styles.detailAvatar}>
                  {detailUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={detailUser.avatarUrl} alt="" />
                  ) : (
                    (detailUser.fullName || detailUser.username || "?")
                      .slice(0, 1)
                      .toUpperCase()
                  )}
                </div>
                <h3 className={styles.detailName}>{detailUser.fullName}</h3>
                <p className={styles.detailUsername}>@{detailUser.username}</p>
                <div className={styles.detailStatusRow}>
                  <span
                    className={`${styles.statusBadge} ${statusClass(detailUser.status)}`}
                  >
                    {detailUser.status}
                  </span>
                </div>
              </div>
              <div className={styles.detailSection}>
                <p className={styles.detailSectionTitle}>Thông tin</p>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Email</span>
                  <span className={styles.detailValue}>{detailUser.email}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Mã định danh</span>
                  <span className={styles.detailValue}>
                    {detailUser.studentId ? "••••••••••" : "—"}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Role</span>
                  <span className={styles.detailValue}>{detailUser.role}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Joined</span>
                  <span className={styles.detailValue}>
                    {detailUser.joinedDate}
                  </span>
                </div>
              </div>
              <div className={styles.detailSection}>
                <p className={styles.detailSectionTitle}>Lịch sử hoạt động</p>
                {activityLoading ? (
                  <p className={styles.loadingState} style={{ padding: 12 }}>
                    Loading...
                  </p>
                ) : activityError ? (
                  <p className={styles.fieldError} style={{ padding: 12 }}>
                    {activityError}
                  </p>
                ) : activityLogs.length === 0 ? (
                  <p className={styles.emptyState} style={{ padding: 12 }}>
                    Chưa có lịch sử.
                  </p>
                ) : (
                  <div className={styles.detailTimeline}>
                    {activityLogs.map((log) => (
                      <div key={log.id} className={styles.detailTimelineItem}>
                        <span className={styles.detailTimelineDot} />
                        <div>
                          <p className={styles.detailTimelineTime}>
                            {log.time}
                          </p>
                          <p className={styles.detailTimelineTitle}>
                            {log.title}
                          </p>
                          <p className={styles.detailTimelineDesc}>
                            {log.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.detailTopActions}>
                <button
                  type="button"
                  className={styles.btnSecondaryIcon}
                  onClick={() => openEditModal(detailUser)}
                  aria-label="Sửa tài khoản"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className={styles.btnDangerIcon}
                  onClick={() => {
                    setDeleteUser(detailUser);
                  }}
                  aria-label="Xóa tài khoản"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <button
                type="button"
                className={styles.detailClose}
                onClick={() => setDetailUser(null)}
              >
                Close
              </button>
            </aside>
          )}
        </div>
      </main>

      {addOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add New User</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setAddOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitAdd} noValidate>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Name *</label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.fullName ? styles.inputError : ""}`}
                    value={form.fullName}
                    onChange={(e) =>
                      updateFormField("fullName", e.target.value)
                    }
                    placeholder="Nguyễn Văn A"
                  />
                  {fieldErrors.fullName && (
                    <p className={styles.fieldError}>{fieldErrors.fullName}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Password * (8-64 ký tự)
                  </label>
                  <input
                    type="password"
                    className={`${styles.formInput} ${fieldErrors.password ? styles.inputError : ""}`}
                    value={form.password}
                    onChange={(e) =>
                      updateFormField("password", e.target.value)
                    }
                    autoComplete="new-password"
                    maxLength={64}
                  />
                  {fieldErrors.password && (
                    <p className={styles.fieldError}>{fieldErrors.password}</p>
                  )}
                  {form.password && (
                    <ul
                      className={styles.passwordRequirements}
                      aria-live="polite"
                    >
                      {getPasswordRequirements(form.password)
                        .filter((requirement) => !requirement.met)
                        .map((requirement) => (
                          <li
                            key={requirement.id}
                            className={styles.passwordRequirementUnmet}
                          >
                            <span aria-hidden="true">•</span> {requirement.text}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email * </label>
                  <input
                    type="email"
                    className={`${styles.formInput} ${fieldErrors.email ? styles.inputError : ""}`}
                    value={form.email}
                    onChange={(e) => updateFormField("email", e.target.value)}
                    placeholder="tenban@gmail.com"
                  />
                  {fieldErrors.email && (
                    <p className={styles.fieldError}>{fieldErrors.email}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    {form.role === "Editor"
                      ? "Mã giảng viên *"
                      : form.role === "User"
                        ? "Mã sinh viên *"
                        : "Mã định danh (tùy chọn)"}
                  </label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.studentId ? styles.inputError : ""}`}
                    value={form.studentId}
                    onChange={(e) =>
                      updateFormField("studentId", e.target.value)
                    }
                    placeholder={
                      form.role === "Editor"
                        ? "Mã giảng viên"
                        : form.role === "User"
                          ? "11 chữ số"
                          : "Không cần nhập"
                    }
                    disabled={form.role === "Admin"}
                  />
                  {fieldErrors.studentId && (
                    <p className={styles.fieldError}>{fieldErrors.studentId}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone (tùy chọn)</label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.phone ? styles.inputError : ""}`}
                    value={form.phone}
                    onChange={(e) => updateFormField("phone", e.target.value)}
                    placeholder="09xxxxxxxx"
                    inputMode="numeric"
                    maxLength={10}
                  />
                  {fieldErrors.phone && (
                    <p className={styles.fieldError}>{fieldErrors.phone}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Role</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.formSelect}
                      value={form.role}
                      onChange={(e) => {
                        const role = e.target.value;
                        setForm((f) => ({ ...f, role }));
                        setFieldErrors((errors) => ({
                          ...errors,
                          studentId: validateField(
                            "studentId",
                            form.studentId,
                            role,
                          ),
                        }));
                      }}
                    >
                      {ROLE_OPTIONS.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                </div>
                {formError && <p className={styles.formError}>{formError}</p>}
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnCancel}
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Edit User</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setEditUser(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitEdit} noValidate>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Full Name *</label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.fullName ? styles.inputError : ""}`}
                    value={form.fullName}
                    onChange={(e) =>
                      updateFormField("fullName", e.target.value)
                    }
                  />
                  {fieldErrors.fullName && (
                    <p className={styles.fieldError}>{fieldErrors.fullName}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    New Password (8-64 ký tự, để trống nếu không đổi)
                  </label>
                  <input
                    type="password"
                    className={`${styles.formInput} ${fieldErrors.password ? styles.inputError : ""}`}
                    value={form.password}
                    onChange={(e) =>
                      updateFormField("password", e.target.value)
                    }
                    autoComplete="new-password"
                    maxLength={64}
                  />
                  {fieldErrors.password && (
                    <p className={styles.fieldError}>{fieldErrors.password}</p>
                  )}
                  {form.password && (
                    <ul
                      className={styles.passwordRequirements}
                      aria-live="polite"
                    >
                      {getPasswordRequirements(form.password)
                        .filter((requirement) => !requirement.met)
                        .map((requirement) => (
                          <li
                            key={requirement.id}
                            className={styles.passwordRequirementUnmet}
                          >
                            <span aria-hidden="true">•</span> {requirement.text}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Email * (@gmail.com)
                  </label>
                  <input
                    type="email"
                    className={`${styles.formInput} ${fieldErrors.email ? styles.inputError : ""}`}
                    value={form.email}
                    onChange={(e) => updateFormField("email", e.target.value)}
                  />
                  {fieldErrors.email && (
                    <p className={styles.fieldError}>{fieldErrors.email}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    {form.role === "Editor"
                      ? "Mã giảng viên *"
                      : form.role === "User"
                        ? "Mã sinh viên *"
                        : "Mã định danh"}
                  </label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.studentId ? styles.inputError : ""}`}
                    value={form.studentId}
                    onChange={(e) =>
                      updateFormField("studentId", e.target.value)
                    }
                    placeholder={
                      form.role === "Editor" ? "Mã giảng viên" : "11 chữ số"
                    }
                    disabled={form.role === "Admin"}
                  />
                  {fieldErrors.studentId && (
                    <p className={styles.fieldError}>{fieldErrors.studentId}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone (tùy chọn)</label>
                  <input
                    className={`${styles.formInput} ${fieldErrors.phone ? styles.inputError : ""}`}
                    value={form.phone}
                    onChange={(e) => updateFormField("phone", e.target.value)}
                    inputMode="numeric"
                    maxLength={10}
                  />
                  {fieldErrors.phone && (
                    <p className={styles.fieldError}>{fieldErrors.phone}</p>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Role</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.formSelect}
                      value={form.role}
                      disabled
                    >
                      {ROLE_OPTIONS.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Status</label>
                  <div className={styles.selectWrap}>
                    <select
                      className={styles.formSelect}
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, status: e.target.value }))
                      }
                    >
                      {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={styles.selectChevron} />
                  </div>
                </div>
                {formError && <p className={styles.formError}>{formError}</p>}
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.btnCancel}
                  onClick={() => setEditUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteUser && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Xóa tài khoản</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setDeleteUser(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p
                style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}
              >
                Bạn có chắc muốn xóa tài khoản{" "}
                <strong style={{ color: "var(--text)" }}>
                  {deleteUser.username}
                </strong>{" "}
                ({deleteUser.email})? Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setDeleteUser(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                disabled={submitting}
                onClick={handleConfirmDelete}
              >
                {submitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
