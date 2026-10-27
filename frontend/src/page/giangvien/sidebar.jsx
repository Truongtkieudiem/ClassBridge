import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  Grid2x2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Network,
  Presentation,
  Reply,
  UserRound,
} from "lucide-react";
import authService from "../../services/auth.service";
import styles from "./sidebar.module.css";

const PRIMARY_ITEMS = [
  {
    label: "Dashboard",
    href: "/giangvien/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "My Classes",
    href: "/giangvien/classes",
    icon: BookOpen,
  },
  {
    label: "Classroom",
    href: "/giangvien/classroom",
    icon: Presentation,
  },
  {
    label: "Anonymous Q&A",
    href: "/giangvien/qna",
    icon: MessagesSquare,
  },
  {
    label: "Question",
    href: "/giangvien/question",
    icon: Network,
  },
  {
    label: "Answers",
    href: "/giangvien/answers",
    icon: Reply,
  },
  {
    label: "Session Summary & Heatmap",
    href: "/giangvien/summary",
    icon: Grid2x2,
  },
];

const ACCOUNT_ITEMS = [
  {
    label: "Hồ sơ cá nhân",
    href: "/giangvien/profile",
    icon: UserRound,
  },
];

export default function LecturerSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    authService.logout();
    navigate("/login", { replace: true });
  }

  const renderItem = ({ label, href, icon: Icon, end }) => (
    <NavLink
      key={href}
      to={href}
      end={end}
      className={({ isActive }) =>
        `${styles.navItem} ${isActive ? styles.navItemActive : ""}`
      }
      title={isCollapsed ? label : undefined}
    >
      <Icon size={18} aria-hidden="true" />
      <span className={styles.navLabel}>{label}</span>
    </NavLink>
  );

  return (
    <aside
      className={`${styles.sidebar} ${
        isCollapsed ? styles.sidebarCollapsed : ""
      }`}
      aria-label="Khu vực giảng viên"
    >
      <button
        type="button"
        className={styles.sidebarHeaderToggle}
        aria-label={isCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
      >
        {!isCollapsed && (
          <span className={styles.sidebarBrand}>ClassBridge</span>
        )}
        {isCollapsed ? (
          <Menu size={20} aria-hidden="true" />
        ) : (
          <ChevronLeft size={20} aria-hidden="true" />
        )}
      </button>

      <nav className={styles.navMenu} aria-label="Menu giảng viên">
        {PRIMARY_ITEMS.map(renderItem)}

        <p className={styles.navGroupLabel}>ACCOUNT</p>
        {ACCOUNT_ITEMS.map(renderItem)}

        <button
          type="button"
          className={`${styles.navItem} ${styles.navLogout}`}
          onClick={handleLogout}
          title={isCollapsed ? "Đăng xuất" : undefined}
        >
          <LogOut size={18} aria-hidden="true" />
          <span className={styles.navLabel}>Đăng xuất</span>
        </button>
      </nav>
    </aside>
  );
}
