import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, GraduationCap, Info, Palmtree, Sun } from "lucide-react";
import { useApp } from "./context";
import { Card, Header } from "./components";
import { dateLabel, today } from "./data";
import { t } from "./i18n";
import {
  breakProgress,
  schoolCalendar,
  weekProgress,
  yearProgress,
  type SchoolBreak,
} from "./progress";

const HOUR = 3_600_000;

function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function days(n: number) {
  return t("{n} nap", undefined, { n });
}

/** "2 nap 5 óra" / "5 óra" for short countdowns. */
function duration(ms: number) {
  const hours = Math.floor(ms / HOUR);
  const d = Math.floor(hours / 24),
    h = hours % 24;
  if (d === 0) return t("{h} óra", undefined, { h });
  return h ? `${days(d)} ${t("{h} óra", undefined, { h })}` : days(d);
}

function Meter({
  percent,
  label,
  tone = "",
}: {
  percent: number;
  label: string;
  tone?: string;
}) {
  const value = Math.round(percent * 10) / 10;
  return (
    <div className="progress-meter-wrap">
      <div
        className={`progress-meter ${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-percent">{value.toFixed(value < 10 ? 1 : 0)}%</span>
    </div>
  );
}

function ProgressCard({
  icon,
  title,
  big,
  caption,
  percent,
  tone,
  from,
  to,
  estimated,
  children,
}: {
  icon: ReactNode;
  title: string;
  big: string;
  caption: string;
  percent: number;
  tone?: string;
  from: string;
  to: string;
  estimated?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card
      className={`progress-card ${tone ?? ""}`}
      title={
        <>
          <span className="progress-icon">{icon}</span>
          {title}
        </>
      }
      action={estimated ? <span className="badge warning">{t("Becslés")}</span> : undefined}
    >
      <div className="progress-figure">
        <strong>{big}</strong>
        <span>{caption}</span>
      </div>
      <Meter percent={percent} label={title} tone={tone} />
      <div className="progress-ends">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      {children}
    </Card>
  );
}

export function ProgressPage() {
  const { snapshot } = useApp();
  const now = useMinuteClock();
  const day = today();
  // The calendar only changes with the school data or the date.
  const calendar = useMemo(
    () => schoolCalendar(snapshot.data.schoolYear, new Date()),
    [snapshot.data.schoolYear, day],
  );
  const week = weekProgress(now);
  const pause = breakProgress(calendar, now);
  const year = yearProgress(calendar, now);
  const upcoming = calendar.breaks.filter((b) => b.end >= day);
  const anyEstimate =
    calendar.firstEstimated || calendar.lastEstimated || calendar.breaks.some((b) => b.estimated);

  const breakName = (b: SchoolBreak) => t(b.name);

  return (
    <>
      <Header
        eyebrow={t("VISSZASZÁMLÁLÁS")}
        title={t("Haladás")}
        description={t("Mennyi van még hátra a hétből, a következő szünetig és a tanév végéig.")}
      />
      <div className="progress-grid">
        <ProgressCard
          icon={<CalendarRange size={18} />}
          title={t("A hét vége")}
          big={week.weekend ? t("Hétvége van!") : duration(week.remainingMs)}
          caption={
            week.weekend
              ? t("Hétfőig még {time}", undefined, { time: duration(week.untilMondayMs) })
              : t("a hétvégéig · {n} tanítási nap van hátra", undefined, {
                  n: week.schoolDaysLeft,
                })
          }
          percent={week.percent}
          tone="week"
          from={t("Hétfő")}
          to={t("Péntek vége")}
        />
        <ProgressCard
          icon={<Palmtree size={18} />}
          title={
            pause.current
              ? breakName(pause.current)
              : pause.next
                ? t("Következő szünet: {name}", undefined, { name: breakName(pause.next) })
                : t("Következő szünet")
          }
          big={
            pause.current
              ? t("Szünet van!")
              : pause.next
                ? days(pause.remainingDays)
                : t("Nyári szünet")
          }
          caption={
            pause.current
              ? t("Még {n} nap pihenés, utána indul a suli.", undefined, {
                  n: pause.remainingDays,
                })
              : pause.next
                ? t("a szünetig · {n} tanítási nap van hátra", undefined, {
                    n: pause.schoolDaysLeft,
                  })
                : t("Ebben a tanévben nincs több szünet a nyári előtt.")
          }
          percent={pause.current || pause.next ? pause.percent : 100}
          tone="break"
          from={dateLabel(pause.current ? pause.current.start : pause.since)}
          to={
            pause.current
              ? dateLabel(pause.current.end)
              : pause.next
                ? dateLabel(pause.next.start)
                : dateLabel(calendar.lastDay)
          }
          estimated={(pause.current ?? pause.next)?.estimated}
        />
        <ProgressCard
          icon={<GraduationCap size={18} />}
          title={t("A tanév vége")}
          big={
            year.phase === "after"
              ? t("Vége a tanévnek!")
              : days(year.remainingDays)
          }
          caption={
            year.phase === "after"
              ? t("Jó pihenést a nyáron!")
              : year.phase === "before"
                ? t("A tanév {date}-én kezdődik.", undefined, {
                    date: dateLabel(calendar.firstDay, true),
                  })
                : t("az utolsó tanítási napig · {n} tanítási nap van hátra", undefined, {
                    n: year.schoolDaysLeft,
                  })
          }
          percent={year.percent}
          tone="year"
          from={dateLabel(calendar.firstDay, true)}
          to={dateLabel(calendar.lastDay, true)}
          estimated={calendar.firstEstimated || calendar.lastEstimated}
        />
      </div>
      <div className="two-column section-gap">
        <Card title={t("Szünetek ebben a tanévben")} action={<Sun size={18} />}>
          {upcoming.length ? (
            <ul className="break-list">
              {calendar.breaks.map((b) => {
                const past = !upcoming.includes(b);
                const active = pause.current === b;
                return (
                  <li
                    key={`${b.name}-${b.start}`}
                    className={`${past ? "past" : ""} ${active ? "active" : ""}`}
                  >
                    <span className="break-dot" />
                    <span className="break-copy">
                      <strong>{breakName(b)}</strong>
                      <small>
                        {dateLabel(b.start)} – {dateLabel(b.end, true)}
                      </small>
                    </span>
                    {active ? (
                      <span className="badge success">{t("Most")}</span>
                    ) : past ? (
                      <span className="badge">{t("Elmúlt")}</span>
                    ) : b.estimated ? (
                      <span className="badge warning">{t("Becslés")}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small">{t("Ebben a tanévben már nincs hátra szünet.")}</p>
          )}
        </Card>
        <Card title={t("Honnan származnak a dátumok?")} action={<Info size={18} />}>
          <p className="muted small">
            {t(
              "A szüneteket és a tanév első és utolsó napját az iskolád KRÉTA-ban közzétett tanévrendjéből olvassuk ki. A tanítási napok számából a hétvégék, a szünetek és az iskola által megadott tanítás nélküli napok kimaradnak.",
            )}
          </p>
          {anyEstimate && (
            <p className="muted small section-gap">
              <span className="badge warning">{t("Becslés")}</span>{" "}
              {t(
                "Ahol az iskola még nem adta meg a dátumot, a szokásos magyar tanévrend alapján becsülünk (őszi szünet október végén, téli szünet karácsonytól újévig, tavaszi szünet húsvét körül, tanévzárás június harmadik péntekén).",
              )}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
