import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuChevronDown, LuSearch } from "react-icons/lu";
import authService from "../services/auth.service";
import "./header.css";

const getStoredUser = () => {
  try {
    return authService.getCurrentUser();
  } catch (error) {
    console.error("Stored user data is invalid:", error);
    return null;
  }
};

export default function Header({ user: authenticatedUser }) {
  const [user] = useState(() => authenticatedUser || getStoredUser());
  const [language, setLanguage] = useState(() =>
    localStorage.getItem("app_lang") === "vi" ? "VI" : "EN",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const navigate = useNavigate();

  const displayName =
    user?.full_name || user?.name || user?.email || "Tài khoản";
  const avatarLetter = displayName.trim().charAt(0).toLocaleUpperCase() || "A";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileRef.current?.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    localStorage.setItem("app_lang", nextLanguage.toLowerCase());
    window.dispatchEvent(
      new CustomEvent("classbridge-language-change", {
        detail: nextLanguage,
      }),
    );
  };

  const handleLogout = () => {
    authService.logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="app-header">
      <Link className="app-header-brand" to="/admin" aria-label="ClassBridge">
        <img src="/ClassBridge.png" alt="" />
        <span>ClassBridge</span>
      </Link>

      <label className="app-header-search">
        <LuSearch size={17} aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={language === "VI" ? "Tìm kiếm lớp học, tài liệu..." : "Search classes, materials..."}
          aria-label={language === "VI" ? "Tìm kiếm" : "Search"}
        />
      </label>

      <div className="app-header-actions">
        <div className="app-header-language" aria-label="Language">
          <button
            type="button"
            className={language === "EN" ? "active" : ""}
            aria-pressed={language === "EN"}
            onClick={() => changeLanguage("EN")}
          >
            En
          </button>
          <span aria-hidden="true">|</span>
          <button
            type="button"
            className={language === "VI" ? "active" : ""}
            aria-pressed={language === "VI"}
            onClick={() => changeLanguage("VI")}
          >
            VI
          </button>
        </div>

        <div className="app-header-profile" ref={profileRef}>
          <button
            type="button"
            className="app-header-profile-button"
            aria-expanded={isProfileOpen}
            onClick={() => setIsProfileOpen((open) => !open)}
          >
            <span className="app-header-avatar" aria-hidden="true">
              {avatarLetter}
            </span>
            <span className="app-header-name" title={displayName}>
              {displayName}
            </span>
            <LuChevronDown size={15} aria-hidden="true" />
          </button>
          {isProfileOpen && (
            <div className="app-header-menu">
              <button type="button" onClick={handleLogout}>
                {language === "VI" ? "Đăng xuất" : "Log out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}