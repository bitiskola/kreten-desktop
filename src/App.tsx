import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  GraduationCap,
  Hourglass,
  House,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  Moon,
  Paintbrush,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import {
  command,
  defaults,
  emptySnapshot,
  native,
  subscribe,
  type Settings,
  type Snapshot,
} from "./bridge";
import { AppContext, type Page } from "./context";
import { demoSnapshot } from "./demo";
import { str, timeLabel } from "./data";
import { Button, Modal } from "./components";
import { SettingsExtras } from "./SettingsExtras";
import { ProgressPage } from "./ProgressPage";
import { ThemePage } from "./ThemePage";
import { setLanguage, resolveLanguage, t } from "./i18n";
import {
  Absences,
  Consultations,
  Dashboard,
  Grades,
  Homework,
  Lep,
  Messages,
  Notes,
  Notifications,
  Profile,
  SettingsPage,
  Timetable,
} from "./pages";

const syncLabels: Record<string, string> = {
  student: "Profilom",
  grades: "Jegyek",
  timetable: "Órarend",
  homework: "Házi feladatok",
  tests: "Dolgozatok",
  absences: "Hiányzások",
  notices: "Faliújság",
  notes: "Feljegyzések",
  groups: "Osztályok és csoportok",
  classAverages: "Osztályátlagok",
  schoolYear: "Tanév rendje",
  consultations: "Fogadóórák",
  lep: "LEP programok",
  guardian: "Gondviselői adatok",
  capabilities: "Intézmény",
  dktSubjects: "Digitális tantárgyak",
  messagesInbox: "Beérkezett",
  messagesSent: "Elküldött",
  messagesDeleted: "Törölt",
  connection: "Kapcsolat",
};

