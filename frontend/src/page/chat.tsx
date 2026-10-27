import axios from "axios";
import { ArrowLeft, Loader2, MessageSquareText, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import styles from "./chat.module.css";

type ChatMessage = {
  id: string;
  text: string;
  createdAt: string;
  senderRole: "STUDENT" | "LECTURER" | "SYSTEM";
  senderName: string;
  senderEmail?: string | null;
  isOwnMessage: boolean;
};

type ChatResponse = {
  session: { id: string; className: string };
  canSend: boolean;
  messages: ChatMessage[];
};

const getErrorMessage = (error: unknown) =>
  axios.isAxiosError<{ message?: string; msg?: string }>(error)
    ? error.response?.data?.message ||
      error.response?.data?.msg ||
      "Không thể tải chat. Vui lòng thử lại."
    : "Không thể tải chat. Vui lòng thử lại.";

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null") as {
      role?: string;
    } | null;
  } catch {
    return null;
  }
};

export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const role = readStoredUser()?.role;
  const isLecturer = role === "giang_vien";
  const basePath = isLecturer ? "/giangvien" : "/sinhvien";
  const [sessionName, setSessionName] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [canSend, setCanSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const loadingRef = useRef(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);

  const loadMessages = useCallback(async () => {
    if (!sessionId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data } = await api.get<ChatResponse>(
        `/auth/sessions/${encodeURIComponent(sessionId)}/chat`,
      );
      setSessionName(data.session.className);
      setCanSend(data.canSend);
      setMessages((currentMessages) => {
        const messagesAreUnchanged =
          currentMessages.length === data.messages.length &&
          currentMessages.every(
            (message, index) => message.id === data.messages[index]?.id,
          );
        return messagesAreUnchanged ? currentMessages : data.messages;
      });
      setErrorMessage("");
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void loadMessages(), 0);
    const intervalId = window.setInterval(() => void loadMessages(), 3000);
    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [loadMessages]);

  useEffect(() => {
    if (followLatestRef.current) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = async () => {
    const trimmedMessage = messageText.trim();
    if (!sessionId || !trimmedMessage || !canSend || sending) return;

    setSending(true);
    setErrorMessage("");
    try {
      await api.post(
        `/auth/sessions/${encodeURIComponent(sessionId)}/chat`,
        { message: trimmedMessage },
      );
      setMessageText("");
      followLatestRef.current = true;
      await loadMessages();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() =>
            isLecturer
              ? navigate(
                  `${basePath}/classroom/${encodeURIComponent(sessionId || "")}/offline`,
                )
              : navigate(-1)
          }
        >
          <ArrowLeft size={18} />
          <span>Quay lại</span>
        </button>
        <div className={styles.heading}>
          <MessageSquareText size={22} />
          <div>
            <h1>Chat buổi học</h1>
            <p>{sessionName || "Đang tải lớp học..."}</p>
          </div>
        </div>
        <span className={canSend ? styles.liveBadge : styles.closedBadge}>
          {canSend ? "Đang diễn ra" : "Chỉ xem"}
        </span>
      </header>

      <section className={styles.chatPanel} aria-label="Tin nhắn buổi học">
        <div
          className={styles.messageList}
          ref={messageListRef}
          onScroll={() => {
            const element = messageListRef.current;
            if (element) {
              followLatestRef.current =
                element.scrollHeight - element.scrollTop - element.clientHeight <
                64;
            }
          }}
        >
          {loading && messages.length === 0 ? (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={22} />
              Đang tải tin nhắn...
            </div>
          ) : messages.length === 0 ? (
            <div className={styles.emptyState}>
              <MessageSquareText size={32} />
              <strong>Chưa có tin nhắn</strong>
              <span>Bắt đầu cuộc trò chuyện của buổi học tại đây.</span>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`${styles.message} ${
                  message.isOwnMessage ? styles.ownMessage : ""
                }`}
              >
                <div className={styles.messageMeta}>
                  <strong>{message.senderName}</strong>
                  {isLecturer && message.senderEmail && (
                    <span>{message.senderEmail}</span>
                  )}
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{message.text}</p>
              </article>
            ))
          )}
          <div ref={endOfMessagesRef} />
        </div>

        {errorMessage && (
          <div className={styles.error} role="alert">
            {errorMessage}
          </div>
        )}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              canSend
                ? "Nhập tin nhắn... (Enter để gửi)"
                : "Chat chỉ gửi được khi buổi học đang diễn ra."
            }
            maxLength={2000}
            rows={2}
            disabled={!canSend || sending}
            aria-label="Nội dung tin nhắn"
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!canSend || !messageText.trim() || sending}
          >
            {sending ? (
              <Loader2 className={styles.spinner} size={18} />
            ) : (
              <Send size={18} />
            )}
            <span>Gửi</span>
          </button>
        </form>
        <div className={styles.privacyNote}>
          {isLecturer
            ? "Giảng viên có thể xem tên và tài khoản người gửi."
            : "Danh tính sinh viên được ẩn với những sinh viên khác."}
        </div>
      </section>
    </main>
  );
}