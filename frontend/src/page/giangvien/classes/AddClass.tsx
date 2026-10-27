import { useEffect, useRef, useState } from "react";
import { Check, Clock3, Plus, Trash2, Upload, X } from "lucide-react";
import type {
  ClassFormData,
  ClassItem,
  ClassScheduleDateRange,
  WeeklyScheduleDraft,
} from "./classTypes";
import { WEEKDAY_OPTIONS } from "./classTypes";
import styles from "./class.module.css";

type AddClassProps = {
  editingClass: ClassItem | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (
    formData: ClassFormData,
    dateRange: ClassScheduleDateRange,
    weeklySchedules: WeeklyScheduleDraft[],
  ) => void;
};

const EMPTY_FORM: ClassFormData = {
  courseCode: "",
  name: "",
  hours: "",
  description: "",
};

const EMPTY_SCHEDULE: WeeklyScheduleDraft = {
  weekday: "",
  startTime: "",
  endTime: "",
  lectureFile: null,
};

const LECTURE_FILE_TYPES = ".pdf,.ppt,.pptx,.doc,.docx,.odt,.odp";

const normalizeTimeInput = (value: string, allowShortDigits = false) => {
  const trimmed = value.trim();
  const digitsOnly = trimmed.match(/^\d{4}$/)?.[0];
  const shortDigits =
    allowShortDigits ? trimmed.match(/^\d{3}$/)?.[0] : undefined;
  const parts = digitsOnly
    ? [digitsOnly.slice(0, 2), digitsOnly.slice(2)]
    : shortDigits
      ? [shortDigits.slice(0, 1), shortDigits.slice(1)]
    : trimmed.match(/^(\d{1,2}):(\d{2})$/)?.slice(1);
  if (!parts) return value;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (hours > 23 || minutes > 59) return value;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const isValidTime = (value: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

const nextAvailableTime = (value: string) => {
  if (!isValidTime(value)) return "";
  const [hours, minutes] = value.split(":").map(Number);
  const nextMinute = hours * 60 + minutes + 1;
  if (nextMinute > 23 * 60 + 59) return "";
  return `${String(Math.floor(nextMinute / 60)).padStart(2, "0")}:${String(
    nextMinute % 60,
  ).padStart(2, "0")}`;
};

type TimeFieldProps = {
  id: string;
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
};

function TimeField({ id, label, value, min, onChange }: TimeFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerWrapRef = useRef<HTMLDivElement>(null);
  const isCurrentValueValid = isValidTime(value);
  const [valueHour, valueMinute] = isCurrentValueValid
    ? value.split(":")
    : [min?.slice(0, 2) ?? "00", min?.slice(3) ?? "00"];
  const selectedHour = valueHour || "00";
  const selectedMinute = valueMinute || "00";
  const hours = Array.from({ length: 24 }, (_, hour) =>
    String(hour).padStart(2, "0"),
  );
  const minutes = Array.from({ length: 60 }, (_, minute) =>
    String(minute).padStart(2, "0"),
  );
  const availableHours = hours.filter((hour) =>
    minutes.some((minute) => !min || `${hour}:${minute}` >= min),
  );
  const availableMinutes = minutes.filter(
    (minute) => !min || `${selectedHour}:${minute}` >= min,
  );

  useEffect(() => {
    if (!isPickerOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerWrapRef.current?.contains(event.target)
      ) {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isPickerOpen]);

  return (
    <div className={styles.formGroup}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.timeInputWrap} ref={pickerWrapRef}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:MM"
          maxLength={5}
          title="Nhập HHMM hoặc HH:MM theo định dạng 24 giờ, ví dụ 1300 hoặc 13:00"
          value={value}
          onChange={(event) => onChange(normalizeTimeInput(event.target.value))}
          onBlur={(event) =>
            onChange(normalizeTimeInput(event.currentTarget.value, true))
          }
          required
        />
        <button
          type="button"
          className={styles.timePickerButton}
          aria-label={`Mở bộ chọn ${label.toLowerCase()}`}
          aria-expanded={isPickerOpen}
          aria-controls={`${id}-picker`}
          onClick={() => setIsPickerOpen((open) => !open)}
        >
          <Clock3 size={18} aria-hidden="true" />
        </button>
        {isPickerOpen && (
          <div
            id={`${id}-picker`}
            className={styles.timePickerPopover}
            role="group"
            aria-label={`Chọn ${label.toLowerCase()}`}
          >
            <div className={styles.timePickerColumn}>
              <span className={styles.timePickerColumnHeading}>Giờ</span>
              <div className={styles.timePickerOptions}>
                {availableHours.map((hour) => (
                  <button
                    type="button"
                    key={hour}
                    className={
                      hour === selectedHour ? styles.timePickerSelected : ""
                    }
                    aria-pressed={hour === selectedHour}
                    onClick={() => {
                      const minute = minutes.find(
                        (candidate) => !min || `${hour}:${candidate}` >= min,
                      );
                      if (minute) onChange(`${hour}:${minute}`);
                    }}
                  >
                    {hour}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.timePickerColumn}>
              <span className={styles.timePickerColumnHeading}>Phút</span>
              <div className={styles.timePickerOptions}>
                {availableMinutes.map((minute) => (
                  <button
                    type="button"
                    key={minute}
                    className={
                      minute === selectedMinute
                        ? styles.timePickerSelected
                        : ""
                    }
                    aria-pressed={minute === selectedMinute}
                    onClick={() => {
                      onChange(`${selectedHour}:${minute}`);
                      setIsPickerOpen(false);
                    }}
                  >
                    {minute}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AddClass({
  editingClass,
  saving,
  onClose,
  onSubmit,
}: AddClassProps) {
  const [formData, setFormData] = useState<ClassFormData>(
    editingClass
      ? {
          courseCode: editingClass.courseCode ?? "",
          name: editingClass.name ?? "",
          hours: editingClass.hours ? String(editingClass.hours) : "",
          description: editingClass.description ?? "",
        }
      : { ...EMPTY_FORM },
  );
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklyScheduleDraft[]>(
    [{ ...EMPTY_SCHEDULE }],
  );
  const [dateRange, setDateRange] = useState<ClassScheduleDateRange>({
    startDate: "",
    endDate: "",
  });

  const updateSchedule = (
    index: number,
    update: Partial<WeeklyScheduleDraft>,
  ) => {
    setWeeklySchedules((current) =>
      current.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, ...update } : schedule,
      ),
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingClass) {
      if (
        !dateRange.startDate ||
        !dateRange.endDate ||
        dateRange.endDate < dateRange.startDate
      ) {
        alert("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
        return;
      }

      if (weeklySchedules.length === 0 || weeklySchedules.length > 21) {
        alert("Vui lòng thêm từ 1 đến 21 buổi học mỗi tuần.");
        return;
      }

      const normalizedSchedules = weeklySchedules.map((schedule) => ({
        ...schedule,
        startTime: normalizeTimeInput(schedule.startTime, true),
        endTime: normalizeTimeInput(schedule.endTime, true),
      }));
      const hasInvalidSchedule = normalizedSchedules.some(
        ({ weekday, startTime, endTime }) =>
          !weekday ||
          !isValidTime(startTime) ||
          !isValidTime(endTime) ||
          startTime >= endTime,
      );
      if (hasInvalidSchedule) {
        alert("Giờ kết thúc phải sau giờ bắt đầu.");
        return;
      }

      const uniqueSlots = new Set(
        normalizedSchedules.map(
          ({ weekday, startTime }) => `${weekday}-${startTime}`,
        ),
      );
      if (uniqueSlots.size !== weeklySchedules.length) {
        alert("Không thể tạo nhiều buổi trùng thứ và giờ bắt đầu.");
        return;
      }
      onSubmit(formData, dateRange, normalizedSchedules);
      return;
    }

    onSubmit(formData, dateRange, weeklySchedules);
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalContent} ${styles.addClassModal}`}>
        <div className={styles.modalHeader}>
          <h2>{editingClass ? "Chỉnh sửa lớp học" : "Thêm lớp học mới"}</h2>
          <button
            type="button"
            className={styles.closeModalBtn}
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label htmlFor="class-course-code">Mã môn học *</label>
            <input
              id="class-course-code"
              type="text"
              placeholder="Ví dụ: 3650"
              value={formData.courseCode}
              onChange={(event) =>
                setFormData({ ...formData, courseCode: event.target.value })
              }
              required
              disabled={Boolean(editingClass)}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="class-name">Tên môn học *</label>
            <input
              id="class-name"
              type="text"
              placeholder="Ví dụ: Lập trình Web nâng cao"
              value={formData.name}
              onChange={(event) =>
                setFormData({ ...formData, name: event.target.value })
              }
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="class-hours">Số giờ học *</label>
            <input
              id="class-hours"
              type="number"
              min="0.5"
              step="0.5"
              placeholder="Ví dụ: 3"
              value={formData.hours}
              onChange={(event) =>
                setFormData({ ...formData, hours: event.target.value })
              }
              required
            />
          </div>

          {!editingClass && (
            <div className={styles.weeklyScheduleSection}>
              <div className={styles.classDateRange}>
                <div className={styles.formGroup}>
                  <label htmlFor="class-start-date">Ngày bắt đầu *</label>
                  <input
                    id="class-start-date"
                    type="date"
                    value={dateRange.startDate}
                    onChange={(event) =>
                      setDateRange((current) => ({
                        startDate: event.target.value,
                        endDate:
                          current.endDate &&
                          current.endDate < event.target.value
                            ? ""
                            : current.endDate,
                      }))
                    }
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="class-end-date">Ngày kết thúc *</label>
                  <input
                    id="class-end-date"
                    type="date"
                    min={dateRange.startDate || undefined}
                    value={dateRange.endDate}
                    onChange={(event) =>
                      setDateRange((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className={styles.weeklyScheduleHeading}>
                <div>
                  <strong>Lịch học hàng tuần *</strong>
                  <span>
                    Các buổi sẽ lặp theo thứ và giờ đã chọn trong khoảng ngày
                    trên.
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() =>
                    setWeeklySchedules((current) => [
                      ...current,
                      { ...EMPTY_SCHEDULE },
                    ])
                  }
                  disabled={weeklySchedules.length >= 21}
                >
                  <Plus size={16} /> Thêm buổi
                </button>
              </div>
              {weeklySchedules.map((schedule, index) => (
                <div className={styles.weeklyScheduleRow} key={index}>
                  <div className={styles.formGroup}>
                    <label htmlFor={`schedule-weekday-${index}`}>
                      Buổi {index + 1} · Thứ *
                    </label>
                    <select
                      id={`schedule-weekday-${index}`}
                      value={schedule.weekday}
                      onChange={(event) =>
                        updateSchedule(index, { weekday: event.target.value })
                      }
                      required
                    >
                      <option value="">— Chọn thứ —</option>
                      {WEEKDAY_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <TimeField
                    id={`schedule-start-${index}`}
                    label="Giờ bắt đầu *"
                    value={schedule.startTime}
                    onChange={(startTime) => {
                      const endTime =
                        isValidTime(schedule.endTime) &&
                        schedule.endTime <= startTime
                          ? ""
                          : schedule.endTime;
                      updateSchedule(index, { startTime, endTime });
                    }}
                  />
                  <TimeField
                    id={`schedule-end-${index}`}
                    label="Giờ kết thúc *"
                    value={schedule.endTime}
                    min={nextAvailableTime(schedule.startTime) || undefined}
                    onChange={(endTime) => updateSchedule(index, { endTime })}
                  />
                  <div className={styles.scheduleLectureFile}>
                    <label htmlFor={`schedule-file-${index}`}>
                      Bài giảng (không bắt buộc)
                    </label>
                    <div className={styles.scheduleFileControl}>
                      <label
                        className={styles.uploadLabel}
                        htmlFor={`schedule-file-${index}`}
                      >
                        <Upload size={14} />
                        {schedule.lectureFile
                          ? schedule.lectureFile.name
                          : "Chọn file bài giảng"}
                        <input
                          id={`schedule-file-${index}`}
                          type="file"
                          accept={LECTURE_FILE_TYPES}
                          onChange={(event) =>
                            updateSchedule(index, {
                              lectureFile: event.target.files?.[0] ?? null,
                            })
                          }
                        />
                      </label>
                      {weeklySchedules.length > 1 && (
                        <button
                          type="button"
                          className={styles.removeScheduleBtn}
                          aria-label={`Xóa buổi ${index + 1}`}
                          onClick={() =>
                            setWeeklySchedules((current) =>
                              current.filter(
                                (_, scheduleIndex) => scheduleIndex !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <p className={styles.formHint}>
                Hỗ trợ PDF, PowerPoint và Word. File sẽ được gắn với buổi học
                tương ứng sau khi tạo lớp.
              </p>
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="class-description">
              Mô tả / Ghi chú (không bắt buộc)
            </label>
            <textarea
              id="class-description"
              placeholder="Nhập mô tả môn học hoặc thông tin giảng dạy..."
              value={formData.description}
              onChange={(event) =>
                setFormData({ ...formData, description: event.target.value })
              }
              rows={3}
            />
          </div>
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={saving}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving}
            >
              <Check size={16} />{" "}
              {saving
                ? "Đang lưu..."
                : editingClass
                  ? "Lưu thay đổi"
                  : "Tạo lớp học"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
