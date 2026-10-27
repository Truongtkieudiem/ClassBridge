"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Users,
  MessageSquare,
  Layers,
  Filter,
  Clock,
  ThumbsUp,
  Activity,
  BarChart2,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

import api from "../../../services/api";
import styles from "./dashboard.module.css";

type DashboardData = {
  overview: {
    totalClasses: number;
    totalStudents: number;
    totalQuestions: number;
    beforeGrouping: number;
    afterGrouping: number;
    reductionRate: number;
  };
  questionGroups: {
    id: string;
    title: string;
    students: number;
    questionCount: number;
    lang: string;
    status: "answered" | "pending";
  }[];
  translationLatencyLogs: { time: string; latencyMs: number }[];
  averageLatencyMs: number | null;
  engagement: {
    score: number | null;
    breakdown: { category: string; percentage: number; color: string }[];
  };
  feedbackList: {
    id: string;
    role: string;
    author: string;
    comment: string;
    rating: number;
    time: string;
  }[];
};

const EMPTY_DASHBOARD: DashboardData = {
  overview: {
    totalClasses: 0,
    totalStudents: 0,
    totalQuestions: 0,
    beforeGrouping: 0,
    afterGrouping: 0,
    reductionRate: 0,
  },
  questionGroups: [],
  translationLatencyLogs: [],
  averageLatencyMs: null,
  engagement: { score: null, breakdown: [] },
  feedbackList: [],
};

async function fetchDashboardData() {
  const response = await api.get<{ success: boolean; data: DashboardData }>(
    "/giang-vien/dashboard",
  );
  return response.data.data;
}

