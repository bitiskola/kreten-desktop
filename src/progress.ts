import { localDay, rows, str } from "./data";

/**
 * School-calendar progress (week, next break, school year).
 *
 * All arithmetic runs on Budapest wall-clock time encoded as UTC milliseconds,
 * so results never depend on the desktop's own time zone or DST rules.
 * Breaks come from KRÉTA's `TanevRendjeElemek`; when the school calendar
 * lacks them, the usual Hungarian schedule is estimated and flagged.
 */

const DAY = 86_400_000;

export interface SchoolBreak {
  /** Hungarian UI key, e.g. "Téli szünet". */
  name: string;
  /** First calendar day without school (YYYY-MM-DD). */
  start: string;
  /** Last calendar day without school (YYYY-MM-DD). */
  end: string;
  estimated: boolean;
}

export interface SchoolCalendar {
  firstDay: string;
  lastDay: string;
  firstEstimated: boolean;
  lastEstimated: boolean;
  breaks: SchoolBreak[];
  /** Individual non-teaching weekdays reported by the school. */
  offDays: Set<string>;
}

export interface Progress {
  /** 0–100. */
  percent: number;
  /** Milliseconds until the target moment (0 once reached). */
  remainingMs: number;
  /** Calendar days until the target day (0 on the day itself). */
  remainingDays: number;
  /** Remaining teaching days, today included while it is still a school day. */
  schoolDaysLeft: number;
}

