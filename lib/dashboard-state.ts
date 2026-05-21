export type TrackerStatus = "On track" | "At risk" | "Blocked";

export type WeeklyMilestone = {
  week: string;
  title: string;
  status: string;
  progress: number;
};

export type DashboardState = {
  overallProgress: number;
  selectedWeek: string;
  dailyStatus: TrackerStatus;
  dailyUpdate: string;
  dailyBlockers: string;
  checklist: boolean[];
  activity: string[];
};

export const trackerStorageKey = "project-timeline-dashboard-state";

export const defaultDashboardState: DashboardState = {
  overallProgress: 64,
  selectedWeek: "Week 3",
  dailyStatus: "On track",
  dailyUpdate: "",
  dailyBlockers: "",
  checklist: [true, true, true, false, false],
  activity: [
    "Uploaded backend API documentation and design references.",
    "Generated the first draft of the 3-month master plan.",
    "Submitted daily status update and blocker notes.",
    "Boss reviewed weekly progress and requested one scope adjustment.",
  ],
};

export function loadDashboardState(): DashboardState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawState = window.localStorage.getItem(trackerStorageKey);
  if (!rawState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(rawState) as Partial<DashboardState>;
    return {
      ...defaultDashboardState,
      ...parsedState,
      checklist: Array.isArray(parsedState.checklist)
        ? parsedState.checklist.slice(0, 5).map(Boolean)
        : defaultDashboardState.checklist,
      activity: Array.isArray(parsedState.activity)
        ? parsedState.activity.filter(
            (item): item is string => typeof item === "string",
          )
        : defaultDashboardState.activity,
      dailyStatus:
        parsedState.dailyStatus === "At risk" ||
        parsedState.dailyStatus === "Blocked" ||
        parsedState.dailyStatus === "On track"
          ? parsedState.dailyStatus
          : defaultDashboardState.dailyStatus,
    };
  } catch {
    return null;
  }
}

export function saveDashboardState(state: DashboardState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(trackerStorageKey, JSON.stringify(state));
}