const sections: {
  label: string;
  items: { id: Page; label: string; icon: typeof House }[];
}[] = [
  {
    label: "NAPLÓ",
    items: [
      { id: "dashboard", label: "Áttekintés", icon: House },
      { id: "timetable", label: "Órarend", icon: CalendarDays },
      { id: "grades", label: "Jegyek", icon: GraduationCap },
      { id: "statistics", label: "Statisztikák", icon: BarChart3 },
      { id: "progress", label: "Haladás", icon: Hourglass },
      { id: "homework", label: "Házi feladatok", icon: BookOpen },
      { id: "absences", label: "Hiányzások", icon: Clock3 },
    ],
  },
  {
    label: "ISKOLAI ÉLET",
    items: [
      { id: "messages", label: "Üzenetek", icon: Mail },
      { id: "notes", label: "Feljegyzések", icon: FileText },
      { id: "consultations", label: "Fogadóórák", icon: UsersRound },
      { id: "lep", label: "LEP programok", icon: Sparkles },
    ],
  },
];
function mergeSnapshot(s: Snapshot): Snapshot {
  return { ...emptySnapshot(), ...s, settings: { ...defaults, ...s.settings } };
}
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot),
    [page, setPage] = useState<Page>("dashboard"),
    [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(native),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [addAccount, setAddAccount] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [accountMenu, setAccountMenu] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [paused, setPaused] = useState(false);
  setLanguage(resolveLanguage(snapshot.settings.language));
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const update = useCallback((s: Snapshot) => {
    const merged = mergeSnapshot(s);
    snapshotRef.current = merged;
    setSnapshot(merged);
    setBusy(false);
    setLoading(false);
    if (s.activeAccountId) setAddAccount(false);
  }, []);
  const toast = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 5500);
  }, []);
  const act = useCallback(
    async <T,>(name: string, args?: Record<string, unknown>): Promise<T> => {
      try {
        const result = await command<T>(name, {
          accountId: snapshotRef.current.activeAccountId,
          ...args,
        });
        if (
          result &&
          typeof result === "object" &&
          "accounts" in result &&
          "settings" in result
        )
          update(result as unknown as Snapshot);
        return result;
      } catch (e) {
        setError(str(e instanceof Error ? e.message : e));
        throw e;
      }
    },
    [update],
  );
  useEffect(() => {
    let disposed = false;
    const cleanup: (() => void)[] = [];
    if (native) {
      command<Snapshot>("get_bootstrap")
        .then((s) => {
          if (!disposed) update(s);
        })
        .catch((e) => {
          if (!disposed) {
            setError(String(e));
            setLoading(false);
          }
        });
      subscribe(
        (s) => {
          if (!disposed && !demoRef.current) update(s);
        },
        (err) => {
          if (!disposed) {
            setError(err);
            setBusy(false);
          }
        },
      ).then((fn) => (disposed ? fn() : cleanup.push(fn)));
      for (const [event, handler] of [
        ["sync-started", () => setBusy(true)],
        [
          "sync-error",
          (p: unknown) => {
            setBusy(false);
            setError(String(p));
          },
        ],
        ["navigate", () => setPage("settings")],
        ["background-paused", (p: unknown) => setPaused(Boolean(p))],
      ] as const)
        listen(event, (e) => {
          if (!disposed) handler(e.payload);
        }).then((fn) => (disposed ? fn() : cleanup.push(fn)));
    }
    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
      clearTimeout(toastTimer.current);
    };
  }, [update]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        snapshot.settings.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : snapshot.settings.theme;
      document.documentElement.dataset.palette = snapshot.settings.palette;
      document.documentElement.dataset.ui = snapshot.settings.uiStyle || "glass";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [snapshot.settings.theme, snapshot.settings.palette, snapshot.settings.uiStyle]);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = snapshot.settings.language;
    root.dataset.sidebar = snapshot.settings.sidebarSide;
    root.dataset.motion = snapshot.settings.animatedBackground ? "on" : "off";
    root.style.setProperty(
      "--wallpaper-one",
      snapshot.settings.wallpaperColor1,
    );
    root.style.setProperty(
      "--wallpaper-two",
      snapshot.settings.wallpaperColor2,
    );
    const fonts: Record<string, string> = {
      system: "inherit",
      serif: "Georgia, 'Times New Roman', serif",
      rounded: "'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif",
    };
    root.style.setProperty(
      "--title-font",
      fonts[snapshot.settings.titleFont] || "inherit",
    );
    root.style.setProperty(
      "--title-weight",
      String(snapshot.settings.titleWeight),
    );
  }, [snapshot.settings]);
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());
  const modeGeneration = useRef(0);
  const saveSettings = useCallback(
    (partial: Partial<Settings>) => {
      const generation = modeGeneration.current;
      const requestedDemo = demoRef.current;
      const pending = settingsQueue.current
        .catch(() => {})
        .then(async () => {
          if (generation !== modeGeneration.current) return;
          const settings = { ...snapshotRef.current.settings, ...partial };
          if (requestedDemo) {
            update({ ...snapshotRef.current, settings });
          } else {
            try {
              const result = await command<Snapshot>("update_settings", {
                settings,
              });
              if (generation === modeGeneration.current) update(result);
            } catch (error) {
              setError(String(error));
              throw error;
            }
          }
        });
      settingsQueue.current = pending.catch(() => {});
      return pending;
    },
    [update],
  );
  const navigate = useCallback((next: Page) => {
    setPage(next);
    setMobileMenu(false);
    document.getElementById("main-content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, []);
  async function refresh() {
    if (demo) {
      toast("Bemutató mód · A mintaadatok nem kapcsolódnak a KRÉTA-hoz.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await act("refresh");
    } finally {
      setBusy(false);
    }
  }
  function enterDemo() {
    modeGeneration.current++;
    demoRef.current = true;
    window.scrollTo(0, 0);
    setDemo(true);
    update(demoSnapshot());
    setPage("dashboard");
    setError("");
  }
  async function leaveDemo() {
    modeGeneration.current++;
    demoRef.current = false;
    setDemo(false);
    setSnapshot(emptySnapshot());
    if (native) {
      try {
        update(await command<Snapshot>("get_bootstrap"));
      } catch (e) {
        setError(String(e));
      }
    }
  }
  async function logout() {
    try {
      if (demo) await leaveDemo();
      else await act("logout", { accountId: snapshot.activeAccountId });
      setLoggingOut(false);
      setPage("dashboard");
    } catch {
      /* visible error banner */
    }
  }
  const account = snapshot.accounts.find(
    (a) => a.id === snapshot.activeAccountId,
  );
  const content = {
    dashboard: <Dashboard />,
    timetable: <Timetable />,
    grades: <Grades />,
    statistics: <Grades statistics />,
    progress: <ProgressPage />,
    theme: <ThemePage />,
    homework: <Homework />,
    absences: <Absences />,
    messages: <Messages />,
    notes: <Notes />,
    consultations: <Consultations />,
    lep: <Lep />,
    profile: <Profile />,
    settings: (
      <>
        <SettingsPage />
        <SettingsExtras />
      </>
    ),
    notifications: <Notifications />,
  }[page];
  return (
    <AppContext.Provider
      value={{
        snapshot,
        demo,
        busy,
        page,
        navigate,
        act,
        update,
        settings: saveSettings,
        addAccount: () => setAddAccount(true),
        toast,
      }}
    >
      <a href="#main-content" className="skip-link">
        {t("Ugrás a tartalomhoz")}
      </a>
      {loading ? (
        <div className="loading-screen">
          <Logo />
          <LoaderCircle className="spinning" size={25} />
          <p>{t("A helyi naplód betöltése…")}</p>
        </div>
      ) : !account ? (
        <Login
          onDemo={enterDemo}
          onClose={undefined}
          act={act}
          error={error}
          clearError={() => setError("")}
        />
      ) : (
        <div className="app-shell">
          {mobileMenu && (
            <button
              className="sidebar-backdrop"
              aria-label={t("Navigáció bezárása")}
              onClick={() => setMobileMenu(false)}
            />
          )}
          <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
            <button
              className="brand"
              aria-label={t("KRETÉN kezdőlap")}
              onClick={() => navigate("dashboard")}
            >
              <Logo />
              <span className="brand-description">
                {t("A suli, átláthatóan.")}
              </span>
            </button>
            <span className="desktop-tag">{t("DESKTOP")}</span>
            <button
              className="icon-button sidebar-close"
              aria-label={t("Menü bezárása")}
              onClick={() => setMobileMenu(false)}
            >
              <X size={19} />
            </button>
            <nav aria-label={t("Fő navigáció")}>
              {sections.map((section) => (
                <div className="nav-section" key={t(section.label)}>
                  <div className="nav-section-label">{t(section.label)}</div>
                  {section.items
                    .filter(
                      (item) => !snapshot.settings.hiddenNav.includes(item.id),
                    )
                    .map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        className={`nav-link ${page === id ? "is-active" : ""}`}
                        aria-current={page === id ? "page" : undefined}
                        onClick={() => navigate(id)}
                      >
                        <Icon size={18} />
                        <span>{t(label)}</span>
                        {page === id && <span className="nav-active-dot" />}
                      </button>
                    ))}
                </div>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <button
                className={`nav-link ${page === "profile" ? "is-active" : ""}`}
                onClick={() => navigate("profile")}
              >
                <User size={18} />
                {t("Profilom")}
              </button>
              <button
                className={`nav-link ${page === "theme" ? "is-active" : ""}`}
                aria-current={page === "theme" ? "page" : undefined}
                onClick={() => navigate("theme")}
              >
                <Paintbrush size={18} />
                {t("Téma")}
              </button>
              <button
                className={`nav-link ${page === "settings" ? "is-active" : ""}`}
                onClick={() => navigate("settings")}
              >
                <SettingsIcon size={18} />
                {t("Beállítások")}
              </button>
              <div className="sidebar-divider" />
              <div className="account-switcher">
                <button
                  className="account-switch"
                  aria-expanded={accountMenu}
                  onClick={() => setAccountMenu(!accountMenu)}
                >
                  <span className="account-avatar">
                    {account.name
                      .split(" ")
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span>
                    <strong>{account.name}</strong>
                    <small>
                      {demo
                        ? t("Bemutató fiók")
                        : account.institutionName || account.institutionCode}
                    </small>
                  </span>
                  <ChevronDown size={14} />
                </button>
                {accountMenu && (
                  <div className="account-popover">
                    <strong className="small muted">
                      {t("Hozzáadott fiókok")}
                    </strong>
                    {snapshot.accounts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setAccountMenu(false);
                          if (a.id !== snapshot.activeAccountId)
                            void act("select_account", {
                              accountId: a.id,
                            }).catch(() => {});
                        }}
                      >
                        <User size={15} />
                        <span>{a.name}</span>
                        {a.id === snapshot.activeAccountId && (
                          <Check size={15} />
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setAccountMenu(false);
                        setAddAccount(true);
                      }}
                    >
                      <Plus size={15} />
                      {t("Fiók hozzáadása")}
                    </button>
                    <button
                      onClick={() => {
                        setAccountMenu(false);
                        setLoggingOut(true);
                      }}
                    >
                      <LogOut size={15} />
                      {demo ? t("Bemutató bezárása") : t("Kijelentkezés")}
                    </button>
                  </div>
                )}
              </div>
              <div className="sidebar-note">
                <span className="status-dot" />
                {demo
                  ? t("Bemutató mód")
                  : paused
                    ? t("Frissítés szünetel")
                    : t("A háttérben is veled")}
              </div>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <div className="topbar-left">
                <button
                  className="icon-button mobile-menu"
                  aria-label={t("Navigáció megnyitása")}
                  onClick={() => setMobileMenu(true)}
                >
                  <Menu size={20} />
                </button>
                <span className="topbar-caption">
                  {t("Minden, ami a suliban történik.")}
                </span>
              </div>
              <div className="topbar-actions">
                <span
                  className={`sync-status ${snapshot.offline ? "offline" : ""}`}
                  title={
                    snapshot.lastSyncedAt
                      ? `Utolsó frissítés: ${new Date(snapshot.lastSyncedAt).toLocaleString("hu-HU")}`
                      : t("Még nincs mentett frissítés")
                  }
                >
                  {snapshot.offline ? (
                    <WifiOff size={13} />
                  ) : (
                    <span className="status-dot" />
                  )}
                  {demo
                    ? t("Bemutató")
                    : busy
                      ? t("Frissítés…")
                      : paused
                        ? t("Szüneteltetve")
                        : snapshot.offline
                          ? t("Offline")
                          : snapshot.lastSyncedAt
                            ? `Frissítve ${timeLabel(snapshot.lastSyncedAt)}`
                            : t("Szinkronizálásra vár")}
                </span>
                <button
                  className="icon-button"
                  aria-label={t("Frissítés")}
                  title={t("Frissítés")}
                  disabled={busy}
                  onClick={() => void refresh().catch(() => {})}
                >
                  <RefreshCw size={17} className={busy ? "spinning" : ""} />
                </button>
                <span className="topbar-divider" />
                <button
                  className="icon-button"
                  aria-label={t("Megjelenés váltása")}
                  title={t("Megjelenés váltása")}
                  onClick={() =>
                    void saveSettings({
                      theme:
                        document.documentElement.dataset.theme === "dark"
                          ? "light"
                          : "dark",
                    }).catch(() => {})
                  }
                >
                  {snapshot.settings.theme === "dark" ? (
                    <Sun size={18} />
                  ) : (
                    <Moon size={18} />
                  )}
                </button>
                <button
                  className="icon-button notification-button"
                  aria-label={`Értesítések (${snapshot.notifications.length})`}
                  onClick={() => navigate("notifications")}
                >
                  <Bell size={18} />
                  {snapshot.notifications.length > 0 && <i />}
                </button>
                <button
                  className="topbar-avatar"
                  aria-label={t("Profilom")}
                  onClick={() => navigate("profile")}
                >
                  {account.name.slice(0, 1)}
                </button>
              </div>
            </header>
            <main id="main-content" className="main-content">
              {demo && (
                <div className="demo-banner">
                  <Sparkles size={15} />
                  <span>
                    <strong>{t("Bemutató mód")}</strong>{" "}
                    {t("· Kitalált mintaadatok, KRÉTA-kapcsolat nélkül.")}
                  </span>
                  <button onClick={() => void leaveDemo()}>
                    {t("Bezárás")} <X size={13} />
                  </button>
                </div>
              )}
              {error && (
                <div className="alert error" role="alert">
                  <span>{t(error)}</span>
                  <button
                    className="icon-button"
                    aria-label={t("Hibaüzenet bezárása")}
                    onClick={() => setError("")}
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              {snapshot.offline && (
                <div className="alert">
                  <WifiOff size={17} />
                  <span>
                    {t(
                      "Offline vagy. A legutóbb ezen a gépen mentett adatokat látod.",
                    )}
                  </span>
                </div>
              )}
              {Object.keys(snapshot.errors).length > 0 && (
                <details className="sync-errors">
                  <summary>
                    {t("Néhány adatot nem sikerült frissíteni (")}
                    {Object.keys(snapshot.errors).length}
                    {t("). A korábban mentett adatokat mutatjuk.")}
                  </summary>
                  <ul>
                    {Object.entries(snapshot.errors).map(([key, value]) => (
                      <li key={key}>
                        <strong>{t(syncLabels[key] || key)}:</strong> {t(value)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div key={snapshot.activeAccountId}>{content}</div>
            </main>
            <footer className="app-footer">
              <span>
                {t("KRETÉN")} <small>{t("DESKTOP")}</small>
              </span>
              <span>
                {t("Független, közösségi KRÉTA-kliens.")}{" "}
                <ShieldCheck size={13} />
              </span>
            </footer>
          </div>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {t(notice)}
          <button
            className="icon-button"
            aria-label={t("Bezárás")}
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {account && addAccount && (
        <Modal
          title={t("Fiók hozzáadása")}
          onClose={() => setAddAccount(false)}
        >
          <Login
            embedded
            onClose={() => setAddAccount(false)}
            onDemo={enterDemo}
            act={act}
            error={error}
            clearError={() => setError("")}
          />
        </Modal>
      )}
      {loggingOut && (
        <Modal
          title={demo ? t("Bemutató bezárása") : t("Kijelentkezés")}
          onClose={() => setLoggingOut(false)}
        >
          <p>
            {demo
              ? t("Visszatérsz a bejelentkezési képernyőre?")
              : t(
                  "Kijelentkezel ebből a fiókból? A helyben tárolt munkamenet és naplóadatok törlődnek.",
                )}
          </p>
          <div className="dialog-actions">
            <Button onClick={() => setLoggingOut(false)}>{t("Mégse")}</Button>
            <Button primary onClick={() => void logout()}>
              {demo ? t("Bemutató bezárása") : t("Kijelentkezés")}
            </Button>
          </div>
        </Modal>
      )}
    </AppContext.Provider>
  );
}
function Logo() {
  return (
    <>
      <img
        className="brand-logo logo-light-theme"
        src="/brand/logo-dark.png"
        alt="KRETÉN"
      />
      <img
        className="brand-logo logo-dark-theme"
        src="/brand/logo-light.png"
        alt="KRETÉN"
      />
    </>
  );
}
function Login({
  onClose,
  embedded,
  onDemo,
  act,
  error,
  clearError,
}: {
  onClose?: () => void;
  embedded?: boolean;
  onDemo?: () => void;
  act: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  error?: string;
  clearError: () => void;
}) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];
    for (const event of ["login-success", "login-error", "login-cancelled"])
      listen(event, () => {
        if (!disposed) setWaiting(false);
      }).then((fn) => (disposed ? fn() : cleanups.push(fn)));
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  async function login() {
    clearError();
    setWaiting(true);
    try {
      await act("login", { institutionCode: null });
    } catch {
      setWaiting(false);
    }
  }

  return (
    <div className={embedded ? "embedded-login" : "login-scene"}>
      {!embedded && (
        <div className="login-brand">
          <Logo />
          <span>{t("DESKTOP")}</span>
        </div>
      )}
      <div className={embedded ? "" : "login-layout"}>
        {!embedded && (
          <div className="login-intro">
            <span className="eyebrow">
              <span className="status-dot" />
              {t("A TE NAPLÓD. EGY KICSIT MÁSKÉPP.")}
            </span>
            <h1>
              {t("A suli,")}
              <br />
              <span>{t("átláthatóan.")}</span>
            </h1>
            <p>
              {t("Jegyek, órarend, üzenetek.")}
              <br />
              {t("Minden, amire szükséged van —")}
              <br />
              {t("egy nyugodtabb helyen.")}
            </p>
            <div className="login-features">
              <span>
                <ShieldCheck size={18} />
                {t("Minden adat a gépeden marad")}
              </span>
              <span>
                <Bell size={18} />
                {t("A háttérben is képben tart")}
              </span>
              <span>
                <Sparkles size={18} />
                {t("Pont úgy, ahogy szereted")}
              </span>
            </div>
            <div className="login-orbit" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>
                <GraduationCap size={45} strokeWidth={1.1} />
              </span>
            </div>
          </div>
        )}
        <section className={embedded ? "login-form" : "login-card card"}>
          {!embedded && (
            <span className="login-icon">
              <GraduationCap size={29} strokeWidth={1.6} />
            </span>
          )}
          <h2>
            {embedded ? t("Még egy napló, ugyanitt.") : t("Jó, hogy itt vagy.")}
          </h2>
          <p className="muted">
            {t("Jelentkezz be a KRÉTA-fiókoddal, és máris otthon vagy.")}
          </p>
          {error && (
            <div className="alert error" role="alert">
              {t(error)}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void login();
            }}
          >
            <p className="field-help" style={{ marginTop: "12px", marginBottom: "22px" }}>
              {t(
                "A bejelentkezés gombra kattintva megnyílik a KRÉTA hivatalos oldala, ahol kiválaszthatod az iskoládat és megadhatod a bejelentkezési adataidat.",
              )}
            </p>
            <Button
              type="submit"
              primary
              disabled={waiting || !native}
              className="login-submit"
            >
              {waiting ? (
                <>
                  <LoaderCircle size={18} className="spinning" />
                  {t("Bejelentkezés folyamatban…")}
                </>
              ) : (
                <>
                  {t("Tovább a KRÉTA bejelentkezéshez")}
                  <ArrowRight size={18} />
                </>
              )}
            </Button>
            {waiting && (
              <button
                className="text-link login-cancel"
                type="button"
                onClick={() => {
                  void act("cancel_login")
                    .then(() => setWaiting(false))
                    .catch(() => {});
                }}
              >
                {t("Bejelentkezés megszakítása")}
              </button>
            )}
            {onClose && (
              <Button type="button" onClick={onClose}>
                {t("Mégse")}
              </Button>
            )}
          </form>
          {!embedded && onDemo && (
            <div className="login-demo">
              <div className="login-demo-divider">
                <span>{t("vagy")}</span>
              </div>
              <Button onClick={onDemo} className="login-demo-btn">
                <Sparkles size={17} />
                {t("Kipróbálás bemutató adatokkal")}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