/** Budapest wall-clock time of `now`, as if it were UTC. */
export function budapestWallClock(now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Budapest",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => dayOf(dayMs(day) + n * DAY);
/** 0 = Sunday … 6 = Saturday. */
const weekday = (day: string) => new Date(dayMs(day)).getUTCDay();
const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Gregorian Easter Sunday (anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The school year (its September's calendar year) that `day` belongs to. */
export function schoolYearOf(day: string): number {
  const year = Number(day.slice(0, 4));
  return Number(day.slice(5, 7)) >= 8 ? year : year - 1;
}

/** Usual Hungarian schedule; only used where the school calendar is silent. */
export function estimatedCalendar(year: number) {
  // First weekday of September.
  let firstDay = `${year}-09-01`;
  while (isWeekend(firstDay)) firstDay = addDays(firstDay, 1);
  // Third Friday of June.
  let lastDay = `${year + 1}-06-01`;
  while (weekday(lastDay) !== 5) lastDay = addDays(lastDay, 1);
  lastDay = addDays(lastDay, 14);
  // Autumn: the school week around 29 October, weekends included.
  const oct29 = `${year}-10-29`;
  const autumnMonday = addDays(oct29, -((weekday(oct29) + 6) % 7));
  // Winter: from the Saturday in 17–23 December to the first Sunday of January.
  let winterStart = `${year}-12-17`;
  while (weekday(winterStart) !== 6) winterStart = addDays(winterStart, 1);
  let winterEnd = `${year + 1}-01-01`;
  while (weekday(winterEnd) !== 0) winterEnd = addDays(winterEnd, 1);
  // Spring: Maundy Thursday to the Tuesday after Easter.
  const easter = easterSunday(year + 1);
  const breaks: SchoolBreak[] = [
    {
      name: "Őszi szünet",
      start: addDays(autumnMonday, -2),
      end: addDays(autumnMonday, 6),
      estimated: true,
    },
    { name: "Téli szünet", start: winterStart, end: winterEnd, estimated: true },
    {
      name: "Tavaszi szünet",
      start: addDays(easter, -3),
      end: addDays(easter, 2),
      estimated: true,
    },
  ];
  return { firstDay, lastDay, breaks };
}

const BREAK = /szünet|szunet/i;
const OFF = /szünet|szunet|ünnep|unnep|munkaszüneti|munkaszuneti|tanítás nélküli|tanitasnelkuli/i;
const FIRST = /első tanítási nap|elsotanitasinap/i;
const LAST = /utolsó tanítási nap|utolsotanitasinap/i;
const SUMMER = /nyári|nyari/i;

function seasonName(start: string, end: string, label: string): string {
  if (/őszi|oszi/i.test(label)) return "Őszi szünet";
  if (/téli|teli/i.test(label)) return "Téli szünet";
  if (/tavaszi/i.test(label)) return "Tavaszi szünet";
  const middle = dayOf((dayMs(start) + dayMs(end)) / 2);
  const month = Number(middle.slice(5, 7));
  if (month === 10 || month === 11) return "Őszi szünet";
  if (month === 12 || month === 1) return "Téli szünet";
  if (month >= 3 && month <= 5) return "Tavaszi szünet";
  return "Tanítási szünet";
}

/** Combine the school's published calendar with estimates for missing parts. */
export function schoolCalendar(data: unknown, now: Date): SchoolCalendar {
  const today = dayOf(budapestWallClock(now));
  const year = schoolYearOf(today);
  const yearStart = `${year}-08-01`,
    yearEnd = `${year + 1}-07-31`;
  const items = rows(data)
    .map((item) => ({
      day: localDay(item.Datum),
      label: `${str(item.Naptipus?.Nev)} ${str(item.Naptipus?.Leiras)}`,
    }))
    .filter((i) => i.day && i.day >= yearStart && i.day <= yearEnd);
  const estimate = estimatedCalendar(year);
  const first = items.filter((i) => FIRST.test(i.label)).map((i) => i.day).sort()[0];
  const lasts = items.filter((i) => LAST.test(i.label)).map((i) => i.day).sort();
  const last = lasts[lasts.length - 1];
  const firstDay = first ?? estimate.firstDay;
  const lastDay = last ?? estimate.lastDay;

  const labels = new Map<string, string>();
  for (const i of items)
    if (OFF.test(i.label) && !SUMMER.test(i.label) && !isWeekend(i.day))
      labels.set(i.day, `${labels.get(i.day) ?? ""} ${i.label}`);
  const offDays = new Set(labels.keys());

  // Runs of off weekdays, bridging weekends, inside the teaching period.
  const days = [...offDays].filter((d) => d > firstDay && d < lastDay).sort();
  const found: SchoolBreak[] = [];
  let run: string[] = [];
  const flush = () => {
    const explicit = run.some((d) => BREAK.test(labels.get(d) ?? ""));
    if (run.length >= 3 && explicit) {
      let start = run[0],
        end = run[run.length - 1];
      while (isWeekend(addDays(start, -1))) start = addDays(start, -1);
      while (isWeekend(addDays(end, 1))) end = addDays(end, 1);
      const label = run.map((d) => labels.get(d) ?? "").join(" ");
      found.push({ name: seasonName(start, end, label), start, end, estimated: false });
    }
    run = [];
  };
  for (const d of days) {
    const previous = run[run.length - 1];
    if (previous) {
      let gap = addDays(previous, 1);
      while (gap < d && isWeekend(gap)) gap = addDays(gap, 1);
      if (gap !== d) flush();
    }
    run.push(d);
  }
  flush();

  // Fill seasons the school calendar does not cover with the usual schedule.
  const breaks = [...found];
  for (const guess of estimate.breaks) {
    const covered = found.some((b) => b.name === guess.name);
    if (!covered && guess.start > firstDay && guess.end < lastDay) breaks.push(guess);
  }
  breaks.sort((a, b) => a.start.localeCompare(b.start));
  return {
    firstDay,
    lastDay,
    firstEstimated: !first,
    lastEstimated: !last,
    breaks,
    offDays,
  };
}

/** Teaching weekdays in [from, to), skipping breaks and reported off days. */
export function teachingDays(cal: SchoolCalendar, from: string, to: string): number {
  let count = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (d < cal.firstDay || d > cal.lastDay || isWeekend(d) || cal.offDays.has(d))
      continue;
    if (cal.breaks.some((b) => d >= b.start && d <= b.end)) continue;
    count++;
  }
  return count;
}

function span(
  fromMs: number,
  toMs: number,
  nowMs: number,
  cal: SchoolCalendar | null,
): Progress {
  const today = dayOf(nowMs);
  const target = dayOf(toMs);
  return {
    percent: toMs > fromMs ? clamp(((nowMs - fromMs) / (toMs - fromMs)) * 100) : 100,
    remainingMs: Math.max(0, toMs - nowMs),
    remainingDays: Math.max(0, Math.round((dayMs(target) - dayMs(today)) / DAY)),
    schoolDaysLeft: cal ? teachingDays(cal, today, target) : 0,
  };
}

export interface WeekProgress extends Progress {
  weekend: boolean;
  /** Milliseconds until Monday 00:00 while it is the weekend. */
  untilMondayMs: number;
}

/** Monday 00:00 → Saturday 00:00 (end of Friday) in Budapest. */
export function weekProgress(now: Date): WeekProgress {
  const nowMs = budapestWallClock(now);
  const today = dayOf(nowMs);
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const result = span(dayMs(monday), dayMs(addDays(monday, 5)), nowMs, null);
  const weekend = isWeekend(today);
  return {
    ...result,
    schoolDaysLeft: weekend ? 0 : 5 - ((weekday(today) + 6) % 7),
    weekend,
    untilMondayMs: weekend ? dayMs(addDays(monday, 7)) - nowMs : 0,
  };
}

export interface BreakProgress extends Progress {
  /** The break that is happening right now, if any. */
  current: SchoolBreak | null;
  /** The next break that has not started yet. */
  next: SchoolBreak | null;
  /** Where the countdown bar started (end of previous break or school start). */
  since: string;
}

export function breakProgress(cal: SchoolCalendar, now: Date): BreakProgress {
  const nowMs = budapestWallClock(now);
  const today = dayOf(nowMs);
  const current = cal.breaks.find((b) => today >= b.start && today <= b.end) ?? null;
  const next = cal.breaks.find((b) => b.start > today) ?? null;
  if (current) {
    return {
      ...span(dayMs(current.start), dayMs(current.end) + DAY, nowMs, null),
      current,
      next,
      since: current.start,
    };
  }
  if (!next) {
    return {
      ...span(0, 0, nowMs, null),
      percent: 0,
      current: null,
      next: null,
      since: today,
    };
  }
  const ended = cal.breaks.filter((b) => b.end < today);
  const previous = ended[ended.length - 1];
  const since =
    previous && previous.end >= cal.firstDay ? addDays(previous.end, 1) : cal.firstDay;
  return {
    ...span(dayMs(since), dayMs(next.start), nowMs, cal),
    current: null,
    next,
    since,
  };
}

export interface YearProgress extends Progress {
  phase: "before" | "during" | "after";
}

/** First teaching day 00:00 → end of the last teaching day. */
export function yearProgress(cal: SchoolCalendar, now: Date): YearProgress {
  const nowMs = budapestWallClock(now);
  const from = dayMs(cal.firstDay),
    to = dayMs(cal.lastDay) + DAY;
  const result = span(from, to, nowMs, cal);
  return {
    ...result,
    // Calendar days until the last teaching day (0 on that day).
    remainingDays: Math.max(0, Math.round((dayMs(cal.lastDay) - dayMs(dayOf(nowMs))) / DAY)),
    phase: nowMs < from ? "before" : nowMs >= to ? "after" : "during",
  };
}
