import { t, currentDateLocale } from "./i18n";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  GraduationCap,
  Info,
  Mail,
  Paintbrush,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  User,
  WifiOff,
} from "lucide-react";
import { type Raw, type Settings } from "./bridge";
import { useApp } from "./context";
import {
  absenceRows,
  average,
  consultationRows,
  classAverageRows,
  schoolYearRows,
  estimatedGrade,
  dateLabel,
  decimal,
  grades,
  homeworkRows,
  lessons,
  schoolTimestamp,
  lessonIntervals,
  currentLiveStatus,
  noteRows,
  isJegyCode,
  messages,
  monthlyTrend,
  numericGrades,
  plain,
  rows,
  str,
  subjectGroups,
  testRows,
  timeLabel,
  today,
  weekDays,
  type Grade,
  type Lesson,
  type Message,
  type NoteItem,
} from "./data";
import {
  ArrowIcon,
  Button,
  Card,
  Empty,
  GradeBadge,
  Header,
  LessonRow,
  Modal,
  Private,
  Stat,
  TextLink,
  Toggle,
  Trend,
} from "./components";
import { uiStyles } from "./ThemePage";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
function LessonDetail({
  lesson,
  onClose,
}: {
  lesson: Lesson;
  onClose: () => void;
}) {
  return (
    <Modal title={lesson.subject} onClose={onClose}>
      <span className={`badge ${lesson.cancelled ? "warning" : ""}`}>
        {lesson.cancelled ? t("Elmarad") : lesson.state || "Tanóra"}
      </span>
      <dl className="detail-grid">
        <dt>{t("Időpont")}</dt>
        <dd>
          {dateLabel(lesson.date, true)} · {timeLabel(lesson.start)}–
          {timeLabel(lesson.end)}
        </dd>
        <dt>{t("Tanár")}</dt>
        <dd>{lesson.teacher || "—"}</dd>
        {lesson.substitute && (
          <>
            <dt>{t("Helyettesítő tanár")}</dt>
            <dd>{lesson.substitute}</dd>
          </>
        )}
        <dt>{t("Terem")}</dt>
        <dd>{lesson.room || "—"}</dd>
        <dt>{t("Óra témája")}</dt>
        <dd>{lesson.topic || "Még nincs megadva"}</dd>
      </dl>
    </Modal>
  );
}

