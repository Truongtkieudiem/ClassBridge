export type ClassItem = {
  id: string;
  name: string;
  courseCode: string;
  classCode: string;
  description?: string;
  studentCount?: number;
  hours?: number;
  hoursLearned?: number;
  classTime?: string;
  startTime?: string;
  endTime?: string;
  weekday?: string;
};

export type ClassSessionItem = {
  id: string;
  title: string;
  room: string;
  weekday: string;
  weekdayCode: string;
  dateLabel?: string;
  recurring: boolean;
  startTimeLabel: string;
  endTimeLabel: string;
  hasSlides: boolean;
};

export type ClassFormData = {
  courseCode: string;
  name: string;
  hours: string;
  description: string;
};

export type WeeklyScheduleDraft = {
  weekday: string;
  startTime: string;
  endTime: string;
  lectureFile: File | null;
};

export type ClassScheduleDateRange = {
  startDate: string;
  endDate: string;
};

export const WEEKDAY_OPTIONS = [
  { code: "MO", label: "Thứ 2" },
  { code: "TU", label: "Thứ 3" },
  { code: "WE", label: "Thứ 4" },
  { code: "TH", label: "Thứ 5" },
  { code: "FR", label: "Thứ 6" },
  { code: "SA", label: "Thứ 7" },
  { code: "SU", label: "Chủ nhật" },
];