function getDashboardErrorMessage(error: unknown) {
  const responseData = axios.isAxiosError<{
    message?: string;
    msg?: string;
  }>(error)
    ? error.response?.data
    : undefined;
  return (
    responseData?.message ||
    responseData?.msg ||
    "Không thể tải dữ liệu dashboard. Vui lòng thử lại."
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setDashboard(await fetchDashboardData());
    } catch (error) {
      setLoadError(getDashboardErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchDashboardData()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getDashboardErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={styles.dashboardContainer}>
      {/* HEADER PAGE */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Tổng quan hoạt động lớp học & Phân tích hiệu năng hệ thống
            ClassBridge
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.btnSecondary} ${isRefreshing ? styles.spinning : ""}`}
            onClick={() => {
              setIsRefreshing(true);
              setLoadError("");
              void loadDashboard();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} /> Làm mới dữ liệu
          </button>
        </div>
      </div>
      {loadError && (
        <p className={styles.cardSub} role="alert">
          {loadError}
        </p>
      )}

      {/* 1. CÁC CHỈ SỐ TỔNG QUAN (STAT CARDS) */}
      <div className={styles.statsGrid}>
        {/* Card 1: Số sinh viên */}
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Số sinh viên</span>
            <div
              className={styles.statIcon}
              style={{ background: "#eff6ff", color: "#2563eb" }}
            >
              <Users size={20} />
            </div>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statNumber}>
              {dashboard.overview.totalStudents}
            </span>
            <span className={styles.statSubtext}>
              <Activity size={12} color="#16a34a" /> Đang tham gia lớp
            </span>
          </div>
        </div>

        {/* Card 2: Số câu hỏi */}
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Số câu hỏi</span>
            <div
              className={styles.statIcon}
              style={{ background: "#f3e8ff", color: "#9333ea" }}
            >
              <MessageSquare size={20} />
            </div>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statNumber}>
              {dashboard.overview.totalQuestions}
            </span>
            <span className={styles.statSubtext}>
              <TrendingUp size={12} color="#2563eb" /> Tổng lượt gửi
            </span>
          </div>
        </div>

        {/* Card 3: Trước khi gom nhóm */}
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Trước khi gom nhóm</span>
            <div
              className={styles.statIcon}
              style={{ background: "#fef3c7", color: "#d97706" }}
            >
              <Filter size={20} />
            </div>
          </div>
          <div className={styles.statBody}>
            <span className={styles.statNumber}>
              {dashboard.overview.beforeGrouping}
            </span>
            <span className={styles.statSubtext}>
              Gốc (Tiếng Anh + Tiếng Việt)
            </span>
          </div>
        </div>

        {/* Card 4: Sau khi gom nhóm */}
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Sau khi gom nhóm</span>
            <div
              className={styles.statIcon}
              style={{ background: "#dcfce7", color: "#16a34a" }}
            >
              <Layers size={20} />
            </div>
          </div>
          <div className={styles.statBody}>
            <div className={styles.flexAlign}>
              <span className={styles.statNumber}>
                {dashboard.overview.afterGrouping}
              </span>
              <span className={styles.badgeHighlight}>
                -{dashboard.overview.reductionRate.toLocaleString("vi-VN", {
                  maximumFractionDigits: 1,
                })}%
              </span>
            </div>
            <span className={styles.statSubtext}>Nhóm câu hỏi AI tổng hợp</span>
          </div>
        </div>
      </div>

      {/* 2. KHU VỰC BẢNG BIỂU VÀ PHÂN TÍCH */}
      <div className={styles.mainGrid}>
        {/* CỘT TRÁI: Nhóm câu hỏi & STT Latency */}
        <div className={styles.leftColumn}>
          {/* Biểu đồ / Danh sách số lượng sinh viên theo nhóm câu hỏi */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <BarChart2 size={18} className={styles.iconPrimary} /> Số
                  lượng sinh viên có câu hỏi trong mỗi nhóm
                </h3>
                <p className={styles.cardSub}>
                  Thống kê số sinh viên quan tâm theo từng nhóm câu hỏi đồng
                  dạng
                </p>
              </div>
            </div>

            <div className={styles.groupsList}>
              {dashboard.questionGroups.length === 0 ? (
                <p className={styles.cardSub}>Chưa có nhóm câu hỏi trong các lớp.</p>
              ) : (
                dashboard.questionGroups.map((group) => {
                  const maxStudents = Math.max(
                    ...dashboard.questionGroups.map((item) => item.students),
                    1,
                  );
                  const percent = Math.min(
                    100,
                    Math.round((group.students / maxStudents) * 100),
                  );

                  return (
                    <div key={group.id} className={styles.groupItem}>
                      <div className={styles.groupMeta}>
                        <span className={styles.groupTitle}>"{group.title}"</span>
                        <div className={styles.groupTags}>
                          <span className={styles.langTag}>{group.lang}</span>
                          {group.status === "answered" ? (
                            <span className={styles.badgeAnswered}>
                              <CheckCircle2 size={12} /> Đã trả lời
                            </span>
                          ) : (
                            <span className={styles.badgePending}>
                              Chờ phản hồi
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.progressRow}>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className={styles.studentCountText}>
                          <Users size={13} /> <strong>{group.students}</strong>{" "}
                          sinh viên
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Biểu đồ độ trễ chuyển đổi âm thành thành văn bản (STT Latency) */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <Clock size={18} className={styles.iconWarning} /> Thời gian
                  xử lý dịch phụ đề
                </h3>
                <p className={styles.cardSub}>
                  Thời gian xử lý dịch được lưu trong cơ sở dữ liệu (mục tiêu:
                  1-3 giây)
                </p>
              </div>
              <span className={styles.latencyStatusBadge}>
                Trung bình:{" "}
                {dashboard.averageLatencyMs === null
                  ? "Chưa có dữ liệu"
                  : `${(dashboard.averageLatencyMs / 1000).toFixed(1)}s`}
              </span>
            </div>

            <div className={styles.latencyVisual}>
              <div className={styles.latencyGridBars}>
                {dashboard.translationLatencyLogs.length === 0 ? (
                  <p className={styles.cardSub}>Chưa có dữ liệu xử lý dịch phụ đề.</p>
                ) : dashboard.translationLatencyLogs.map((log, index) => {
                  const barHeight = Math.min(100, (log.latencyMs / 4000) * 100);
                  let barColor = "#2563eb";
                  if (log.latencyMs > 3000) barColor = "#dc2626";
                  else if (log.latencyMs > 2000) barColor = "#d97706";

                  return (
                    <div key={index} className={styles.latencyBarItem}>
                      <span className={styles.barValue}>
                        {(log.latencyMs / 1000).toFixed(1)}s
                      </span>
                      <div className={styles.barContainer}>
                        <div
                          className={styles.barFill}
                          style={{
                            height: `${barHeight}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                      <span className={styles.barTime}>{log.time}</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.targetLineGroup}>
                <span className={styles.targetLabel}>Ngưỡng tối ưu (3.0s)</span>
              </div>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: Mức độ tương tác & Phản hồi */}
        <div className={styles.rightColumn}>
          {/* Sơ đồ mức độ tương tác của sinh viên */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <Activity size={18} className={styles.iconSuccess} /> Sơ đồ
                  mức độ tương tác
                </h3>
                <p className={styles.cardSub}>
                  Tỷ lệ tham gia của sinh viên trong buổi học
                </p>
              </div>
            </div>

            <div className={styles.engagementGauge}>
              <div className={styles.scoreCircle}>
                <span className={styles.scoreNumber}>
                  {dashboard.engagement.score === null
                    ? "--"
                    : `${dashboard.engagement.score}%`}
                </span>
                <span className={styles.scoreLabel}>
                  {dashboard.engagement.score === null
                    ? "Chưa có dữ liệu"
                    : dashboard.engagement.score >= 70
                      ? "Tương tác cao"
                      : dashboard.engagement.score >= 40
                        ? "Tương tác trung bình"
                        : "Tương tác thấp"}
                </span>
              </div>
            </div>

            <div className={styles.engagementList}>
              {dashboard.engagement.score === null ? (
                <p className={styles.cardSub}>
                  Chưa có lượt tham gia để tính mức độ tương tác.
                </p>
              ) : dashboard.engagement.breakdown.map((item) => (
                <div key={item.category} className={styles.engagementRow}>
                  <div className={styles.flexBetween}>
                    <span className={styles.catName}>{item.category}</span>
                    <span className={styles.catPercent}>
                      {item.percentage}%
                    </span>
                  </div>
                  <div className={styles.miniBarTrack}>
                    <div
                      className={styles.miniBarFill}
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phản hồi đơn giản của sinh viên và giảng viên */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>
                  <ThumbsUp size={18} className={styles.iconPurple} /> Phản hồi
                  bài giảng & hệ thống
                </h3>
                <p className={styles.cardSub}>
                  Đánh giá thực tế từ người dùng trực tiếp
                </p>
              </div>
            </div>

            <div className={styles.feedbackList}>
              {dashboard.feedbackList.length === 0 ? (
                <p className={styles.cardSub}>Chưa có phản hồi từ các buổi học.</p>
              ) : dashboard.feedbackList.map((fb) => (
                <div key={fb.id} className={styles.feedbackCard}>
                  <div className={styles.feedbackHeader}>
                    <div>
                      <span className={styles.authorName}>{fb.author}</span>
                      <span
                        className={
                          fb.role === "Giảng viên"
                            ? styles.roleLecturer
                            : styles.roleStudent
                        }
                      >
                        {fb.role}
                      </span>
                    </div>
                    <span className={styles.feedbackTime}>{fb.time}</span>
                  </div>
                  <p className={styles.commentText}>"{fb.comment}"</p>
                  <div className={styles.ratingStars}>
                    {"★".repeat(fb.rating)}
                    {"☆".repeat(5 - fb.rating)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
