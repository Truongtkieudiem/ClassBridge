import { useEffect } from "react";
import Login from "./page/auth/Login";
import Register from "./page/auth/Register";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import AdminDashboardPage from "./page/admin/dashboard";
import AdminAccountsPage from "./page/admin/account";
import AdminClassPage from "./page/admin/lop";
import AdminActivityLogsPage from "./page/admin/ghilog";
import AdminEngagementPage from "./page/admin/tuongtac";
import LecturerLayout from "./page/giangvien/layoutGV";
import LecturerDashboardPage from "./page/giangvien/dashboard/dashboard";
import LecturerClassesPage from "./page/giangvien/classes/class";
import LecturerClassroomPage from "./page/giangvien/classroom/classroom";
import LecturerSessionDetailsPage from "./page/giangvien/classroom/chitiet";
import OfflineClassroomPage from "./page/giangvien/classroom/offline";
import LecturerQuestionPage from "./page/giangvien/classroom/cauhoi";
import ChatPage from "./page/chat";
import Layout from "./components/layout";
import api from "./services/api";

function LecturerSessionDetailsRoute() {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <LecturerLayout>
      <LecturerSessionDetailsPage
        sessionId={sessionId}
        initialStatus={location.state?.status ?? "upcoming"}
        onBack={() => navigate("/giangvien/classroom")}
      />
    </LecturerLayout>
  );
}

function ClickActivityTracker() {
  useEffect(() => {
    function recordClick(event) {
      const clicked = event.target instanceof Element ? event.target : null;
      if (!clicked) return;
      const element =
        clicked.closest(
          "button, a, input, select, textarea, label, summary, [role='button'], [role='link']",
        ) || clicked;
      const isFormField = element.matches("input, select, textarea");
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("data-audit-label") ||
        element.getAttribute("title") ||
        (isFormField
          ? element.getAttribute("placeholder") || element.getAttribute("name")
          : element.innerText || element.textContent) ||
        "";

      void api
        .post("/auth/activity", {
          page: window.location.pathname,
          tag: element.tagName.toLowerCase(),
          label: label.trim().slice(0, 240),
          elementId: element.id || "",
        })
        .catch(() => {});
    }

    document.addEventListener("click", recordClick, true);
    return () => document.removeEventListener("click", recordClick, true);
  }, []);

  return null;
}

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (error) {
    console.error("Stored user data is invalid:", error);
    return null;
  }
};

const AdminRoute = () => {
  const user = readStoredUser();

  return user?.role === "admin" && localStorage.getItem("token") ? (
    <Layout user={user}>
      <Outlet />
    </Layout>
  ) : (
    <Navigate to="/login" replace />
  );
};

const TeacherRoute = () => {
  const user = readStoredUser();

  return user?.role === "giang_vien" && localStorage.getItem("token") ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
};

const StudentRoute = () => {
  const user = readStoredUser();

  return ["sinh_vien", "student"].includes(user?.role) &&
    localStorage.getItem("token") ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
};

function LecturerSectionPage({ title, description }) {
  const user = readStoredUser();
  return (
    <LecturerLayout user={user}>
      <main
        style={{
          flex: 1,
          minWidth: 0,
          padding: "28px 32px",
          background: "#f4f6fb",
        }}
      >
        <h1>{title}</h1>
        <p>{description}</p>
        <section
          style={{
            maxWidth: 640,
            marginTop: 24,
            padding: 20,
            background: "#fff",
            border: "1px solid #e7eaf3",
            borderRadius: 14,
          }}
        >
          Khu v?c n?y ?ang ???c x?y d?ng.
        </section>
      </main>
    </LecturerLayout>
  );
}

function App() {
  return (
    <>
      <ClickActivityTracker />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/admin" element={<AdminRoute />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="account" element={<AdminAccountsPage />} />
          <Route path="users" element={<AdminAccountsPage />} />
          <Route path="classes" element={<AdminClassPage />} />
          <Route path="logs" element={<AdminActivityLogsPage />} />
          <Route path="engagement" element={<AdminEngagementPage />} />
          <Route path="tuongtac" element={<AdminEngagementPage />} />
        </Route>
        <Route path="/giangvien" element={<TeacherRoute />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <LecturerLayout>
                <LecturerDashboardPage />
              </LecturerLayout>
            }
          />
          <Route path="class" element={<Navigate to="/giangvien/classes" replace />} />
          <Route path="classroom" element={<LecturerLayout><LecturerClassroomPage /></LecturerLayout>} />
          <Route
            path="classroom/:sessionId/offline"
            element={<OfflineClassroomPage />}
          />
          <Route
            path="classroom/:sessionId/cauhoi"
            element={<LecturerQuestionPage />}
          />
          <Route
            path="classroom/:sessionId/chat"
            element={<ChatPage />}
          />
          <Route path="classroom/:sessionId" element={<LecturerSessionDetailsRoute />} />
          <Route path="classes" element={<LecturerLayout><LecturerClassesPage /></LecturerLayout>} />
          <Route path="classes/:classCode" element={<LecturerLayout><LecturerClassesPage /></LecturerLayout>} />
          <Route
            path="sessions"
            element={
              <LecturerSectionPage
                title="Classroom Sessions"
                description="Danh s?ch v? tr?ng th?i c?c phi?n h?c."
              />
            }
          />
          <Route
            path="qna"
            element={
              <LecturerSectionPage
                title="Anonymous Q&A"
                description="Câu hỏi ẩn danh của sinh viên trong phiên học."
              />
            }
          />
          <Route
            path="clusters"
            element={
              <LecturerSectionPage
                title="Question Clusters"
                description="Các nhóm câu hỏi được AI gom theo chủ đề."
              />
            }
          />
          <Route
            path="answers"
            element={
              <LecturerSectionPage
                title="Câu trả lời"
                description="Kho câu trả lời của giảng viên cho các nhóm câu hỏi."
              />
            }
          />
          <Route
            path="summary"
            element={
              <LecturerSectionPage
                title="Session Summary & Heatmap"
                description="Tóm tắt bài giảng và bản đồ nhiệt tương tác của lớp."
              />
            }
          />
          <Route
            path="profile"
            element={
              <LecturerSectionPage
                title="Hồ sơ cá nhân"
                description="Thông tin tài khoản giảng viên."
              />
            }
          />
        </Route>
        <Route path="/sinhvien" element={<StudentRoute />}>
          <Route path="classroom/:sessionId/chat" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

export default App;
