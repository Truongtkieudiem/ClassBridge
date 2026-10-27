import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  FileSpreadsheet,
  Download,
  Upload,
  MoreVertical,
} from "lucide-react";

import * as XLSX from "xlsx";
import api from "../../../services/api";
import styles from "./class.module.css";
import AddClass from "./AddClass";
import ClassSessionsModal from "./ClassSessionsModal";
import type {
  ClassFormData,
  ClassItem,
  ClassScheduleDateRange,
  ClassSessionItem,
  WeeklyScheduleDraft,
} from "./classTypes";

export default function ClassManagement() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [openActionsClassId, setOpenActionsClassId] = useState<string | null>(
    null,
  );
  const [openActionsPosition, setOpenActionsPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  // Tải danh sách lớp học từ backend (database)
  useEffect(() => {
    let active = true;
    api
      .get("/auth/lecturer/classes")
      .then(({ data }) => {
        if (active) setClasses(data.classes ?? []);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!openActionsClassId) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-class-actions]")?.getAttribute("data-class-actions") !==
          openActionsClassId
      ) {
        setOpenActionsClassId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenActionsClassId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openActionsClassId]);

  const filteredClasses = classes.filter((cls) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [cls.name, cls.classCode, cls.courseCode, cls.description].some((value) =>
        value?.toLowerCase().includes(query),
      );
    return (
      matchesSearch && (classFilter === "all" || cls.classCode === classFilter)
    );
  });
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // State cho Modal CRUD (Thêm / Chỉnh sửa)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [saving, setSaving] = useState(false);

  // State cho modal buổi học & upload bài giảng
  const [sessionsModal, setSessionsModal] = useState<{
    open: boolean;
    classId: string;
    className: string;
  }>({ open: false, classId: "", className: "" });
  const [classSessions, setClassSessions] = useState<ClassSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [uploadingScheduleId, setUploadingScheduleId] = useState<string | null>(
    null,
  );

  const toggleClassSelection = (classId: string) => {
    setSelectedClassIds((selected) =>
      selected.includes(classId)
        ? selected.filter((id) => id !== classId)
        : [...selected, classId],
    );
  };

  const toggleAllClasses = () => {
    const visibleIds = filteredClasses.map((cls) => cls.id);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedClassIds.includes(id));
    setSelectedClassIds((selected) =>
      allVisibleSelected
        ? selected.filter((id) => !visibleIds.includes(id))
        : [...new Set([...selected, ...visibleIds])],
    );
  };

  const handleDownloadTemplate = () => {
    // Tải file mẫu Excel do backend sinh ra (đúng định dạng import)
    api
      .get("/auth/lecturer/classes/template", { responseType: "blob" })
      .then(({ data }) => {
        const url = URL.createObjectURL(data as Blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "mau_import_lop.xlsx";
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Không thể tải file mẫu. Vui lòng thử lại."));
    setIsAddMenuOpen(false);
  };

  const handleExportClasses = () => {
    const rowsToExport = selectedClassIds.length
      ? classes.filter((cls) => selectedClassIds.includes(cls.id))
      : filteredClasses;
    if (!rowsToExport.length) {
      alert("Khong co lop nao de xuat.");
      return;
    }
    const rows = rowsToExport.map((cls) => ({
      "Ma lop": cls.classCode,
      "Ten mon hoc": cls.name,
      "Si so": cls.studentCount ?? 0,
      "So gio da hoc": cls.hoursLearned ?? "",
      "Tong so gio": cls.hours ?? "",
      "Ma mon hoc": cls.courseCode,
      "Thoi gian bat dau": cls.startTime ?? "",
      "Thoi gian ket thuc": cls.endTime ?? "",
      "Thu trong tuan": cls.weekday ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Danh sach lop");
    XLSX.writeFile(workbook, "danh_sach_lop.xlsx");
  };

  const handleImportExcel = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post(
        "/auth/lecturer/classes/import-excel",
        form,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      const parts = [data.message ?? ""];
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        parts.push(
          "Dòng lỗi: " +
            data.errors
              .map(
                (item: { row: number; errors: string[] }) =>
                  `Dòng ${item.row}: ${item.errors.join(", ")}`,
              )
              .join("; "),
        );
      }
      alert(parts.join("\n"));
      // Tải lại danh sách lớp mới nhất từ DB
      const refreshed = await api.get("/auth/lecturer/classes");
      setClasses(refreshed.data.classes ?? []);
      setLoadError(false);
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response &&
        error.response.data &&
        typeof error.response.data === "object" &&
        "message" in error.response.data
          ? String((error.response.data as { message?: unknown }).message)
          : "Không thể nhập file Excel. Hãy dùng file mẫu của hệ thống.";
      alert(message);
    } finally {
      event.target.value = "";
    }
  };

  // Xử lý mở Modal thêm mới
  const handleOpenCreateModal = () => {
    setEditingClass(null);
    setIsModalOpen(true);
  };

  // Xử lý mở Modal chỉnh sửa
  const handleOpenEditModal = (cls: ClassItem) => {
    setEditingClass(cls);
    setIsModalOpen(true);
  };

  // Xử lý Xóa lớp học (gọi API)
  const handleDeleteClass = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa lớp học này không?")) return;
    try {
      await api.delete(`/auth/lecturer/classes/${id}`);
      setClasses((current) => current.filter((c) => c.id !== id));
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response &&
        error.response.data &&
        typeof error.response.data === "object" &&
        "message" in error.response.data
          ? String((error.response.data as { message?: unknown }).message)
          : "Không thể xóa lớp học. Vui lòng thử lại.";
      alert(message);
    }
  };

  // Xử lý Lưu (Tạo mới hoặc Cập nhật) - gọi API
  const handleSaveClass = async (
    formData: ClassFormData,
    dateRange: ClassScheduleDateRange,
    weeklySchedules: WeeklyScheduleDraft[],
  ) => {
    if (!formData.name || !formData.courseCode || !formData.hours) {
      alert(
        "Vui lòng điền đầy đủ thông tin bắt buộc (Mã môn học, Tên môn học, Số giờ học)!",
      );
      return;
    }

    const payload = {
      name: formData.name,
      courseCode: formData.courseCode,
      hours: formData.hours,
      description: formData.description,
    };
    setSaving(true);
    try {
      if (editingClass) {
        await api.put(`/auth/lecturer/classes/${editingClass.id}`, {
          name: payload.name,
          description: payload.description,
        });
        setClasses((current) =>
          current.map((c) =>
            c.id === editingClass.id
              ? { ...c, name: payload.name, description: payload.description }
              : c,
          ),
        );
        alert("Đã cập nhật lớp học.");
      } else {
        const { data } = await api.post("/auth/lecturer/classes", {
          ...payload,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          weeklySchedules: weeklySchedules.map(
            ({ weekday, startTime, endTime }) => ({
              weekday,
              time: startTime,
              startTime,
              endTime,
            }),
          ),
        });
        // Tải lại danh sách lớp mới nhất từ DB (có lịch học mới)
        const refreshed = await api.get("/auth/lecturer/classes");
        setClasses(refreshed.data.classes ?? []);
        setLoadError(false);
        setIsModalOpen(false);

        const selectedFiles = weeklySchedules
          .map((schedule, index) => ({ schedule, index }))
          .filter(({ schedule }) => schedule.lectureFile);
        if (selectedFiles.length) {
          if (!data.id) {
            alert(
              "Đã tạo lớp học nhưng máy chủ không trả mã lớp để tải bài giảng lên. Bạn có thể tải file trong mục Lịch học & bài giảng.",
            );
            return;
          }
          try {
            const { data: sessionData } = await api.get(
              `/auth/lecturer/classes/${data.id}/sessions`,
            );
            const sessions: ClassSessionItem[] = sessionData.sessions ?? [];
            const uploadFailures: string[] = [];

            for (const { schedule, index } of selectedFiles) {
              const session = sessions.find(
                (candidate) =>
                  candidate.weekdayCode === schedule.weekday &&
                  candidate.startTimeLabel === schedule.startTime,
              );
              if (!session) {
                uploadFailures.push(`Buổi ${index + 1}`);
                continue;
              }
              if (!schedule.lectureFile) {
                continue;
              }

              const form = new FormData();
              form.append("file", schedule.lectureFile);
              try {
                await api.post(
                  `/auth/lecturer/classes/${data.id}/sessions/${session.id}/upload-slides`,
                  form,
                  { headers: { "Content-Type": "multipart/form-data" } },
                );
              } catch {
                uploadFailures.push(`Buổi ${index + 1}`);
              }
            }

            if (uploadFailures.length) {
              alert(
                `Đã tạo lớp học, nhưng chưa tải được bài giảng cho: ${uploadFailures.join(", ")}. Bạn có thể tải lại trong mục Lịch học & bài giảng.`,
              );
            } else {
              alert(data.message || "Đã thêm lớp học và tải bài giảng lên.");
            }
          } catch {
            alert(
              "Đã tạo lớp học nhưng không thể tải danh sách buổi học để gắn bài giảng. Hãy tải file trong mục Lịch học & bài giảng.",
            );
          }
          return;
        }
        alert(data.message || "Đã thêm lớp học.");
      }
      setIsModalOpen(false);
    } catch (error) {
      const responseData =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response &&
        error.response.data &&
        typeof error.response.data === "object"
          ? (error.response.data as {
              message?: unknown;
              msg?: unknown;
            })
          : null;
      const responseMessage = responseData?.message ?? responseData?.msg;
      const status =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "status" in error.response
          ? Number(error.response.status)
          : null;
      const message =
        typeof responseMessage === "string"
          ? responseMessage
          : status === 401
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi tạo lớp."
            : status === 403
              ? "Tài khoản hiện tại không có quyền tạo lớp giảng viên. Vui lòng đăng nhập bằng tài khoản giảng viên."
              : status === null
                ? "Không kết nối được backend. Hãy kiểm tra server tại http://127.0.0.1:5000."
                : "Không thể lưu lớp học. Vui lòng thử lại.";
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  // Xử lý xem chi tiết lớp học
  const handleViewDetail = (classCode: string) => {
    navigate(`/giangvien/classes/${classCode}`);
  };

  // ===== Lịch học & bài giảng theo buổi =====
  const openSessionsModal = async (cls: ClassItem) => {
    setSessionsModal({ open: true, classId: cls.id, className: cls.name });
    setClassSessions([]);
    setSessionsLoading(true);
    try {
      const { data } = await api.get(
        `/auth/lecturer/classes/${cls.id}/sessions`,
      );
      setClassSessions(data.sessions ?? []);
    } catch {
      alert("Không thể tải danh sách buổi học.");
    } finally {
      setSessionsLoading(false);
    }
  };

  const closeSessionsModal = () => {
    setSessionsModal({ open: false, classId: "", className: "" });
    setClassSessions([]);
  };

  const handleUploadSlides = async (
    scheduleId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    setUploadingScheduleId(scheduleId);
    try {
      const { data } = await api.post(
        `/auth/lecturer/classes/${sessionsModal.classId}/sessions/${scheduleId}/upload-slides`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const uploadMessage =
        data.slides > 0
          ? `${data.message || "Đã tải bài giảng lên."} (${data.slides} trang)`
          : data.message || "Đã tải bài giảng lên.";
      alert(uploadMessage);
      setClassSessions((current) =>
        current.map((session) =>
          session.id === scheduleId ? { ...session, hasSlides: true } : session,
        ),
      );
    } catch (error) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        error.response &&
        typeof error.response === "object" &&
        "data" in error.response &&
        error.response.data &&
        typeof error.response.data === "object" &&
        "message" in error.response.data
          ? String((error.response.data as { message?: unknown }).message)
          : "Không thể tải bài giảng lên.";
      alert(message);
    } finally {
      setUploadingScheduleId(null);
      event.target.value = "";
    }
  };

  return (
    <div className={styles.container}>
      {/* Tiêu đề trang & Nút thêm lớp học (+) */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Lớp học</h1>
          <p className={styles.subTitle}>Quản lý các lớp học của bạn</p>
        </div>
        <div className={styles.pageHeaderActions}>
          <button
            type="button"
            className={styles.exportButton}
            onClick={handleExportClasses}
          >
            <Download size={17} /> Xuất danh sách
          </button>
          <div className={styles.addMenuWrap}>
            <button
              type="button"
              className={styles.addIconButton}
              aria-label="Th?m l?p"
              aria-haspopup="menu"
              aria-expanded={isAddMenuOpen}
              onClick={() => setIsAddMenuOpen((open) => !open)}
            >
              <Plus size={20} />
            </button>
            {isAddMenuOpen && (
              <div className={styles.addMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    handleOpenCreateModal();
                  }}
                >
                  <Plus size={16} /> Th&#234;m l&#7899;p th&#7911; c&#244;ng
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    importInputRef.current?.click();
                  }}
                >
                  <FileSpreadsheet size={16} /> Th&#234;m l&#7899;p b&#7857;ng
                  Excel
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDownloadTemplate}
                >
                  <Download size={16} /> T&#7843;i file Excel m&#7851;u
                </button>
              </div>
            )}
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              className={styles.hiddenFileInput}
              onChange={handleImportExcel}
            />
          </div>
        </div>
      </div>

      <div className={styles.tableToolbar}>
        <label className={styles.tableSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="T&#236;m ki&#7871;m t&#234;n l&#7899;p, m&#227; l&#7899;p, m&#227; m&#244;n..."
            aria-label="T&#236;m ki&#7871;m l&#7899;p"
          />
        </label>
        <label className={styles.classFilter}>
          <span>L&#7899;p</span>
          <select
            value={classFilter}
            onChange={(event) => setClassFilter(event.target.value)}
          >
            <option value="all">T&#7845;t c&#7843; l&#7899;p</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.classCode}>
                {cls.name} ({cls.classCode})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.classTable}>
          <thead>
            <tr>
              <th className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả lớp"
                  checked={
                    filteredClasses.length > 0 &&
                    filteredClasses.every((cls) =>
                      selectedClassIds.includes(cls.id),
                    )
                  }
                  onChange={toggleAllClasses}
                />
              </th>
              <th>Mã lớp</th>
              <th>Tên lớp</th>
              <th>Thời gian</th>
              <th>Sĩ số</th>
              <th>Số giờ học (đã học / tổng số)</th>
              <th className={styles.actionsCell}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={styles.tableEmpty} colSpan={7}>
                  <span>Đang tải danh sách lớp...</span>
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td className={styles.tableEmpty} colSpan={7}>
                  <span>Không thể tải danh sách lớp. Vui lòng thử lại.</span>
                </td>
              </tr>
            ) : filteredClasses.length === 0 ? (
              <tr>
                <td className={styles.tableEmpty} colSpan={7}>
                  <BookOpen size={24} aria-hidden="true" />
                  <span>Chưa có lớp học nào.</span>
                </td>
              </tr>
            ) : (
              filteredClasses.map((cls) => (
                <tr
                  key={cls.id}
                  className={
                    selectedClassIds.includes(cls.id) ? styles.selectedRow : ""
                  }
                >
                  <td className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      aria-label={`Chọn lớp ${cls.classCode}`}
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={() => toggleClassSelection(cls.id)}
                    />
                  </td>
                  <td>
                    <span className={styles.classCodeBadge}>
                      {cls.classCode}
                    </span>
                  </td>
                  <td>
                    <div className={styles.classNameCell}>{cls.name}</div>
                    {cls.description && (
                      <div className={styles.classDescriptionCell}>
                        {cls.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className={styles.scheduleCell}>
                      <span>{cls.weekday || "?"}</span>
                      <span>
                        {cls.startTime && cls.endTime
                          ? `${cls.startTime} - ${cls.endTime}`
                          : cls.classTime || "?"}
                      </span>
                    </div>
                  </td>
                  <td>{cls.studentCount ?? 0}</td>
                  <td>
                    <span className={styles.hoursValue}>
                      {cls.hoursLearned ?? "?"}
                    </span>
                    <span className={styles.hoursDivider}> / </span>
                    <span>{cls.hours ?? "?"} giờ</span>
                  </td>
                  <td className={styles.actionsCell}>
                    <div
                      className={styles.tableActionMenu}
                      data-class-actions={cls.id}
                    >
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={(event) => {
                          if (openActionsClassId === cls.id) {
                            setOpenActionsClassId(null);
                            return;
                          }
                          const bounds =
                            event.currentTarget.getBoundingClientRect();
                          const menuHeight = 190;
                          setOpenActionsPosition({
                            top:
                              bounds.bottom + menuHeight <= window.innerHeight
                                ? bounds.bottom + 6
                                : Math.max(8, bounds.top - menuHeight - 6),
                            right: window.innerWidth - bounds.right,
                          });
                          setOpenActionsClassId(cls.id);
                        }}
                        title="Thao tác"
                        aria-label={`Thao tác lớp ${cls.classCode}`}
                        aria-haspopup="menu"
                        aria-expanded={openActionsClassId === cls.id}
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openActionsClassId === cls.id && (
                        <div
                          className={styles.tableActionDropdown}
                          style={
                            openActionsPosition
                              ? {
                                  top: openActionsPosition.top,
                                  right: openActionsPosition.right,
                                }
                              : undefined
                          }
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionsClassId(null);
                              handleViewDetail(cls.classCode);
                            }}
                          >
                            <Eye size={16} /> Xem chi tiết
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionsClassId(null);
                              handleOpenEditModal(cls);
                            }}
                          >
                            <Edit size={16} /> Chỉnh sửa
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenActionsClassId(null);
                              void openSessionsModal(cls);
                            }}
                          >
                            <Upload size={16} /> Lịch học &amp; bài giảng
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.tableActionDelete}
                            onClick={() => {
                              setOpenActionsClassId(null);
                              void handleDeleteClass(cls.id);
                            }}
                          >
                            <Trash2 size={16} /> Xóa lớp
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <AddClass
          editingClass={editingClass}
          saving={saving}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSaveClass}
        />
      )}

      {sessionsModal.open && (
        <ClassSessionsModal
          className={sessionsModal.className}
          sessions={classSessions}
          loading={sessionsLoading}
          uploadingScheduleId={uploadingScheduleId}
          onClose={closeSessionsModal}
          onUpload={handleUploadSlides}
        />
      )}
    </div>
  );
}
