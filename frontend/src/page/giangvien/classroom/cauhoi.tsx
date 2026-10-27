import axios from "axios";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CircleHelp,
  ImagePlus,
  Loader2,
  Mic,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../services/api";
import styles from "./cauhoi.module.css";

type QuestionType =
  | "POLL"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "ORDERING"
  | "MATCHING";
type Option = {
  id?: string;
  text: string;
  isCorrect: boolean;
  imageDataUrl: string | null;
  imageName: string | null;
  hasImage?: boolean;
};
type Pair = { left: string; right: string };
type SavedQuestion = {
  id: string;
  question: string;
  questionType: QuestionType;
  payload: { pairs?: Pair[]; correctOrder?: string[] };
  options: Option[];
  createdAt: string;
};
type SessionInfo = {
  title: string;
  className: string;
  status: "upcoming" | "live" | "ended";
};

const TYPES: { id: QuestionType; name: string; description: string }[] = [
  { id: "POLL", name: "Hỏi nhanh", description: "Khảo sát ngắn, không cần đáp án đúng." },
  { id: "MULTIPLE_CHOICE", name: "Chọn đáp án", description: "Chọn một đáp án đúng; có thể dùng ảnh." },
  { id: "TRUE_FALSE", name: "Đúng / Sai", description: "Chọn đúng hoặc sai." },
  { id: "ORDERING", name: "Sắp xếp", description: "Sắp các mục theo thứ tự đúng." },
  { id: "MATCHING", name: "Nối đôi", description: "Ghép các mục ở hai cột." },
  { id: "SHORT_ANSWER", name: "Trả lời ngắn", description: "Sinh viên nhập câu trả lời." },
];
const emptyOption = (text = ""): Option => ({
  text,
  isCorrect: false,
  imageDataUrl: null,
  imageName: null,
});
const errorText = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: string; msg?: string }>(error)) {
    return error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu.";
  }
  return (
    error.response?.data?.message ||
    error.response?.data?.msg ||
    "Không thể hoàn tất yêu cầu."
  );
};
const fileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Không thể đọc file ảnh."));
    reader.onerror = () => reject(new Error("Không thể đọc file ảnh."));
    reader.readAsDataURL(file);
  });

