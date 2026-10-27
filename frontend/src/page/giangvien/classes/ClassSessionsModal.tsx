import { Upload, X } from "lucide-react";
import type { ClassSessionItem } from "./classTypes";
import styles from "./class.module.css";

type ClassSessionsModalProps = {
  className: string;
  sessions: ClassSessionItem[];
  loading: boolean;
  uploadingScheduleId: string | null;
  onClose: () => void;
  onUpload: (
    scheduleId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
};

export default function ClassSessionsModal({
  className,
  sessions,
  loading,
  uploadingScheduleId,
  onClose,
  onUpload,
}: ClassSessionsModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalContent} ${styles.sessionsModal}`}>
        <div className={styles.modalHeader}>
          <h2>Lịch học & bài giảng — {className}</h2>
          <button
            type="button"
            className={styles.closeModalBtn}
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>
        <div className={styles.sessionsBody}>
          {loading ? (
            <p className={styles.sessionsMessage}>Đang tải buổi học...</p>
          ) : sessions.length === 0 ? (
            <p className={styles.sessionsMessage}>
              Lớp này chưa có buổi học nào trong thời khoá biểu.
            </p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className={styles.sessionRow}>
                <div className={styles.sessionInfo}>
                  <strong>{session.title}</strong>
                  <span>
                    {session.weekday || "Lịch đơn"}
                    {session.dateLabel ? `, ${session.dateLabel}` : ""} ·{" "}
                    {session.startTimeLabel} - {session.endTimeLabel}
                    {session.recurring ? " · Lặp hằng tuần" : ""}
                  </span>
                  {session.room && <span>Phòng: {session.room}</span>}
                </div>
                <div className={styles.sessionUpload}>
                  {session.hasSlides && (
                    <span className={styles.slidesBadge}>Đã có bài giảng</span>
                  )}
                  <label
                    className={styles.uploadLabel}
                    aria-label="Tải bài giảng lên cho buổi này"
                  >
                    <Upload size={14} />
                    {uploadingScheduleId === session.id
                      ? "Đang tải..."
                      : "Import bài giảng"}
                    <input
                      type="file"
                      accept=".pdf,.ppt,.pptx,.doc,.docx,.odt,.odp"
                      disabled={uploadingScheduleId === session.id}
                      onChange={(event) => onUpload(session.id, event)}
                    />
                  </label>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
