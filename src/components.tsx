import { t, currentDateLocale } from "./i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  MapPin,
  X,
} from "lucide-react";
import { decimal, timeLabel, type Grade, type Lesson } from "./data";
export function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${primary ? "primary" : "secondary"} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Empty({
  title = "Itt most minden rendben.",
  text = "Még nincs megjeleníthető bejegyzés.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <BookOpen size={25} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-header">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
export function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function TextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ChevronRight size={14} />
    </button>
  );
}
export function Private({
  children,
  hide,
}: {
  children: ReactNode;
  hide: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
  }, [hide]);
  return hide && !revealed ? (
    <button
      className="private-value"
      title={t("Megjelenítés")}
      aria-label={t("Rejtett érték megjelenítése")}
      onClick={() => setRevealed(true)}
    >
      •••
    </button>
  ) : (
    <>{children}</>
  );
}
export function GradeBadge({
  grade,
  hide = false,
}: {
  grade: Grade;
  hide?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [hide]);
  if (hide && !revealed)
    return (
      <button
        className="grade"
        aria-label={t("Rejtett jegy megjelenítése")}
        onClick={(e) => {
          e.preventDefault();
          setRevealed(true);
        }}
      >
        •••
      </button>
    );
  return (
    <span
      className={`grade grade-${grade.value}`}
      title={`${grade.topic || grade.type} · ${grade.weight}%`}
    >
      {grade.display || "—"}
      {grade.weight > 100 && <i />}
    </span>
  );
}
export function Stat({
  label,
  value,
  note,
  className = "",
}: {
  label: string;
  value: ReactNode;
  note: string;
  className?: string;
}) {
  return (
    <div className={`stat card ${className}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      <span className="muted small">{note}</span>
    </div>
  );
}
export function LessonRow({
  lesson,
  active = false,
  onClick,
}: {
  lesson: Lesson;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`lesson-row ${active ? "active" : ""} ${lesson.cancelled ? "cancelled" : ""}`}
      onClick={onClick}
    >
      <span className="lesson-number">{lesson.number || "·"}</span>
      <div className="lesson-time">
        {timeLabel(lesson.start)}
        <small>{timeLabel(lesson.end)}</small>
      </div>
      <div className="lesson-main">
        <strong>{lesson.subject}</strong>
        <span>
          {lesson.substitute
            ? `Helyettesítés: ${lesson.substitute}`
            : lesson.teacher}
        </span>
      </div>
      <span className="lesson-room">
        <MapPin size={12} />
        {lesson.room || "—"}
      </span>
      {lesson.cancelled ? (
        <span className="badge warning">{t("Elmarad")}</span>
      ) : (
        active && <span className="live-dot" />
      )}
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={t("Bezárás")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        className="switch"
        role="switch"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function Palette({
  value,
  label,
  selected,
  onClick,
}: {
  value: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`palette-choice ${selected ? "selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className={`palette-preview ${value}`}>
        <i className="mini-nav" />
        <i className="mini-card" />
        <i className="mini-card second" />
        {selected && (
          <span className="palette-check">
            <Check size={13} />
          </span>
        )}
      </span>
      <span>{t(label)}</span>
    </button>
  );
}
export function Trend({
  trend,
  hide,
}: {
  trend: { month: string; value: number | null }[];
  hide: boolean;
}) {
  if (!trend.length)
    return (
      <Empty
        title={t("Még nincs elég adat a grafikonhoz.")}
        text={t(
          "A számjegyes értékelésekkel együtt megjelenik az átlagod alakulása.",
        )}
      />
    );
  const x = (i: number) =>
    trend.length === 1 ? 300 : 44 + (i * 512) / (trend.length - 1);
  const y = (n: number) => 160 - (n - 1) * 32;
  const points = trend.map((t, i) => `${x(i)},${y(t.value!)}`).join(" ");
  return (
    <Private hide={hide}>
      <div className="trend-chart">
        <svg
          role="img"
          aria-label={t("Havi súlyozott átlagok")}
          viewBox="0 0 600 205"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <g key={n}>
              <line
                x1="35"
                x2="570"
                y1={y(n)}
                y2={y(n)}
                className="grid-line"
              />
              <text x="10" y={y(n) + 4}>
                {n}
              </text>
            </g>
          ))}
          <defs>
            <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".15" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${x(0)},165 ${points} ${x(trend.length - 1)},165`}
            fill="url(#chart-fill)"
          />
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {trend.map((t, i) => (
            <g key={t.month}>
              <circle
                cx={x(i)}
                cy={y(t.value!)}
                r="5"
                fill="var(--solid)"
                stroke="var(--accent)"
                strokeWidth="2"
              >
                <title>
                  {t.month}: {decimal(t.value)}
                </title>
              </circle>
              <text x={x(i)} y="192" textAnchor="middle">
                {new Date(`${t.month}-15`).toLocaleDateString(
                  currentDateLocale(),
                  { month: "short" },
                )}
              </text>
            </g>
          ))}
        </svg>
        <div className="sr-only">
          {trend.map((t) => `${t.month}: ${decimal(t.value)}`).join(", ")}
        </div>
      </div>
    </Private>
  );
}
export function ArrowIcon() {
  return <ArrowUpRight size={16} />;
}