export default function LecturerQuestionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([]);
  const [questionType, setQuestionType] = useState<QuestionType>("POLL");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<Option[]>([emptyOption(), emptyOption()]);
  const [pairs, setPairs] = useState<Pair[]>([
    { left: "", right: "" },
    { left: "", right: "" },
  ]);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(
    sessionId ? "" : "Không có mã phiên học trong địa chỉ trang.",
  );
  const [success, setSuccess] = useState("");
  const [micMessage, setMicMessage] = useState(false);

  const loadData = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [sessionResponse, questionsResponse] = await Promise.all([
        api.get<{ session: SessionInfo }>(
          `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}`,
        ),
        api.get<{ questions: SavedQuestion[] }>(
          `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/quick-questions`,
        ),
      ]);
      setSession(sessionResponse.data.session);
      setSavedQuestions(questionsResponse.data.questions);
      setError("");
    } catch (loadError: unknown) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData, sessionId]);

  const selectType = (type: QuestionType) => {
    setQuestionType(type);
    setError("");
    setOptions(
      type === "TRUE_FALSE"
        ? [{ ...emptyOption("Đúng"), isCorrect: true }, emptyOption("Sai")]
        : [emptyOption(), emptyOption()],
    );
    if (type === "MATCHING") {
      setPairs([
        { left: "", right: "" },
        { left: "", right: "" },
      ]);
    }
  };

  const editOption = (index: number, patch: Partial<Option>) =>
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );

  const handleImage = async (index: number, file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Ảnh lựa chọn chỉ hỗ trợ JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Dung lượng mỗi ảnh tối đa 2 MB.");
      return;
    }
    try {
      editOption(index, {
        imageDataUrl: await fileAsDataUrl(file),
        imageName: file.name,
      });
      setError("");
    } catch (readError: unknown) {
      setError(errorText(readError));
    }
  };

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.post(
        `/auth/lecturer/sessions/${encodeURIComponent(sessionId)}/quick-questions`,
        {
          question,
          questionType,
          options:
            questionType === "SHORT_ANSWER"
              ? []
              : options.map((option) => ({ ...option, text: option.text.trim() })),
          pairs:
            questionType === "MATCHING"
              ? pairs.map((pair) => ({
                  left: pair.left.trim(),
                  right: pair.right.trim(),
                }))
              : undefined,
        },
      );
      setQuestion("");
      setSuccess("Đã thêm câu hỏi vào buổi học.");
      await loadData();
    } catch (saveError: unknown) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const typeName = (type: QuestionType) =>
    TYPES.find((item) => item.id === type)?.name || type;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            navigate(`/giangvien/classroom/${encodeURIComponent(sessionId || "")}/offline`)
          }
        >
          <ArrowLeft size={17} /> Quay lại phòng học
        </button>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>TƯƠNG TÁC TRONG BUỔI HỌC</span>
          <h1>Tạo câu hỏi nhanh</h1>
          <p>
            {session?.className || "Lớp học"}
            {session?.title ? ` · ${session.title}` : ""}
          </p>
        </div>
        {session && (
          <span className={styles.status}>
            {session.status === "live" ? "Đang diễn ra" : session.status}
          </span>
        )}
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
      )}
      {success && <div className={styles.successBanner} role="status">{success}</div>}

      <div className={styles.layout}>
        <section className={styles.builder}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>BƯỚC 1</span><h2>Chọn dạng câu hỏi</h2></div>
          </div>
          <div className={styles.typeGrid}>
            {TYPES.map((type) => (
              <button
                type="button"
                key={type.id}
                className={`${styles.typeCard} ${type.id === questionType ? styles.typeActive : ""}`}
                onClick={() => selectType(type.id)}
              >
                <strong>{type.name}</strong><span>{type.description}</span>
              </button>
            ))}
          </div>

          <form onSubmit={(event) => void submitQuestion(event)}>
            <div className={styles.questionLabel}>
              <label className={styles.fieldLabel} htmlFor="question-text">Nội dung câu hỏi</label>
              <button type="button" className={styles.micButton} onClick={() => setMicMessage(true)}>
                <Mic size={16} /> Nói câu hỏi
              </button>
            </div>
            <textarea
              id="question-text"
              className={styles.questionInput}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Nhập câu hỏi ngắn gọn..."
              maxLength={500}
              rows={3}
              required
            />
            {micMessage && (
              <p className={styles.helperNotice} role="status">
                Mic sẽ được tích hợp sau; hiện tại trang chưa thu âm.
              </p>
            )}

            {questionType === "MATCHING" ? (
              <section className={styles.answers}>
                <div className={styles.answersHeading}>
                  <div><span className={styles.eyebrow}>BƯỚC 2</span><h3>Các cặp cần nối</h3></div>
                  {pairs.length < 8 && (
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => setPairs((items) => [...items, { left: "", right: "" }])}
                    >
                      <Plus size={16} /> Thêm cặp
                    </button>
                  )}
                </div>
                <div className={styles.pairLabels}><span>Cột A</span><span>Cột B</span></div>
                {pairs.map((pair, index) => (
                  <div className={styles.pairRow} key={index}>
                    <span className={styles.indexBadge}>{index + 1}</span>
                    <input
                      value={pair.left}
                      onChange={(event) => setPairs((items) => items.map((item, i) =>
                        i === index ? { ...item, left: event.target.value } : item))}
                      placeholder={`Mục ${index + 1}`}
                      maxLength={200}
                      required
                    />
                    <span className={styles.matchMark}>↔</span>
                    <input
                      value={pair.right}
                      onChange={(event) => setPairs((items) => items.map((item, i) =>
                        i === index ? { ...item, right: event.target.value } : item))}
                      placeholder="Nối với..."
                      maxLength={200}
                      required
                    />
                    {pairs.length > 2 && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => setPairs((items) => items.filter((_, i) => i !== index))}
                        aria-label={`Xóa cặp ${index + 1}`}
                      ><Trash2 size={16} /></button>
                    )}
                  </div>
                ))}
                <p className={styles.helperText}>Các cặp được lưu làm đáp án đúng.</p>
              </section>
            ) : questionType === "SHORT_ANSWER" ? (
              <p className={styles.shortHint}>Sinh viên nhập câu trả lời ngắn; không cần thêm lựa chọn.</p>
            ) : (
              <section className={styles.answers}>
                <div className={styles.answersHeading}>
                  <div>
                    <span className={styles.eyebrow}>BƯỚC 2</span>
                    <h3>{questionType === "ORDERING" ? "Thứ tự đúng" : "Lựa chọn trả lời"}</h3>
                  </div>
                  {questionType !== "TRUE_FALSE" && options.length < 8 && (
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={() => setOptions((items) => [...items, emptyOption()])}
                    ><Plus size={16} /> Thêm lựa chọn</button>
                  )}
                </div>
                {questionType === "POLL" && <p className={styles.helperText}>Câu hỏi khảo sát không có đáp án đúng.</p>}
                {questionType === "ORDERING" && <p className={styles.helperText}>Sắp xếp mục theo đáp án đúng bằng các nút mũi tên.</p>}
                {options.map((option, index) => (
                  <div className={styles.optionRow} key={index}>
                    {questionType === "ORDERING" ? (
                      <span className={styles.indexBadge}>{index + 1}</span>
                    ) : questionType === "POLL" ? (
                      <span className={styles.choiceBadge}>{String.fromCharCode(65 + index)}</span>
                    ) : (
                      <input
                        type="radio"
                        className={styles.correctRadio}
                        name="correct-answer"
                        checked={option.isCorrect}
                        onChange={() =>
                          setOptions((items) =>
                            items.map((item, i) => ({
                              ...item,
                              isCorrect: i === index,
                            })),
                          )
                        }
                        aria-label={`Đáp án đúng ${index + 1}`}
                      />
                    )}
                    {questionType === "TRUE_FALSE" ? (
                      <span className={styles.fixedChoice}>{option.text}</span>
                    ) : (
                      <input
                        className={styles.optionInput}
                        value={option.text}
                        onChange={(event) => setOptions((items) => items.map((item, i) =>
                          i === index ? { ...item, text: event.target.value } : item))}
                        placeholder={questionType === "ORDERING" ? `Mục ${index + 1}` : `Lựa chọn ${index + 1}`}
                        maxLength={200}
                        required={!option.imageDataUrl}
                      />
                    )}
                    {questionType === "MULTIPLE_CHOICE" && (
                      <label className={styles.imageButton}>
                        <ImagePlus size={16} /><span>{option.imageName ? "Đổi ảnh" : "Thêm ảnh"}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void handleImage(index, file);
                          }}
                        />
                      </label>
                    )}
                    {questionType === "ORDERING" && (
                      <div className={styles.orderButtons}>
                        <button type="button" disabled={index === 0} onClick={() => setOptions((items) => {
                          const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next;
                        })} aria-label="Di chuyển lên"><ArrowUp size={15} /></button>
                        <button type="button" disabled={index === options.length - 1} onClick={() => setOptions((items) => {
                          const next = [...items]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next;
                        })} aria-label="Di chuyển xuống"><ArrowDown size={15} /></button>
                      </div>
                    )}
                    {questionType !== "TRUE_FALSE" && questionType !== "ORDERING" && options.length > 2 && (
                      <button type="button" className={styles.iconButton} onClick={() =>
                        setOptions((items) => items.filter((_, i) => i !== index))}
                        aria-label={`Xóa lựa chọn ${index + 1}`}><Trash2 size={16} /></button>
                    )}
                    {option.imageDataUrl && (
                      <span className={styles.imagePreview}>
                        <img src={option.imageDataUrl} alt={option.imageName || "Ảnh lựa chọn"} />
                        <button type="button" onClick={() => editOption(index, {
                          imageDataUrl: null, imageName: null,
                        })} aria-label="Xóa ảnh"><X size={14} /></button>
                      </span>
                    )}
                  </div>
                ))}
                {questionType === "MULTIPLE_CHOICE" && (
                  <p className={styles.helperText}>Chọn nút tròn để đánh dấu đáp án đúng. Sinh viên có thể chọn hình ảnh làm đáp án. Mỗi ảnh tối đa 2 MB.</p>
                )}
                {questionType === "TRUE_FALSE" && <p className={styles.helperText}>Chọn nút tròn cạnh Đúng hoặc Sai làm đáp án.</p>}
              </section>
            )}

            <div className={styles.formFooter}>
              <button type="button" className={styles.cancelButton} onClick={() =>
                navigate(`/giangvien/classroom/${encodeURIComponent(sessionId || "")}/offline`)}>
                Hủy
              </button>
              <button type="submit" className={styles.submitButton}
                disabled={saving || loading || session?.status !== "live"}>
                {saving ? <Loader2 size={17} className={styles.spinner} /> : <Save size={17} />}
                {saving ? "Đang lưu..." : "Thêm câu hỏi vào buổi học"}
              </button>
            </div>
            {session && session.status !== "live" && (
              <p className={styles.helperNotice}>Chỉ có thể thêm câu hỏi khi buổi học đang diễn ra.</p>
            )}
          </form>
        </section>

        <aside className={styles.savedCard}>
          <div className={styles.sectionHeading}>
            <div><span className={styles.eyebrow}>BUỔI HỌC NÀY</span><h2>Câu hỏi đã tạo</h2></div>
            <span className={styles.countBadge}>{savedQuestions.length}</span>
          </div>
          {loading ? (
            <p className={styles.helperText}>Đang tải câu hỏi...</p>
          ) : savedQuestions.length ? (
            <div className={styles.savedList}>
              {savedQuestions.map((item) => (
                <article className={styles.savedQuestion} key={item.id}>
                  <div className={styles.savedMeta}>
                    <span>{typeName(item.questionType)}</span>
                    <span>{new Intl.DateTimeFormat("vi-VN", {
                      hour: "2-digit", minute: "2-digit",
                    }).format(new Date(item.createdAt))}</span>
                  </div>
                  <strong>{item.question}</strong>
                  {item.questionType === "MATCHING" ? (
                    <small>{item.payload.pairs?.length || 0} cặp nối</small>
                  ) : item.options.length ? (
                    <div className={styles.savedOptions}>
                      {item.options.map((option, index) => (
                        <span key={option.id || index}>
                          {option.hasImage && (
                            <span className={styles.savedImageTag}>
                              <ImagePlus size={13} />
                              {option.imageName || "Ảnh đáp án"}
                            </span>
                          )}
                          {option.text}{option.isCorrect && <Check size={13} className={styles.correctIcon} />}
                        </span>
                      ))}
                    </div>
                  ) : <small>Câu trả lời ngắn</small>}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}><CircleHelp size={25} /><span>Chưa có câu hỏi nào.</span></div>
          )}
          <button className={styles.returnButton} type="button" onClick={() =>
            navigate(`/giangvien/classroom/${encodeURIComponent(sessionId || "")}/offline`)}>
            <ArrowLeft size={16} /> Quay lại phòng học
          </button>
        </aside>
      </div>
    </main>
  );
}