export function Dashboard() {
  const { snapshot: s, navigate } = useApp();
  const clock = useClock();
  const offsetMs = (s.settings.bellOffsetMinutes ?? 0) * 60000;
  const nowMs = clock.getTime() - offsetMs;
  const all = grades(s.data.grades);
  const allLessons = useMemo(() => lessons(s.data.timetable), [s.data.timetable]);
  const intervals = useMemo(() => lessonIntervals(allLessons), [allLessons]);
  const live = useMemo(() => currentLiveStatus(intervals, nowMs), [intervals, nowMs]);
  const schedule = useMemo(() => allLessons.filter((l) => l.date === today()), [allLessons]);
  const activeLesson = useMemo(
    () =>
      schedule.find(
        (l) =>
          !l.cancelled &&
          schoolTimestamp(l.start) <= nowMs &&
          schoolTimestamp(l.end) > nowMs,
      ),
    [schedule, nowMs],
  );
  const [detail, setDetail] = useState<Lesson | null>(null);
  const account = s.accounts.find((a) => a.id === s.activeAccountId);
  const firstName = (str(s.data.student?.Nev) || account?.name || "")
    .trim()
    .split(" ")
    .slice(-1)[0];
  const hw = homeworkRows(s.data.homework).filter(
    (h) =>
      !h.done &&
      !s.completedHomework.includes(h.id) &&
      (!h.date || h.date >= today()),
  );
  const tests = testRows(s.data.tests).filter(
    (t) => !t.date || t.date >= today(),
  );
  const groups = subjectGroups(all);
  return (
    <>
      <Header
        eyebrow={new Date().toLocaleDateString(currentDateLocale(), {
          timeZone: "Europe/Budapest",
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        title={t("Szia, {name}!", undefined, { name: firstName })}
        description={t("Egy helyen minden, ami a tanítási napodhoz kell.")}
        action={
          <Button onClick={() => navigate("timetable")}>
            {t("Heti órarend")} <ArrowIcon />
          </Button>
        }
      />
      <div className="dashboard-grid">
        <div className="stack">
          <section
            className="card next-lesson lesson-status"
            style={
              {
                "--lesson-progress": `${live.progress}%`,
                "--lesson-progress-duration": "1s",
              } as React.CSSProperties
            }
          >
            <div className="lesson-fill" aria-hidden="true" />
            <div className="next-copy">
              <span className="eyebrow">
                <span
                  className={`live-dot ${
                    live.kind === "lesson"
                      ? ""
                      : live.kind === "break"
                        ? "warning"
                        : "quiet"
                  }`}
                />
                {live.label}
              </span>
              <h2>{live.title}</h2>
              <p>
                {live.kind === "lesson" || live.kind === "upcoming" ? (
                  <>
                    <Clock3 size={14} />
                    {live.details}
                  </>
                ) : (
                  live.details
                )}
              </p>
              {live.teacher && (
                <div className="next-teacher">{live.teacher}</div>
              )}
            </div>
            <div className="lesson-timer-wrap">
              {live.kind === "lesson" || live.kind === "break" ? (
                <div className="lesson-timer">
                  <strong className="lesson-remaining">{live.remaining}</strong>
                </div>
              ) : (
                <div className="timer">
                  <Sun size={42} strokeWidth={1.25} />
                </div>
              )}
              <button
                type="button"
                className="next-arrow"
                onClick={() => navigate("timetable")}
                aria-label={t("Órarend megnyitása")}
              >
                ↗
              </button>
            </div>
          </section>
          <Card
            title={
              <>
                {t("Mai óráid")}{" "}
                <span className="count">{schedule.length}</span>
              </>
            }
            action={
              <TextLink onClick={() => navigate("timetable")}>
                {t("Teljes órarend")}
              </TextLink>
            }
            className="schedule-card"
          >
            {schedule.length ? (
              schedule.map((l) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  active={l.id === activeLesson?.id}
                  onClick={() => setDetail(l)}
                />
              ))
            ) : (
              <Empty
                title={t("Mára nincs tanóra.")}
                text={t(
                  "Nézd meg a heti órarendet a következő tanítási naphoz.",
                )}
              />
            )}
          </Card>
          <Card
            title={t("Házi feladatok")}
            action={
              <TextLink onClick={() => navigate("homework")}>
                {t("Összes feladat")}
              </TextLink>
            }
          >
            {hw.length ? (
              hw.slice(0, 3).map((h) => (
                <button
                  key={h.id}
                  className="activity-item activity-button"
                  onClick={() => navigate("homework")}
                >
                  <span className="activity-icon">
                    <BookOpen size={19} />
                  </span>
                  <span className="activity-main">
                    <strong>{h.subject}</strong>
                    <span className="line-clamp">{h.text}</span>
                    <small>
                      {t("Határidő:")} {dateLabel(h.date)}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <Empty
                title={t("Nincs közelgő házi feladat.")}
                text={t("Most egy kicsit fellélegezhetsz.")}
              />
            )}
          </Card>
        </div>
        <aside className="stack">
          <Card className="average-card">
            <div className="row">
              <span className="stat-label">
                {t("Tanévi súlyozott átlagod")}
              </span>
              <GraduationCap size={22} />
            </div>
            <strong className="hero-average">
              <Private hide={s.settings.privateGrades}>
                {decimal(average(all))}
              </Private>
            </strong>
            <div className="row">
              <span className="muted small">
                {all.length} {t("értékelés ·")} {groups.length} {t("tantárgy")}
              </span>
              <button
                className="icon-button"
                aria-label={t("Statisztikák megnyitása")}
                onClick={() => navigate("statistics")}
              >
                <ArrowIcon />
              </button>
            </div>
            <Private hide={s.settings.privateGrades}>
              <div className="average-track">
                <i style={{ width: `${(average(all) ?? 0) * 20}%` }} />
              </div>
            </Private>
          </Card>
          <Card
            title={t("Legutóbbi jegyek")}
            action={
              <TextLink onClick={() => navigate("grades")}>
                {t("Mind")}
              </TextLink>
            }
          >
            {all.length ? (
              all.slice(0, 4).map((g) => (
                <div key={g.id} className="activity-item">
                  <GradeBadge grade={g} hide={s.settings.privateGrades} />
                  <div className="activity-main">
                    <strong>{g.subject}</strong>
                    <span className="line-clamp">{g.topic || g.type}</span>
                    <small>
                      {dateLabel(g.date)} · {g.weight}%
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <Empty title={t("Még nincs értékelés.")} />
            )}
          </Card>
          <Card
            title={t("Közelgő dolgozatok")}
            action={<CalendarDays size={17} className="muted" />}
          >
            {tests.length ? (
              tests.slice(0, 3).map((t) => (
                <div key={t.id} className="test-preview">
                  <div className="row">
                    <strong>{t.subject}</strong>
                    <span className="badge warning">{dateLabel(t.date)}</span>
                  </div>
                  <p>{t.text}</p>
                </div>
              ))
            ) : (
              <p className="muted small">
                {t("Nincs bejelentett számonkérés.")}
              </p>
            )}
          </Card>
          {schoolYearRows(s.data.schoolYear).length > 0 && (
            <Card title={t("A tanév rendje")}>
              {schoolYearRows(s.data.schoolYear).map((item) => (
                <div
                  className="test-preview"
                  key={`${item.date}-${item.description}`}
                >
                  <strong>{item.description}</strong>
                  <p>{dateLabel(item.date, true)}</p>
                </div>
              ))}
            </Card>
          )}
          <div className="local-note">
            <ShieldCheck size={17} />
            <span>{t("A te adataid. A te gépeden.")}</span>
          </div>
        </aside>
      </div>
      {detail && (
        <LessonDetail lesson={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}

export function Timetable() {
  const { snapshot, demo, act, toast } = useApp();
  const [offset, setOffset] = useState(0),
    [query, setQuery] = useState(""),
    [extra, setExtra] = useState<Raw[] | null>(null),
    [loading, setLoading] = useState(false),
    [detail, setDetail] = useState<Lesson | null>(null);
  const days = useMemo(() => weekDays(offset), [offset]);
  useEffect(() => {
    let alive = true;
    setExtra(null);
    if (offset === 0 || demo) return;
    setLoading(true);
    act<unknown>("timetable", { from: days[0], to: days[6] })
      .then((v) => {
        if (alive) setExtra(rows(v));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [offset, demo, days, act]);
  const all = lessons(extra ?? snapshot.data.timetable).filter((l) =>
    `${l.subject} ${l.teacher} ${l.room}`
      .toLocaleLowerCase("hu")
      .includes(query.toLocaleLowerCase("hu")),
  );
  const move = (n: number) => {
    setOffset(n);
    if (demo && n !== 0)
      toast("A bemutatóban csak az aktuális hét tartalmaz mintaórákat.");
  };
  return (
    <>
      <Header
        eyebrow={t("A HETED, EGY PILLANTÁSRA")}
        title={t("Órarend")}
        description={t(
          "Minden óra a helyén. Kattints egy órára a részletekhez.",
        )}
      />
      <div className="toolbar">
        <div className="row week-controls">
          <button
            className="icon-button"
            aria-label={t("Előző hét")}
            onClick={() => move(offset - 1)}
          >
            <ChevronLeft size={19} />
          </button>
          <strong>
            {dateLabel(days[0], true)} – {dateLabel(days[4])}
          </strong>
          <button
            className="icon-button"
            aria-label={t("Következő hét")}
            onClick={() => move(offset + 1)}
          >
            <ChevronRight size={19} />
          </button>
          <Button onClick={() => move(0)}>{t("Ez a hét")}</Button>
        </div>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("Tantárgy, tanár, terem…")}
        />
      </div>
      {loading && (
        <p className="info-line" role="status">
          {t("Az órarend betöltése…")}
        </p>
      )}
      <div
        className={`week-grid ${all.some((l) => days.slice(5).includes(l.date)) ? "with-weekends" : ""}`}
      >
        {(all.some((l) => days.slice(5).includes(l.date))
          ? days
          : days.slice(0, 5)
        ).map((day, i) => (
          <section
            key={day}
            className={`day-column ${day === today() ? "is-today" : ""}`}
          >
            <header className="day-header">
              <span>
                {
                  [
                    "Hétfő",
                    "Kedd",
                    "Szerda",
                    "Csütörtök",
                    "Péntek",
                    "Szombat",
                    "Vasárnap",
                  ][i]
                }
              </span>
              <strong>{dateLabel(day)}</strong>
              {day === today() && <span className="badge">{t("Ma")}</span>}
            </header>
            <div className="stack">
              {all
                .filter((l) => l.date === day)
                .map((l) => (
                  <button
                    key={l.id}
                    className={`timetable-lesson card ${l.cancelled ? "cancelled" : ""}`}
                    onClick={() => setDetail(l)}
                  >
                    <div className="row">
                      <span className="lesson-number">{l.number}</span>
                      <span className="small muted">
                        {timeLabel(l.start)}–{timeLabel(l.end)}
                      </span>
                    </div>
                    <strong>{l.subject}</strong>
                    <span className="muted small">
                      {l.substitute || l.teacher}
                    </span>
                    <span className="room-line">
                      <MapPin size={12} />
                      {l.room || "—"}
                      {l.cancelled && " · Elmarad"}
                    </span>
                  </button>
                ))}
              {!all.some((l) => l.date === day) && (
                <div className="day-empty">
                  {loading ? t("Betöltés…") : t("Nincs tanóra")}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      {detail && (
        <LessonDetail lesson={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-field">
      <Search size={16} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
function GradeStats({ items }: { items: Grade[] }) {
  const { snapshot } = useApp();
  const n = numericGrades(items);
  return (
    <div className="stat-grid">
      <Stat
        label={t("Súlyozott átlag")}
        value={
          <Private hide={snapshot.settings.privateGrades}>
            {decimal(average(items))}
          </Private>
        }
        note={t("A jegyek súlyával számolva")}
        className="accent-stat"
      />
      <Stat
        label={t("Értékelések")}
        value={items.length}
        note={`${n.length} számjegyes értékelés`}
      />
      <Stat
        label={t("Tantárgyak")}
        value={subjectGroups(items).length}
        note={t("A kiválasztott időszakban")}
      />
      <Stat
        label={t("Jeles értékelések")}
        value={
          <Private hide={snapshot.settings.privateGrades}>
            {n.filter((g) => g.value === 5).length}
          </Private>
        }
        note={t("Minden ötös egy kis siker")}
      />
    </div>
  );
}
function periodGrades(items: Grade[], period: string) {
  return items.filter(
    (g) =>
      period === "all" ||
      (period === "first"
        ? Number(g.date.slice(5, 7)) >= 9 || Number(g.date.slice(5, 7)) === 1
        : Number(g.date.slice(5, 7)) >= 2 && Number(g.date.slice(5, 7)) <= 8),
  );
}
export function Grades({ statistics = false }: { statistics?: boolean }) {
  const { snapshot: s, navigate } = useApp();
  const [period, setPeriod] = useState("all"),
    [query, setQuery] = useState(""),
    [subject, setSubject] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [simulation, setSimulation] = useState({ grade: 5, weight: 100 });
  const all = grades(s.data.grades);
  const filtered = periodGrades(all, period).filter(
    (g) =>
      (!statistics || !subject || g.subject === subject) &&
      (!start || g.date >= start) &&
      (!end || g.date <= end),
  );
  const groups = subjectGroups(filtered).filter((g) =>
    g.name.toLocaleLowerCase("hu").includes(query.toLocaleLowerCase("hu")),
  );
  const simulated = average([
    ...filtered,
    {
      id: "simulation",
      value: simulation.grade,
      weight: simulation.weight,
      subject: subject || "Szimuláció",
      date: today(),
      display: String(simulation.grade),
      topic: "",
      teacher: "",
      type: "",
      kind: "",
    },
  ]);
  return (
    <>
      <Header
        eyebrow={
          statistics
            ? t("TANULMÁNYI STATISZTIKÁK")
            : t("A TANÉVED · ÉRTÉKELÉSEK")
        }
        title={
          statistics ? t("Egy kicsit nagyobb kép.") : t("Jegyeid, átláthatóan.")
        }
        description={
          statistics
            ? t("Kövesd a fejlődésedet, és tervezz egy kicsit előre.")
            : t("Minden tantárgy, minden visszajelzés. A saját tempódban.")
        }
        action={
          <Button
            onClick={() => navigate(statistics ? "grades" : "statistics")}
          >
            {statistics ? t("Vissza a jegyekhez") : t("Részletes statisztikák")}
            <ArrowIcon />
          </Button>
        }
      />
      <div className="toolbar">
        <div className="tabs" aria-label={t("Időszak")}>
          {[
            ["all", "Egész tanév"],
            ["first", "1. félév"],
            ["second", "2. félév"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={period === value ? "selected" : ""}
              onClick={() => setPeriod(value)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        {statistics && (
          <select
            aria-label={t("Tantárgy")}
            className="form-control"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          >
            <option value="">{t("Minden tantárgy")}</option>
            {subjectGroups(all).map((g) => (
              <option key={g.name}>{g.name}</option>
            ))}
          </select>
        )}
      </div>
      <GradeStats items={filtered} />
      <div className={statistics ? "two-column" : ""}>
        <Card
          title={t("Így alakult az átlagod")}
          action={
            <span className="small muted">{t("Havi súlyozott átlag")}</span>
          }
        >
          <Trend
            trend={monthlyTrend(filtered)}
            hide={s.settings.privateGrades}
          />
        </Card>
        {statistics && (
          <Card title={t("Jegyek eloszlása")}>
            <Private hide={s.settings.privateGrades}>
              <div className="distribution">
                {[1, 2, 3, 4, 5].map((value) => {
                  const count = numericGrades(filtered).filter(
                    (g) => g.value === value,
                  ).length;
                  const max = Math.max(
                    1,
                    ...[1, 2, 3, 4, 5].map(
                      (v) =>
                        numericGrades(filtered).filter((g) => g.value === v)
                          .length,
                    ),
                  );
                  return (
                    <div key={value}>
                      <strong>{count}</strong>
                      <span
                        className={`distribution-bar grade-${value}`}
                        style={{
                          height: `${Math.max(3, (count / max) * 130)}px`,
                        }}
                      />
                      <span>{value}</span>
                    </div>
                  );
                })}
              </div>
            </Private>
          </Card>
        )}
      </div>
      {statistics ? (
        <>
          <Card title={t("Tantárgyi átlagok")} className="section-gap">
            <Private hide={s.settings.privateGrades}>
              <div className="subject-bars">
                {groups.length ? (
                  groups.map((g) => (
                    <button
                      key={g.name}
                      className="subject-bar"
                      onClick={() => setSubject(g.name)}
                    >
                      <strong>{g.name}</strong>
                      <span className="bar-track">
                        <i style={{ width: `${(g.average ?? 0) * 20}%` }} />
                      </span>
                      <b>
                        <Private hide={s.settings.privateGrades}>
                          {decimal(g.average)}
                        </Private>
                      </b>
                    </button>
                  ))
                ) : (
                  <Empty title={t("Nincs összehasonlítható adat.")} />
                )}
              </div>
            </Private>
          </Card>
          {classAverageRows(s.data.classAverages).length > 0 && (
            <Card title={t("Osztályátlagok")} className="section-gap">
              <Private hide={s.settings.privateGrades}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("Tantárgy")}</th>
                        <th>{t("Saját átlag")}</th>
                        <th>{t("Osztály / csoport")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classAverageRows(s.data.classAverages).map((g, i) => (
                        <tr key={g.id || i}>
                          <td>{g.name}</td>
                          <td>{decimal(g.student)}</td>
                          <td>{decimal(g.group)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Private>
            </Card>
          )}
          <div className="two-column section-gap">
            <Card title={t("Mi lenne, ha…")} action={<Sparkles size={18} />}>
              <p className="muted small">
                {t(
                  "Egy következő jegy várható hatása. Ez csak számítás, a naplóba nem kerül be.",
                )}
              </p>
              <div className="form-row">
                <label>
                  {t("Jegy")}
                  <select
                    className="form-control"
                    value={simulation.grade}
                    onChange={(e) =>
                      setSimulation({
                        ...simulation,
                        grade: Number(e.target.value),
                      })
                    }
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("Súly")}
                  <select
                    className="form-control"
                    value={simulation.weight}
                    onChange={(e) =>
                      setSimulation({
                        ...simulation,
                        weight: Number(e.target.value),
                      })
                    }
                  >
                    {[50, 100, 150, 200, 300].map((n) => (
                      <option value={n} key={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </label>
                <div className="simulation-result">
                  <small>{t("Várható átlag")}</small>
                  <strong>
                    <Private hide={s.settings.privateGrades}>
                      {decimal(simulated)}
                    </Private>
                  </strong>
                </div>
              </div>
            </Card>
            <Card title={t("Egyéni időszak")}>
              <p className="muted small">
                {t("A megadott dátumok az összes fenti kimutatást szűrik.")}
              </p>
              <div className="form-row">
                <label>
                  {t("Ettől")}
                  <input
                    className="form-control"
                    type="date"
                    value={start}
                    max={end || undefined}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  {t("Eddig")}
                  <input
                    className="form-control"
                    type="date"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              {(start || end) && (
                <TextLink
                  onClick={() => {
                    setStart("");
                    setEnd("");
                  }}
                >
                  {t("Dátumszűrő törlése")}
                </TextLink>
              )}
            </Card>
          </div>
        </>
      ) : (
        <>
          <div className="toolbar section-gap">
            <h2 className="section-title">
              {t("Tantárgyak")} <span className="count">{groups.length}</span>
            </h2>
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t("Tantárgy keresése…")}
            />
          </div>
          <div className="stack">
            {groups.map((g) => (
              <details key={g.name} className="card subject-card">
                <summary>
                  <div>
                    <h2>{g.name}</h2>
                    <small className="muted">
                      {g.items.length} {t("értékelés")}
                    </small>
                  </div>
                  <div className="grade-strip">
                    {g.items
                      .slice(0, 7)
                      .reverse()
                      .map((item) => (
                        <GradeBadge
                          key={item.id}
                          grade={item}
                          hide={s.settings.privateGrades}
                        />
                      ))}
                  </div>
                  <strong className="subject-average">
                    <Private hide={s.settings.privateGrades}>
                      {decimal(g.average)}
                    </Private>
                  </strong>
                  <ChevronRight size={16} />
                </summary>
                <div className="subject-prediction">
                  <span>
                    {t("Becsült jegy a beállított ponthatárok alapján:")}{" "}
                    <strong>
                      <Private hide={s.settings.privateGrades}>
                        {estimatedGrade(
                          g.average,
                          s.settings.gradeThresholds,
                        ) ?? "—"}
                      </Private>
                    </strong>
                  </span>
                  <span>{t("A végső értékelést a tanár állapítja meg.")}</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("Jegy")}</th>
                        <th>{t("Téma és típus")}</th>
                        <th>{t("Tanár")}</th>
                        <th>{t("Súly")}</th>
                        <th>{t("Dátum")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <GradeBadge
                              grade={item}
                              hide={s.settings.privateGrades}
                            />
                          </td>
                          <td>
                            <strong>{item.topic || "Értékelés"}</strong>
                            {item.type && !isJegyCode(item.type) && (
                              <span className="cell-secondary">{item.type}</span>
                            )}
                          </td>
                          <td>{item.teacher}</td>
                          <td>{item.weight}%</td>
                          <td>{dateLabel(item.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
            {!groups.length && (
              <Card>
                <Empty
                  title={t("Nincs értékelés ebben az időszakban.")}
                  text={t("Válassz másik félévet vagy módosítsd a keresést.")}
                />
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function Homework() {
  const { snapshot: s, act, update, demo } = useApp();
  const [query, setQuery] = useState(""),
    [showDone, setShowDone] = useState(false),
    [pending, setPending] = useState("");
  const match = (h: { subject: string; text: string }) =>
    `${h.subject} ${h.text}`
      .toLocaleLowerCase("hu")
      .includes(query.toLocaleLowerCase("hu"));
  const hw = homeworkRows(s.data.homework).filter(match),
    tests = testRows(s.data.tests).filter(match);
  async function toggle(id: string) {
    setPending(id);
    const complete = !s.completedHomework.includes(id);
    try {
      if (!demo) await act("complete_homework", { id, complete });
      else
        update({
          ...s,
          completedHomework: complete
            ? [...s.completedHomework, id]
            : s.completedHomework.filter((x) => x !== id),
        });
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <Header
        eyebrow={t("FELADATOK ÉS DOLGOZATOK")}
        title={t("A következő lépés.")}
        description={t("Legyen időd felkészülni. És időd minden másra is.")}
      />
      <div className="toolbar">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          {t("Elkészült feladatok is")}
        </label>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("Tantárgy vagy feladat keresése…")}
        />
      </div>
      <div className="content-grid">
        <section className="stack">
          <h2 className="section-title">
            {t("Házi feladatok")} <span className="count">{hw.length}</span>
          </h2>
          {hw
            .filter(
              (h) =>
                showDone || (!h.done && !s.completedHomework.includes(h.id)),
            )
            .map((h) => (
              <Card
                key={h.id}
                className={
                  h.done || s.completedHomework.includes(h.id)
                    ? "completed-task"
                    : ""
                }
              >
                <div className="row">
                  <span className="subject-label">
                    <BookOpen size={17} />
                    {h.subject}
                  </span>
                  <span
                    className={`badge ${h.date < today() ? "warning" : ""}`}
                  >
                    {dateLabel(h.date)}
                  </span>
                </div>
                <p className="prose">{h.text || "Nincs megadott leírás."}</p>
                <div className="row">
                  <span className="small muted">{h.teacher}</span>
                  <button
                    className={`task-complete ${h.done || s.completedHomework.includes(h.id) ? "done" : ""}`}
                    disabled={pending === h.id || h.done}
                    onClick={() => void toggle(h.id).catch(() => {})}
                  >
                    <Check size={15} />
                    {h.done
                      ? t("KRÉTA-ban kész")
                      : s.completedHomework.includes(h.id)
                        ? t("Helyben késznek jelölve")
                        : t("Helyben késznek jelölöm")}
                  </button>
                </div>
              </Card>
            ))}
          {!hw.filter(
            (h) => showDone || (!h.done && !s.completedHomework.includes(h.id)),
          ).length && (
            <Card>
              <Empty
                title={t("Minden feladattal megvagy.")}
                text={t("A kész jelölés csak ezen a gépen tárolódik.")}
              />
            </Card>
          )}
          <p className="muted small local-hint">
            <Info size={14} />
            {t(
              "A saját kész jelöléseid helyben tárolódnak; nem küldenek be megoldást.",
            )}
          </p>
        </section>
        <aside className="stack">
          <h2 className="section-title">
            {t("Dolgozatok")} <span className="count">{tests.length}</span>
          </h2>
          {tests.map((exam) => {
            const isPast = exam.date && exam.date < today();
            return (
              <Card key={exam.id} className={isPast ? "past-exam" : ""}>
                <div className="row">
                  <span className={`badge ${isPast ? "" : "warning"}`}>
                    {dateLabel(exam.date, true)}
                  </span>
                  {isPast && (
                    <span className="badge muted small">
                      {t("Múltbeli")}
                    </span>
                  )}
                </div>
                <h3>{exam.subject}</h3>
                <p className="prose">{exam.text || "Nincs megadott téma."}</p>
                <span className="small muted">
                  {exam.type} {exam.type && exam.teacher ? "·" : ""} {exam.teacher}
                </span>
              </Card>
            );
          })}
          {!tests.length && (
            <Card>
              <Empty title={t("Nincs bejelentett dolgozat.")} />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
export function Absences() {
  const { snapshot } = useApp();
  const all = absenceRows(snapshot.data.absences);
  const [filter, setFilter] = useState("all");
  const shown = all.filter(
    (a) =>
      filter === "all" || (filter === "justified" ? a.justified : !a.justified),
  );
  return (
    <>
      <Header
        eyebrow={t("JELENLÉT ÉS MULASZTÁSOK")}
        title={t("Hiányzások")}
        description={t(
          "A KRÉTÁ-ban rögzített mulasztások és igazolási állapotuk.",
        )}
      />
      <div className="stat-grid">
        <Stat
          label={t("Mulasztások")}
          value={all.length}
          note={t("Rögzített bejegyzés")}
        />
        <Stat
          label={t("Igazolt")}
          value={all.filter((a) => a.justified).length}
          note={t("Lezárt igazolások")}
        />
        <Stat
          label={t("Egyéb állapot")}
          value={all.filter((a) => !a.justified).length}
          note={t("Igazolatlan vagy elbírálás alatt")}
        />
        <Stat
          label={t("Késések")}
          value={all.reduce((sum, a) => sum + a.minutes, 0)}
          note={t("Perc összesen")}
        />
      </div>
      <Card
        title={t("Mulasztásaid")}
        action={
          <select
            className="form-control"
            aria-label={t("Igazolási állapot")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t("Minden állapot")}</option>
            <option value="justified">{t("Igazolt")}</option>
            <option value="other">{t("Egyéb állapot")}</option>
          </select>
        }
      >
        {shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Dátum")}</th>
                  <th>{t("Tantárgy")}</th>
                  <th>{t("Típus")}</th>
                  <th>{t("Állapot")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td>{dateLabel(a.date, true)}</td>
                    <td>
                      <strong>{a.subject}</strong>
                    </td>
                    <td>
                      {a.type}
                      {a.minutes > 0 && ` · ${a.minutes} perc`}
                    </td>
                    <td>
                      <span
                        className={`badge ${a.justified ? "success" : "warning"}`}
                      >
                        {a.status === "Igazolando"
                          ? t("Igazolandó")
                          : a.status || "Elbírálás alatt"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={t("Nincs rögzített mulasztás.")}
            text={t("A szűrésnek megfelelő bejegyzések itt jelennek meg.")}
          />
        )}
      </Card>
    </>
  );
}

export function Messages() {
  const { snapshot, act, demo } = useApp();
  const [folder, setFolder] = useState("messagesInbox"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Message | null>(null),
    [loading, setLoading] = useState(false);
  const all = messages(
    snapshot.data[folder],
    (
      {
        messagesInbox: "beerkezett",
        messagesSent: "elkuldott",
        messagesDeleted: "torolt",
      } as Record<string, string>
    )[folder],
  ).filter((m) =>
    `${m.subject} ${m.sender}`
      .toLocaleLowerCase("hu")
      .includes(query.toLocaleLowerCase("hu")),
  );
  async function open(m: Message) {
    setSelected(m);
    if (demo) return;
    setLoading(true);
    try {
      const detail = await act<Raw>("message_detail", { id: m.id });
      const normalized = messages([detail])[0];
      setSelected((old) =>
        old?.id === m.id
          ? {
              ...m,
              text:
                normalized?.text ||
                plain(detail.uzenet?.szoveg ?? detail.szoveg),
              attachments: normalized?.attachments ?? [],
              recipients: normalized?.recipients ?? [],
            }
          : old,
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Header
        eyebrow={t("KAPCSOLAT AZ ISKOLÁVAL")}
        title={t("Üzenetek")}
        description={t("Iskolai hírek és beszélgetések, egy helyen.")}
      />
      <div className="toolbar">
        <div className="tabs" aria-label={t("Üzenetmappák")}>
          {[
            ["messagesInbox", "Beérkezett"],
            ["messagesSent", "Elküldött"],
            ["messagesDeleted", "Törölt"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={folder === value ? "selected" : ""}
              onClick={() => {
                setFolder(value);
                setSelected(null);
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("Üzenet keresése…")}
        />
      </div>
      <p className="muted small">
        {t("Az e-Ügyintézés hivatalos postafiókja.")}
      </p>
      <Card className="message-list">
        {all.length ? (
          all.map((m) => (
            <button
              key={m.id}
              className={`message-row ${m.read ? "" : "unread"}`}
              onClick={() => void open(m).catch(() => {})}
            >
              <span className="sender-avatar">
                {m.sender.slice(0, 1) || "K"}
              </span>
              <span className="message-copy">
                <strong>{m.subject}</strong>
                <small>{m.sender || "KRÉTA"}</small>
              </span>
              <span className="muted small">{dateLabel(m.date)}</span>
              {!m.read && <span className="unread-dot" />}
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty
            title={t("Ez a mappa most üres.")}
            text={t("A következő frissítéskor az új üzenetek is megjelennek.")}
          />
        )}
      </Card>
      {selected && (
        <Modal title={selected.subject} onClose={() => setSelected(null)}>
          <div className="row message-meta">
            <span>
              <strong>{selected.sender}</strong>
              <small>{dateLabel(selected.date, true)}</small>
            </span>
            <Mail size={21} />
          </div>
          {selected.recipients.length > 0 && (
            <p className="small muted section-gap">
              {t("Címzettek:")}{" "}
              {selected.recipients
                .map((r) => str(r.nev ?? r.Nev))
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          {loading ? (
            <p role="status">{t("Az üzenet betöltése…")}</p>
          ) : (
            <p className="prose message-body">
              {selected.text || "Az üzenetnek nincs szöveges tartalma."}
            </p>
          )}
          {selected.attachments.map((a, i) => (
            <button
              className="attachment"
              key={i}
              onClick={() =>
                void act("open_school", {
                  institutionCode: snapshot.accounts.find(
                    (x) => x.id === snapshot.activeAccountId,
                  )?.institutionCode,
                }).catch(() => {})
              }
            >
              <ArrowDownToLine size={17} />
              {str(a.fajlNev ?? a.nev ?? a.Nev) || "Melléklet"}{" "}
              {t("· KRÉTA megnyitása")}
            </button>
          ))}
        </Modal>
      )}
    </>
  );
}

export function Consultations() {
  const { snapshot, act, demo } = useApp();
  const all = consultationRows(snapshot.data.consultations);
  const [detail, setDetail] = useState<Raw | null>(null);
  return (
    <>
      <Header
        eyebrow={t("EGY KIS SZEMÉLYES FIGYELEM")}
        title={t("Fogadóórák")}
        description={t(
          "Tanárok, időpontok és a személyes megbeszélések helye.",
        )}
      />
      <p className="info-line">
        <Info size={17} />
        {t(
          "Az időpontokat itt áttekintheted. Foglalásra a hivatalos KRÉTA felület használható.",
        )}
      </p>
      <div className="two-column">
        {all.map((hour, i) => (
          <Card key={i}>
            <div className="row">
              <span className="activity-icon">
                <User size={22} />
              </span>
              <span className="badge">
                {str(hour.tantargyNev) || "Fogadóóra"}
              </span>
            </div>
            <h2>
              {str(hour.tanarNev ?? hour.TanarNeve) || "Tanári fogadóóra"}
            </h2>
            <p>
              <CalendarDays size={15} />{" "}
              {dateLabel(hour.idopont ?? hour.KezdetIdopont, true)} ·{" "}
              {timeLabel(hour.idopont ?? hour.KezdetIdopont)}
            </p>
            <p className="muted small">
              {str(hour.teremNev ?? hour.TeremNeve)}
            </p>
            {hour.foglalas && (
              <span className="badge success">
                {t("Lefoglalva ·")}{" "}
                {typeof hour.foglalas === "string"
                  ? hour.foglalas
                  : str(hour.foglalas.idopont)}
              </span>
            )}
            <div className="row">
              <Button
                onClick={() => {
                  if (demo) setDetail(hour);
                  else
                    void act<Raw>("consulting_hour", {
                      id: str(
                        hour.Uid ?? hour.uid ?? hour.id ?? hour.azonosito,
                      ),
                    })
                      .then((data) => setDetail({ ...hour, ...data }))
                      .catch(() => {});
                }}
              >
                {t("Részletek")} <ChevronRight size={15} />
              </Button>
              <SchoolLink />
            </div>
          </Card>
        ))}
        {!all.length && (
          <Card>
            <Empty
              title={t("Jelenleg nincs elérhető fogadóóra.")}
              text={t(
                "Az iskola által meghirdetett alkalmak itt jelennek meg.",
              )}
            />
          </Card>
        )}
      </div>
      {detail && (
        <Modal title={t("Fogadóóra részletei")} onClose={() => setDetail(null)}>
          <dl className="detail-grid">
            <dt>{t("Tanár")}</dt>
            <dd>
              {str(detail.tanarNev ?? detail.Tanar?.Nev ?? detail.TanarNeve) ||
                "Nincs megadva"}
            </dd>
            <dt>{t("Időpont")}</dt>
            <dd>
              {dateLabel(
                detail.KezdoIdopont ?? detail.idopont ?? detail.KezdetIdopont,
                true,
              )}{" "}
              ·{" "}
              {timeLabel(
                detail.KezdoIdopont ?? detail.idopont ?? detail.KezdetIdopont,
              )}
              –{timeLabel(detail.VegIdopont ?? detail.vegIdopont)}
            </dd>
            <dt>{t("Terem")}</dt>
            <dd>
              {str(detail.Terem?.Nev ?? detail.teremNev ?? detail.TeremNeve) ||
                "Nincs megadva"}
            </dd>
          </dl>
          {rows(detail.Idopontok).length > 0 && (
            <div className="section-gap">
              <h3>{t("Idősávok")}</h3>
              {rows(detail.Idopontok).map((slot, i) => (
                <div className="setting-row" key={i}>
                  <span>
                    {timeLabel(slot.KezdoIdopont)}
                    {slot.VegIdopont && `–${timeLabel(slot.VegIdopont)}`}
                  </span>
                  {slot.IsJelentkeztem && (
                    <span className="badge success">{t("Saját foglalás")}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="muted small section-gap">
            {t("Időpontot a hivatalos KRÉTA felületén foglalhatsz.")}
          </p>
          <SchoolLink />
        </Modal>
      )}
    </>
  );
}
function SchoolLink() {
  const { snapshot, demo, act } = useApp();
  const account = snapshot.accounts.find(
    (a) => a.id === snapshot.activeAccountId,
  );
  return demo ? (
    <span className="small muted">{t("Bemutató intézmény")}</span>
  ) : (
    <button
      className="text-link"
      onClick={() =>
        void act("open_school", {
          institutionCode: account?.institutionCode,
        }).catch(() => {})
      }
    >
      {t("Hivatalos KRÉTA")} <ExternalLink size={14} />
    </button>
  );
}
export function Lep() {
  const { snapshot, demo, act, toast } = useApp();
  const [pending, setPending] = useState("");
  const all = rows(snapshot.data.lep);
  const [confirm, setConfirm] = useState<{
    id: string;
    allowed: boolean;
  } | null>(null);
  async function permission() {
    if (!confirm) return;
    setPending(confirm.id);
    try {
      if (demo) toast("Bemutató módban nem módosul a részvételi engedély.");
      else
        await act("lep_permission", {
          eventId: confirm.id,
          isPermitted: confirm.allowed,
        });
      setConfirm(null);
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <Header
        eyebrow={t("LÁZÁR ERVIN PROGRAM")}
        title={t("Élmények az iskolán túl.")}
        description={t("Előadások, közös programok és részvételi engedélyek.")}
      />
      <div className="stack">
        {all.map((event, i) => (
          <Card key={i}>
            <div className="row">
              <span className="badge">
                {dateLabel(event.datum ?? event.Datum, true)}
              </span>
              <Sparkles size={21} className="accent" />
            </div>
            <h2>{str(event.eloadasCim ?? event.Cim) || "LEP esemény"}</h2>
            <p className="muted">
              {str(event.helyszin)}
              {event.idotartam && ` · ${event.idotartam} perc`}
            </p>
            <p className="prose">{plain(event.leiras)}</p>
            {event.engedelyezheto ? (
              <div className="row">
                <Button
                  primary
                  onClick={() =>
                    setConfirm({ id: str(event.eloadasId), allowed: true })
                  }
                >
                  {t("Részvétel engedélyezése")}
                </Button>
                <Button
                  onClick={() =>
                    setConfirm({ id: str(event.eloadasId), allowed: false })
                  }
                >
                  {t("Elutasítás")}
                </Button>
              </div>
            ) : (
              <span className={`badge ${event.engedelyezve ? "success" : ""}`}>
                {event.engedelyezve
                  ? t("Engedélyezve")
                  : t("Nincs engedélyezve")}
              </span>
            )}
          </Card>
        ))}
        {!all.length && (
          <Card>
            <Empty title={t("Nincsenek elérhető LEP események.")} />
          </Card>
        )}
      </div>
      {confirm && (
        <Modal
          title={t("Részvételi engedély")}
          onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.allowed ? t("Engedélyezed") : t("Elutasítod")}{" "}
            {t(
              "a részvételt ezen az eseményen? A döntés a KRÉTA rendszerébe kerül.",
            )}
          </p>
          <div className="dialog-actions">
            <Button onClick={() => setConfirm(null)}>{t("Mégse")}</Button>
            <Button
              primary
              disabled={Boolean(pending)}
              onClick={() => void permission().catch(() => {})}
            >
              {pending ? t("Mentés…") : t("Döntés mentése")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Profile() {
  const { snapshot: s, act, demo, addAccount, toast } = useApp();
  const student = s.data.student ?? {},
    account = s.accounts.find((a) => a.id === s.activeAccountId);
  const [contact, setContact] = useState(false),
    [bankEdit, setBankEdit] = useState(false),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(str(student.EmailCim)),
    [phone, setPhone] = useState(str(student.Telefonszam));
  const bank = student.Bankszamla ?? {};
  const [bankForm, setBankForm] = useState({
    accountNumber: str(bank.BankszamlaSzam),
    ownerName: str(bank.BankszamlaTulajdonosNeve),
    ownerTypeId: Number(bank.BankszamlaTulajdonosTipusId) || 1,
    bankName: str(bank.SzamlavezetoBank),
  });
  const [remove, setRemove] = useState(false);
  async function saveContact() {
    setBusy(true);
    try {
      if (demo) toast("A bemutatóban nincs módosítható KRÉTA-fiók.");
      else {
        await act("update_contact", { email, phone });
        toast("Elérhetőségek mentve.");
      }
      setContact(false);
    } finally {
      setBusy(false);
    }
  }
  async function saveBank() {
    setBusy(true);
    try {
      if (demo) toast("A bemutatóban nincs módosítható KRÉTA-fiók.");
      else {
        await act("update_bank_account", { bankAccount: bankForm });
        toast("Bankszámlaadatok mentve.");
      }
      setBankEdit(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header
        eyebrow={t("A TE FIÓKOD")}
        title={t("Profilom")}
        description={t(
          "Iskolai adatok és elérhetőségek, a KRÉTA rendszeréből.",
        )}
        action={
          <Button onClick={addAccount}>
            <Plus size={16} />
            {t("Fiók hozzáadása")}
          </Button>
        }
      />
      <div className="profile-banner card">
        <span className="large-avatar">
          {(str(student.Nev) || account?.name || "K")
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <h2>{str(student.Nev) || account?.name}</h2>
          <p>{str(student.IntezmenyNev) || account?.institutionName}</p>
          <span className="badge">
            {str(student.Osztaly) || "Tanulói profil"}
          </span>
        </div>
        <ShieldCheck size={30} className="profile-shield" />
      </div>
      <div className="two-column section-gap">
        <div className="stack">
          <Card title={t("Személyes adatok")}>
            <dl className="detail-grid">
              <dt>{t("Név")}</dt>
              <dd>{str(student.Nev) || "—"}</dd>
              <dt>{t("Intézmény")}</dt>
              <dd>
                {str(student.IntezmenyNev) || account?.institutionName || "—"}
              </dd>
              <dt>{t("Intézménykód")}</dt>
              <dd>
                {str(student.IntezmenyAzonosito) ||
                  account?.institutionCode ||
                  "—"}
              </dd>
              {student.SzuletesiDatum && (
                <>
                  <dt>{t("Születési dátum")}</dt>
                  <dd>{dateLabel(student.SzuletesiDatum, true)}</dd>
                </>
              )}
              {!student.SzuletesiDatum && student.SzuletesiEv && (
                <>
                  <dt>{t("Születési dátum")}</dt>
                  <dd>
                    {student.SzuletesiEv}. {student.SzuletesiHonap}.{" "}
                    {student.SzuletesiNap}.
                  </dd>
                </>
              )}
              <dt>{t("Lakcím")}</dt>
              <dd>
                {Array.isArray(student.Cimek) ? student.Cimek.join("; ") : "—"}
              </dd>
              <dt>{t("Tanulói azonosító")}</dt>
              <dd>{str(student.OktatasiAzonosito ?? student.Uid) || "—"}</dd>
            </dl>
          </Card>
          <Card
            title={t("Elérhetőségek")}
            action={
              <TextLink onClick={() => setContact(true)}>
                {t("Szerkesztés")}
              </TextLink>
            }
          >
            <dl className="detail-grid">
              <dt>{t("E-mail")}</dt>
              <dd>{str(student.EmailCim) || "Nincs megadva"}</dd>
              <dt>{t("Telefonszám")}</dt>
              <dd>{str(student.Telefonszam) || "Nincs megadva"}</dd>
            </dl>
          </Card>
        </div>
        <div className="stack">
          <Card title={t("Gondviselők")}>
            {rows(student.Gondviselok).length ? (
              rows(student.Gondviselok).map((g, i) => (
                <div className="activity-item" key={i}>
                  <span className="sender-avatar">
                    <User size={20} />
                  </span>
                  <div className="activity-main">
                    <strong>{str(g.Nev)}</strong>
                    <span>
                      {str(g.EmailCim) ||
                        str(g.Telefonszam) ||
                        "Nincs elérhetőség megadva"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted small">
                {t("Nincs megjeleníthető gondviselői adat.")}
              </p>
            )}
          </Card>
          <Card
            title={t("Bankszámlaadatok")}
            action={
              !bank.IsReadOnly && (
                <TextLink onClick={() => setBankEdit(true)}>
                  {t("Szerkesztés")}
                </TextLink>
              )
            }
          >
            <dl className="detail-grid">
              <dt>{t("Számlatulajdonos")}</dt>
              <dd>{str(bank.BankszamlaTulajdonosNeve) || "Nincs megadva"}</dd>
              <dt>{t("Számlaszám")}</dt>
              <dd>{str(bank.BankszamlaSzam) || "Nincs megadva"}</dd>
            </dl>
            {bank.BankszamlaSzam && !bank.IsReadOnly && (
              <button
                className="text-link danger"
                onClick={() => setRemove(true)}
              >
                <Trash2 size={14} />
                {t("Bankszámlaadatok törlése")}
              </button>
            )}
          </Card>
          <Card title={t("Hozzáadott fiókok")}>
            {s.accounts.map((a) => (
              <div key={a.id} className="account-row">
                <span className="sender-avatar">{a.name.slice(0, 1)}</span>
                <div>
                  <strong>{a.name}</strong>
                  <small>{a.institutionName}</small>
                </div>
                {a.id === s.activeAccountId ? (
                  <span className="badge success">{t("Aktív")}</span>
                ) : (
                  <Button
                    onClick={() =>
                      void act("select_account", { accountId: a.id }).catch(
                        () => {},
                      )
                    }
                  >
                    {t("Váltás")}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </div>
      </div>
      {contact && (
        <Modal
          title={t("Elérhetőségek szerkesztése")}
          onClose={() => setContact(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveContact().catch(() => {});
            }}
          >
            <p className="muted small">
              {t("A mentés frissíti a KRÉTA-ban tárolt elérhetőségeidet.")}
            </p>
            <label className="field">
              {t("E-mail")}
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              {t("Telefonszám")}
              <input
                className="form-control"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setContact(false)}>{t("Mégse")}</Button>
              <Button type="submit" primary disabled={busy}>
                {busy ? t("Mentés…") : t("Mentés a KRÉTA-ba")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {bankEdit && (
        <Modal
          title={t("Bankszámlaadatok szerkesztése")}
          onClose={() => setBankEdit(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveBank().catch(() => {});
            }}
          >
            <p className="muted small">
              {t("A mentés frissíti a KRÉTA-ban tárolt bankszámlaadatokat.")}
            </p>
            <label className="field">
              {t("Számlaszám")}
              <input
                required
                className="form-control"
                value={bankForm.accountNumber}
                onChange={(e) =>
                  setBankForm({ ...bankForm, accountNumber: e.target.value })
                }
              />
            </label>
            <label className="field">
              {t("Tulajdonos neve")}
              <input
                required
                className="form-control"
                value={bankForm.ownerName}
                onChange={(e) =>
                  setBankForm({ ...bankForm, ownerName: e.target.value })
                }
              />
            </label>
            <label className="field">
              {t("Tulajdonos")}
              <select
                className="form-control"
                value={bankForm.ownerTypeId}
                onChange={(e) =>
                  setBankForm({
                    ...bankForm,
                    ownerTypeId: Number(e.target.value),
                  })
                }
              >
                <option value={1}>{t("Szülő")}</option>
                <option value={2}>{t("Tanuló")}</option>
              </select>
            </label>
            <label className="field">
              {t("Bank neve")}
              <input
                required
                className="form-control"
                value={bankForm.bankName}
                onChange={(e) =>
                  setBankForm({ ...bankForm, bankName: e.target.value })
                }
              />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setBankEdit(false)}>{t("Mégse")}</Button>
              <Button type="submit" primary disabled={busy}>
                {busy ? t("Mentés…") : t("Mentés a KRÉTA-ba")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title={t("Bankszámlaadatok törlése")}
          onClose={() => setRemove(false)}
        >
          <p>{t("Eltávolítod a bankszámlaadatokat a KRÉTA rendszeréből?")}</p>
          <div className="dialog-actions">
            <Button onClick={() => setRemove(false)}>{t("Mégse")}</Button>
            <Button
              onClick={() => {
                if (demo) {
                  toast("Bemutató mód: nincs módosítás.");
                  setRemove(false);
                } else
                  void act("delete_bank_account")
                    .then(() => setRemove(false))
                    .catch(() => {});
              }}
            >
              {t("Adatok törlése")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const { snapshot: s, settings, act, demo, toast, navigate } = useApp();
  const save = (value: Partial<Settings>) => {
    void settings(value).catch(() => {});
  };
  const subjects = subjectGroups(grades(s.data.grades));
  return (
    <>
      <Header
        eyebrow={t("BEÁLLÍTÁSOK")}
        title={t("Legyen a te naplód.")}
        description={t(
          "Egy kis szín. Egy kis nyugalom. Pont úgy, ahogy szereted.",
        )}
      />
      <div className="settings-grid">
        <div className="stack">
          <Card
            title={t("Megjelenés")}
            action={<span className="badge">{t("A te stílusod")}</span>}
          >
            <div className="theme-shortcut">
              <span>
                <strong>
                  {t("Felület stílusa")}:{" "}
                  {uiStyles.find((u) => u.id === s.settings.uiStyle)?.label ??
                    "Glassmorphism"}
                </strong>
                <small>
                  {t(
                    "A stílus, a színek, a sötét mód, a háttér és a betűk a Téma oldalon állíthatók.",
                  )}
                </small>
              </span>
              <Button primary onClick={() => navigate("theme")}>
                <Paintbrush size={16} />
                {t("Téma beállítások")}
              </Button>
            </div>
            <Toggle
              label={t("Jegyek elrejtése")}
              description={t(
                "Az elrejtett jegyet és átlagot kattintással fedheted fel.",
              )}
              checked={s.settings.privateGrades}
              onChange={(privateGrades) => save({ privateGrades })}
            />
          </Card>
          <Card title={t("Háttérben is veled")} action={<Bell size={18} />}>
            <Toggle
              label={t("Asztali értesítések")}
              description={t(
                "Új jegyekről, üzenetekről és iskolai változásokról.",
              )}
              checked={s.settings.notificationsEnabled}
              onChange={(notificationsEnabled) =>
                save({ notificationsEnabled })
              }
            />
            <label className="setting-row">
              <span>
                <strong>{t("Frissítés gyakorisága")}</strong>
                <small>{t("A háttérben, az ablak bezárása után is.")}</small>
              </span>
              <select
                aria-label={t("Frissítés gyakorisága")}
                className="form-control"
                value={s.settings.pollIntervalMinutes}
                onChange={(e) =>
                  save({ pollIntervalMinutes: Number(e.target.value) })
                }
              >
                {[1, 2, 5, 10, 15, 30, 60].map((n) => (
                  <option value={n} key={n}>
                    {n} {t("percenként")}
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              label={t("Indítás bejelentkezéskor")}
              description={t("A KRETÉN Desktop induljon el a rendszerrel.")}
              checked={s.settings.launchAtStartup}
              onChange={(launchAtStartup) => save({ launchAtStartup })}
            />
            <Toggle
              label={t("Indítás a háttérben")}
              description={t("Induláskor csak a rendszertálcán jelenjen meg.")}
              checked={s.settings.startMinimized}
              onChange={(startMinimized) => save({ startMinimized })}
            />
            <div className="section-gap">
              <Button
                onClick={() =>
                  demo
                    ? toast(
                        "Bemutató mód: az asztali értesítéshez indítsd el a natív alkalmazást.",
                      )
                    : void act("test_notification").catch(() => {})
                }
              >
                <Bell size={16} />
                {t("Próbaértesítés")}
              </Button>
            </div>
          </Card>
          <Card title={t("Tantárgyi értesítések")}>
            <p className="muted small">
              {t(
                "A kikapcsolt tantárgyakból nem érkezik jegy-, feladat- és dolgozatértesítés. Az adatok továbbra is láthatók a naplóban.",
              )}
            </p>
            {subjects.map((g) => (
              <Toggle
                key={g.name}
                label={g.name}
                description={`${g.items.length} értékelés`}
                checked={!s.settings.mutedSubjects?.includes(g.name)}
                onChange={(enabled) =>
                  save({
                    mutedSubjects: enabled
                      ? (s.settings.mutedSubjects ?? []).filter(
                          (v) => v !== g.name,
                        )
                      : [...(s.settings.mutedSubjects ?? []), g.name],
                  })
                }
              />
            ))}
            {!subjects.length && (
              <p className="muted small">
                {t("A tantárgyak az első szinkronizálás után jelennek meg.")}
              </p>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card
            className="about-card"
            title={t("A KRETÉN-ről")}
            action={<Sparkles size={19} />}
          >
            <p className="about-tagline">
              {t("A te naplód.")}
              <br />
              {t("A te gépeden.")}
            </p>
            <p className="muted">
              {t(
                "A KRETÉN üveges megjelenése, a Firka mobilos KRÉTA-kapcsolatával. Most az asztalodon.",
              )}
            </p>
            <div className="about-feature">
              <ShieldCheck size={18} />
              <span>{t("Helyi adattárolás")}</span>
            </div>
            <div className="about-feature">
              <WifiOff size={18} />
              <span>{t("Offline is olvasható napló")}</span>
            </div>
            <div className="about-feature">
              <Bell size={18} />
              <span>{t("Frissítések a háttérben")}</span>
            </div>
            <p className="small muted section-gap">
              {t("KRETÉN Desktop · 0.1.0")}
              <br />
              {t(
                "Független, nyílt forráskódú KRÉTA-kliens. Nem a KRÉTA hivatalos alkalmazása.",
              )}
            </p>
          </Card>
          <Card title={t("Az ablak bezárása után")}>
            <p className="muted small">
              {t(
                "A KRETÉN a rendszertálcán marad, és tovább ellenőrzi az új adatokat. Az ikonnal visszanyithatod, frissítheted vagy teljesen bezárhatod.",
              )}
            </p>
            <Button
              onClick={() =>
                demo
                  ? toast("A bemutatót a bal alsó gombbal zárhatod be.")
                  : void act("quit_app").catch(() => {})
              }
            >
              {t("Teljes kilépés")}
            </Button>
          </Card>
          <Card title={t("Adatvédelem")}>
            <p className="muted small">
              {t(
                "A bejelentkezést a hivatalos KRÉTA OAuth-felület kezeli. A napló adatai és a beállítások ezen a gépen maradnak. Nincs saját felhős közvetítő.",
              )}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
export function Notifications() {
  const { snapshot: s, act, demo, update } = useApp();
  async function dismiss(id: string) {
    if (!demo) await act("dismiss_notification", { id });
    else
      update({
        ...s,
        notifications: s.notifications.filter((n) => n.id !== id),
      });
  }
  return (
    <>
      <Header
        eyebrow={t("AMIRŐL ÉRDEMES TUDNOD")}
        title={t("Értesítések")}
        description={t(
          "A háttérben észlelt új bejegyzések, a gépeden megőrizve.",
        )}
      />
      <Card
        title={
          <>
            {t("Legutóbbi változások")}{" "}
            <span className="count">{s.notifications.length}</span>
          </>
        }
      >
        {s.notifications.length ? (
          s.notifications.map((n) => (
            <div className="notification-row" key={n.id}>
              <span className="activity-icon">
                <Bell size={20} />
              </span>
              <div className="activity-main">
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>
                  {dateLabel(n.createdAt, true)} · {timeLabel(n.createdAt)}
                </small>
              </div>
              <button
                className="icon-button"
                title={t("Értesítés elvetése")}
                aria-label={`Értesítés elvetése: ${n.title}`}
                onClick={() => void dismiss(n.id).catch(() => {})}
              >
                <CheckCheck size={18} />
              </button>
            </div>
          ))
        ) : (
          <Empty
            title={t("Minden frissítéssel képben vagy.")}
            text={t(
              "Az új jegyek, üzenetek és más változások itt jelennek meg.",
            )}
          />
        )}
      </Card>
    </>
  );
}

export function Notes() {
  const { snapshot: s } = useApp();
  const all = noteRows(s.data.notes, s.data.notices);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<NoteItem | null>(null);

  const deficitCount = all.filter((i) => i.isHomeworkDeficit).length;
  const praiseCount = all.filter((i) => i.isPraise).length;

  const filtered = all.filter((item) => {
    if (filter === "deficits" && !item.isHomeworkDeficit) return false;
    if (filter === "praises" && !item.isPraise) return false;
    if (filter === "warnings" && !item.isWarning) return false;
    if (filter === "notes" && item.kind !== "note") return false;
    if (filter === "notices" && item.kind !== "notice") return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
      <Header
        eyebrow={t("HIVATALOS ÉRTESÍTÉSEK")}
        title={t("Feljegyzések")}
        description={t(
          "Tanári bejegyzések, dicséretek, figyelmeztetések, házi feladat hiányok és iskolai hírek.",
        )}
      />
      <div className="toolbar">
        <div className="tabs" aria-label={t("Kategóriák")}>
          {[
            ["all", "Mind"],
            ["notes", "Feljegyzések"],
            ["deficits", `Házi hiány (${deficitCount})`],
            ["praises", `Dicséretek (${praiseCount})`],
            ["warnings", "Figyelmeztetések"],
            ["notices", "Faliújság"],
          ].map(([val, label]) => (
            <button
              key={val}
              className={filter === val ? "selected" : ""}
              onClick={() => setFilter(val)}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("Keresés a feljegyzésekben…")}
        />
      </div>
      <Card className="message-list section-gap">
        {filtered.length ? (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className="message-row"
              onClick={() => setSelected(item)}
            >
              <span className="sender-avatar" aria-hidden="true">
                {item.author.slice(0, 1) || (item.kind === "notice" ? "F" : "T")}
              </span>
              <span className="message-copy">
                <strong>{item.title}</strong>
                <small>
                  {item.author} {item.type ? `· ${item.type}` : ""}
                </small>
                {item.text && (
                  <span className="notice-preview line-clamp">
                    {item.text}
                  </span>
                )}
              </span>
              <span
                className={`badge ${
                  item.isHomeworkDeficit
                    ? "warning"
                    : item.isPraise
                      ? "success"
                      : item.isWarning
                        ? "danger"
                        : ""
                }`}
              >
                {item.type || (item.kind === "notice" ? t("Faliújság") : t("Feljegyzés"))}
              </span>
              <span className="muted small">{dateLabel(item.date)}</span>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <Empty
            title={t("Nincs megjeleníthető feljegyzés.")}
            text={t(
              "A tanárok által rögzített hivatalos bejegyzések és faliújság-hírek itt jelennek meg.",
            )}
          />
        )}
      </Card>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="row message-meta">
            <div>
              <strong>{selected.author}</strong>
              <div className="small muted">
                {selected.type} · {dateLabel(selected.date, true)}
              </div>
            </div>
            <span
              className={`badge ${
                selected.isHomeworkDeficit
                  ? "warning"
                  : selected.isPraise
                    ? "success"
                    : selected.isWarning
                      ? "danger"
                      : ""
              }`}
            >
              {selected.type}
            </span>
          </div>
          <div className="prose message-body section-gap">
            {selected.text || t("Nincs megadott szöveges tartalom.")}
          </div>
        </Modal>
      )}
    </>
  );
}
