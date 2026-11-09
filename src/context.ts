import { createContext, useContext } from "react";
import type { Snapshot, Settings } from "./bridge";
export type Page =
  | "dashboard"
  | "timetable"
  | "grades"
  | "statistics"
  | "progress"
  | "homework"
  | "absences"
  | "messages"
  | "notes"
  | "consultations"
  | "lep"
  | "profile"
  | "settings"
  | "theme"
  | "notifications";
export interface AppContextType {
  snapshot: Snapshot;
  demo: boolean;
  busy: boolean;
  page: Page;
  navigate: (page: Page) => void;
  act: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  update: (snapshot: Snapshot) => void;
  settings: (settings: Partial<Settings>) => Promise<void>;
  addAccount: () => void;
  toast: (message: string) => void;
}
export const AppContext = createContext<AppContextType>(null!);
export const useApp = () => useContext(AppContext);
