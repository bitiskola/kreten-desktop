import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export type Raw = Record<string, any>;
export interface Account {
  id: string;
  name: string;
  institutionCode: string;
  institutionName: string;
  username: string;
}
export interface Settings {
  pollIntervalMinutes: number;
  notificationsEnabled: boolean;
  startMinimized: boolean;
  launchAtStartup: boolean;
  theme: string;
  palette: string;
  privateGrades: boolean;
  bellOffsetMinutes: number;
  mutedSubjects: string[];
  notificationCategories: string[];
  language: string;
  wallpaperColor1: string;
  wallpaperColor2: string;
  animatedBackground: boolean;
  sidebarSide: string;
  titleFont: string;
  titleWeight: number;
  gradeThresholds: number[];
  hiddenNav: string[];
  uiStyle: string;
}
export interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  accountId: string;
}
export interface Snapshot {
  accounts: Account[];
  activeAccountId: string | null;
  data: Record<string, any>;
  lastSyncedAt: string | null;
  offline: boolean;
  errors: Record<string, string>;
  settings: Settings;
  notifications: Notice[];
  completedHomework: string[];
  storageMode?: string;
}
export interface School {
  code: string;
  name: string;
  city: string;
}
export const defaults: Settings = {
  pollIntervalMinutes: 5,
  notificationsEnabled: true,
  startMinimized: false,
  launchAtStartup: false,
  theme: "light",
  palette: "ocean",
  privateGrades: false,
  bellOffsetMinutes: 0,
  mutedSubjects: [],
  notificationCategories: [
    "grades",
    "homework",
    "tests",
    "absences",
    "timetable",
    "notes",
    "notices",
    "messagesInbox",
  ],
  language: "hu",
  wallpaperColor1: "#629ef2",
  wallpaperColor2: "#9d7eea",
  animatedBackground: true,
  sidebarSide: "left",
  titleFont: "system",
  titleWeight: 650,
  gradeThresholds: [1.5, 2.5, 3.5, 4.5],
  hiddenNav: [],
  uiStyle: "glass",
};
export const emptySnapshot = (): Snapshot => ({
  accounts: [],
  activeAccountId: null,
  data: {},
  lastSyncedAt: null,
  offline: false,
  errors: {},
  settings: { ...defaults },
  notifications: [],
  completedHomework: [],
});
export const native = isTauri();
export async function command<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!native)
    throw new Error(
      "A KRÉTA-kapcsolathoz indítsd el a KRETÉN Desktop asztali alkalmazást.",
    );
  return invoke<T>(name, args);
}
export async function subscribe(
  onData: (data: Snapshot) => void,
  onError: (error: string) => void,
) {
  if (!native) return () => {};
  const stopData = await listen<Snapshot>("data-updated", (event) =>
    onData(event.payload),
  );
  const stopError = await listen<string>("auth-error", (event) =>
    onError(event.payload),
  );
  return () => {
    stopData();
    stopError();
  };
}
