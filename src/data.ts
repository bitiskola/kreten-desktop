import { currentDateLocale, t } from "./i18n";
import type { Raw } from "./bridge";
export const rows = (v: unknown): Raw[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
export const str = (v: unknown): string =>
  typeof v === "string"
    ? v
    : typeof v === "number"
      ? String(v)
      : v && typeof v === "object"
        ? str(
            (v as Raw).Leiras ??
              (v as Raw).Nev ??
              (v as Raw).nev ??
              (v as Raw).name,
          )
        : "";
export const plain = (v: unknown): string => {
  const text = str(v);
  // KRÉTA content is untrusted: parse to text in an inert document, never inject HTML.
  if (typeof DOMParser !== "undefined")
    return (
      new DOMParser()
        .parseFromString(text, "text/html")
        .body.textContent?.trim() ?? ""
    );
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
};
export const name = (v: unknown): string =>
  v && typeof v === "object"
    ? str((v as Raw).Nev ?? (v as Raw).nev ?? (v as Raw).Leiras)
    : str(v);
export const num = (v: unknown, fallback = 0) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v))
    ? fallback
    : Number(v);
export function localDay(value: unknown): string {
  const s = str(value);
  if (/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$)/.test(s))
    return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export const today = () => localDay(new Date().toISOString());
export const dateLabel = (s: unknown, full = false) => {
  if (!str(s)) return t("Nincs megadva");
  const day = localDay(s);
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(currentDateLocale(), {
        timeZone: "Europe/Budapest",
        ...(full ? { year: "numeric" as const } : {}),
        month: "short",
        day: "numeric",
      })
    : str(s);
};
export const timeLabel = (s: unknown) => {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(str(s)))
    return str(s).slice(11, 16);
  const d = new Date(str(s));
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString(currentDateLocale(), {
        timeZone: "Europe/Budapest",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
};
export const decimal = (v: number | null) =>
  v === null
    ? "—"
    : v.toLocaleString(currentDateLocale(), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export interface Grade {
  id: string;
  subject: string;
  value: number;
  display: string;
  weight: number;
  date: string;
  topic: string;
  teacher: string;
  type: string;
  kind: string;
}
export const isJegyCode = (s: string) => /^jegy_\d+$/i.test(s.trim());

export function grades(data: unknown): Grade[] {
  return rows(data)
    .map((g, i) => {
      const rawTopic = str(g.Tema);
      const rawType = str((g.Mod as Raw)?.Leiras ?? (g.Mod as Raw)?.Nev ?? g.Mod ?? (g.Tipus as Raw)?.Leiras ?? (g.Tipus as Raw)?.Nev ?? g.Tipus);
      return {
        id: str(g.Uid) || String(i),
        subject: name(g.Tantargy) || "Értékelés",
        value: num(g.SzamErtek),
        display: str(
          g.SzamErtek ?? g.SzovegesErtekelesRovidNev ?? g.SzovegesErtek,
        ),
        weight: Math.max(0, num(g.SulySzazalekErteke, 100)),
        date: localDay(g.KeszitesDatuma ?? g.RogzitesDatuma),
        topic: isJegyCode(rawTopic) ? "" : rawTopic,
        teacher: str(g.ErtekeloTanarNeve),
        type: isJegyCode(rawType) ? "" : rawType,
        kind: str((g.Tipus as Raw)?.Nev ?? g.Jelleg),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
export const numericGrades = (items: Grade[]) =>
  items.filter(
    (g) =>
      [1, 2, 3, 4, 5].includes(g.value) &&
      !/felev|evveg|félév|évvég/i.test(g.kind),
  );
export function average(items: Grade[]): number | null {
  const valid = numericGrades(items).filter((g) => g.weight > 0);
  const weight = valid.reduce((s, g) => s + g.weight, 0);
  return weight
    ? valid.reduce((s, g) => s + g.value * g.weight, 0) / weight
    : null;
}
export function subjectGroups(items: Grade[]) {
  const map = new Map<string, Grade[]>();
  for (const g of items) map.set(g.subject, [...(map.get(g.subject) ?? []), g]);
  return Array.from(map, ([name, items]) => ({
    name,
    items,
    average: average(items),
  })).sort((a, b) => a.name.localeCompare(b.name, "hu"));
}
export function monthlyTrend(items: Grade[]) {
  const map = new Map<string, Grade[]>();
  for (const g of numericGrades(items))
    if (g.date)
      map.set(g.date.slice(0, 7), [...(map.get(g.date.slice(0, 7)) ?? []), g]);
  return Array.from(map, ([month, items]) => ({ month, value: average(items) }))
    .filter((x) => x.value !== null)
    .sort((a, b) => a.month.localeCompare(b.month));
}
export interface Lesson {
  id: string;
  subject: string;
  start: string;
  end: string;
  date: string;
  number: number;
  room: string;
  teacher: string;
  topic: string;
  state: string;
  substitute: string;
  cancelled: boolean;
}
export function lessons(data: unknown): Lesson[] {
  return rows(data)
    .map((l, i) => ({
      id: str(l.Uid) || String(i),
      subject: name(l.Tantargy) || str(l.Nev),
      start: str(l.KezdetIdopont),
      end: str(l.VegIdopont),
      date: localDay(l.Datum ?? l.KezdetIdopont),
      number: num(l.Oraszam),
      room: str(l.TeremNeve),
      teacher: str(l.TanarNeve),
      topic: str(l.Tema),
      state: str(l.Allapot),
      substitute: str(l.HelyettesTanarNeve),
      cancelled: /elmarad/i.test(str(l.Allapot?.Nev) + str(l.Allapot)),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}
/**
 * Groups lessons that share a period on the same day (split classes, parallel
 * groups, a cancelled lesson and its replacement) so they can be shown side by
 * side. Lessons belong together when they have the same lesson number or their
 * times overlap.
 */
export function lessonSlots(items: Lesson[]): Lesson[][] {
  const span = (l: Lesson) => [schoolTimestamp(l.start), schoolTimestamp(l.end)];
  const together = (a: Lesson, b: Lesson) => {
    if (a.date !== b.date) return false;
    if (a.number && a.number === b.number) return true;
    const [as, ae] = span(a),
      [bs, be] = span(b);
    return [as, ae, bs, be].every(Number.isFinite) && as < be && bs < ae;
  };
  const slots: Lesson[][] = [];
  for (const lesson of items) {
    const slot = slots.find((s) => s.some((o) => together(o, lesson)));
    if (slot) slot.push(lesson);
    else slots.push([lesson]);
  }
  return slots;
}
export function lessonStatus(items: Lesson[], now: Date) {
  const active = items.find(
    (l) =>
      !l.cancelled &&
      schoolTimestamp(l.start) <= now.getTime() &&
      schoolTimestamp(l.end) > now.getTime(),
  );
  const next = items.find(
    (l) => !l.cancelled && schoolTimestamp(l.start) > now.getTime(),
  );
  return {
    active,
    next,
    remaining: active
      ? Math.max(
          0,
          Math.ceil((schoolTimestamp(active.end) - now.getTime()) / 60000),
        )
      : next
        ? Math.max(
            0,
            Math.ceil((schoolTimestamp(next.start) - now.getTime()) / 60000),
          )
        : 0,
  };
}
export const homeworkRows = (data: unknown) =>
  rows(data)
    .map((h, i) => ({
      id: str(h.Uid ?? (h as Raw).uid ?? (h as Raw).Id ?? (h as Raw).id) || String(i),
      subject: name(h.Tantargy) || str(h.TantargyNeve) || "Házi feladat",
      text: plain(h.Szoveg ?? (h as Raw).Tartalom ?? (h as Raw).Leiras),
      teacher: str(h.RogzitoTanarNeve ?? (h as Raw).TanarNeve),
      date: localDay(h.HataridoDatuma ?? (h as Raw).Datum),
      done: Boolean(h.IsMegoldva ?? (h as Raw).IsHaziFeladatMegoldva),
      created: localDay(h.FeladasDatuma ?? (h as Raw).RogzitesDatuma),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

export const testRows = (data: unknown) => {
  const current = today();
  return rows(data)
    .map((t, i) => ({
      id: str(t.Uid ?? (t as Raw).uid ?? (t as Raw).Id ?? (t as Raw).id) || String(i),
      subject: name(t.Tantargy) || str(t.TantargyNeve) || "Számonkérés",
      text: str(t.Temaja ?? t.Tema ?? (t as Raw).Nev),
      date: localDay(t.Datum ?? (t as Raw).SzamonkeresDatuma),
      teacher: str(t.RogzitoTanarNeve ?? (t as Raw).TanarNeve),
      type: str(t.Modja ?? (t as Raw).Tipus),
    }))
    .sort((a, b) => {
      const aUpcoming = a.date >= current;
      const bUpcoming = b.date >= current;
      if (aUpcoming && bUpcoming) return a.date.localeCompare(b.date); // closest upcoming first
      if (aUpcoming) return -1;
      if (bUpcoming) return 1;
      return b.date.localeCompare(a.date); // closest past down to oldest
    });
};
export const absenceRows = (data: unknown) =>
  rows(data)
    .map((a, i) => ({
      id: str(a.Uid) || String(i),
      subject: name(a.Tantargy),
      date: localDay(a.Datum),
      type: str(a.Tipus) || "Hiányzás",
      minutes: num(a.KesesPercben),
      status: str(a.IgazolasAllapota),
      justified: /^igazolt$/i.test(str(a.IgazolasAllapota)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
export interface Message {
  id: string;
  subject: string;
  sender: string;
  date: string;
  read: boolean;
  text: string;
  attachments: Raw[];
  recipients: Raw[];
}
export function messages(data: unknown, folder?: string): Message[] {
  return rows(data)
    .filter((m) => {
      if (!folder || !m.uzenet || !m.tipus?.kod) return true;
      const kind = str(m.tipus.kod).toLowerCase();
      const deleted = Boolean(m.isToroltElem) || kind === "torolt";
      return folder === "torolt" ? deleted : !deleted && kind === folder;
    })
    .map((m, i) => {
      const c = m.uzenet ?? m;
      return {
        id: str(m.azonosito ?? m.Uid ?? i),
        subject: str(c.targy ?? c.uzenetTargy ?? m.Cim) || "Nincs tárgy",
        sender: str(
          c.feladoNev ??
            c.uzenetFeladoNev ??
            m.RogzitoNeve ??
            m.KeszitoTanarNeve,
        ),
        date: str(
          c.kuldesDatum ??
            c.uzenetKuldesDatum ??
            m.ErvenyessegKezdete ??
            m.Datum ??
            m.KeszitesDatuma,
        ),
        read: Boolean(
          m.isElolvasva ??
            m.elolvasva ??
            m.isOlvasott ??
            m.olvasott ??
            m.TartalomText,
        ),
        text: plain(
          c.szoveg ??
            c.tartalom ??
            m.TartalomText ??
            m.Tartalom ??
            m.TartalomFormazott,
        ),
        attachments: rows(c.csatolmanyok),
        recipients: rows(c.cimzettLista),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function weekDays(offset = 0): string[] {
  const d = new Date(`${today()}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(day.getDate() + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
}

/** Interpret unzoned school timestamps in Budapest, independent of the desktop timezone. */
export function schoolTimestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value))
    return new Date(value).getTime();
  const desired = Date.parse(value + "Z");
  let candidate = desired;
  for (let i = 0; i < 2; i++) {
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Budapest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(candidate))
      .replace(" ", "T");
    candidate += desired - Date.parse(formatted + "Z");
  }
  return candidate;
}
export function consultationRows(data: unknown): Raw[] {
  return rows(data)
    .flatMap((group) =>
      Array.isArray(group.Fogadoorak)
        ? rows(group.Fogadoorak).map((hour) => ({
            ...hour,
            uid: str(hour.Uid),
            tanarNev: name(group.Tanar),
            idopont: str(hour.KezdoIdopont),
            vegIdopont: str(hour.VegIdopont),
            teremNev: name(hour.Terem),
            foglalas:
              rows(hour.Idopontok)
                .filter((slot) => slot.IsJelentkeztem === true)
                .map((slot) => str(slot.KezdoIdopont))
                .join(", ") || null,
          }))
        : [group],
    )
    .sort((a, b) => str(a.idopont).localeCompare(str(b.idopont)));
}
export function classAverageRows(data: unknown) {
  return rows(data)
    .map((item) => ({
      id: str(item.Uid),
      name: name(item.Tantargy),
      student: num(item.TanuloAtlag, NaN),
      group: num(item.OsztalyCsoportAtlag, NaN),
    }))
    .filter(
      (item) =>
        item.name &&
        Number.isFinite(item.student) &&
        Number.isFinite(item.group),
    );
}

export function schoolYearRows(data: unknown) {
  return rows(data)
    .map((item) => ({
      date: localDay(item.Datum),
      description: str(item.Naptipus?.Leiras ?? item.Naptipus?.Nev),
    }))
    .filter(
      (item) =>
        item.date &&
        /Utolsó tanítási nap|Első tanítási nap|Első félév vége/i.test(
          item.description,
        ),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function estimatedGrade(
  value: number | null,
  thresholds: number[] = [1.5, 2.5, 3.5, 4.5],
): number | null {
  if (value === null || !Number.isFinite(value) || value < 1 || value > 5)
    return null;
  const valid =
    thresholds.length === 4 &&
    thresholds.every(
      (n, i) =>
        Number.isFinite(n) &&
        n >= 1 &&
        n <= 5 &&
        (i === 0 || n > thresholds[i - 1]),
    );
  const limits = valid ? thresholds : [1.5, 2.5, 3.5, 4.5];
  return 1 + limits.filter((n) => value >= n).length;
}


export interface LiveLessonInterval {
  start: number;
  end: number;
  date: string;
  subject: string;
  time: string;
  classroom: string;
  teacher: string;
}

export interface LiveLessonStatus {
  kind: "lesson" | "break" | "upcoming" | "empty";
  label: string;
  title: string;
  date: string;
  details: string;
  teacher: string;
  remaining: string;
  progress: number;
  progressLabel: string;
}

export function lessonIntervals(lessonsList: Lesson[]): LiveLessonInterval[] {
  const intervals: LiveLessonInterval[] = [];
  for (const l of lessonsList) {
    if (l.cancelled) continue;
    try {
      const startMs = schoolTimestamp(l.start);
      const endMs = schoolTimestamp(l.end);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        intervals.push({
          start: startMs,
          end: endMs,
          date: l.date,
          subject: l.subject || "Tanóra",
          time: `${timeLabel(l.start)} – ${timeLabel(l.end)}`,
          classroom: l.room || "Terem nincs megadva",
          teacher: l.substitute || l.teacher || "",
        });
      }
    } catch {
      // ignore invalid dates
    }
  }
  return intervals.sort((a, b) => a.start - b.start);
}

export function remainingCountdownText(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const sec = String(seconds % 60).padStart(2, "0");
  return `${minutes} perc ${sec} mp van hátra`;
}

export function currentLiveStatus(intervals: LiveLessonInterval[], nowMs: number): LiveLessonStatus {
  const active = intervals.find((i) => i.start <= nowMs && nowMs < i.end);
  const upcoming = intervals.find((i) => i.start > nowMs);
  const previous = intervals
    .filter((i) => i.end <= nowMs)
    .reduce<LiveLessonInterval | null>((last, cur) => (!last || cur.end > last.end ? cur : last), null);

  const status: LiveLessonStatus = {
    kind: "empty",
    label: "SZABAD IDŐ",
    date: "",
    title: "Nincs közelgő tanóra.",
    details: "Nincs több közelgő óra a következő napokra.",
    teacher: "",
    remaining: "",
    progress: 0,
    progressLabel: "",
  };

  let start = 0;
  let end = 0;

  if (active) {
    status.kind = "lesson";
    status.label = "MOST ÓRÁD VAN";
    status.title = active.subject;
    status.date = active.date;
    status.details = `${active.time} / ${active.classroom}`;
    status.teacher = active.teacher;
    status.progressLabel = "Az óra eltelt része";
    start = active.start;
    end = active.end;
  } else if (upcoming && previous && previous.date === upcoming.date) {
    status.kind = "break";
    status.label = "KÉT ÓRA KÖZÖTT";
    status.title = "Szünet";
    status.date = upcoming.date;
    status.details = `Következik: ${upcoming.subject} · ${upcoming.time}`;
    status.teacher = upcoming.classroom;
    status.progressLabel = "A szünet eltelt része";
    start = previous.end;
    end = upcoming.start;
  } else if (upcoming) {
    status.kind = "upcoming";
    status.label = "A KÖVETKEZŐ ÓRÁD";
    status.title = upcoming.subject;
    status.date = upcoming.date;
    status.details = `${upcoming.time} / ${upcoming.classroom}`;
    status.teacher = upcoming.teacher;
    return status;
  } else {
    return status;
  }

  status.remaining = remainingCountdownText(end - nowMs);
  status.progress = Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100));
  return status;
}

export interface NoteItem {
  id: string;
  title: string;
  author: string;
  date: string;
  type: string;
  kind: "note" | "notice";
  text: string;
  isHomeworkDeficit: boolean;
  isPraise: boolean;
  isWarning: boolean;
}

export function noteRows(notesData: unknown, noticesData: unknown): NoteItem[] {
  const result: NoteItem[] = [];

  for (const n of rows(notesData)) {
    const rawType = str(
      (n.Tipus as Raw)?.Leiras ??
        (n.Tipus as Raw)?.Nev ??
        n.Tipus,
    );
    const title = str(n.Cim) || rawType || "Tanári feljegyzés";
    const author = str(n.KeszitoTanarNeve ?? (n as Raw).RogzitoTanarNeve ?? (n as Raw).TanarNeve);
    const date = localDay(n.Datum ?? (n as Raw).KeszitesDatuma ?? (n as Raw).RogzitesDatuma);
    const text = plain(n.Tartalom ?? (n as Raw).TartalomFormazott ?? (n as Raw).Szoveg);
    const typeLower = rawType.toLowerCase();
    const titleLower = title.toLowerCase();
    const isHomeworkDeficit =
      typeLower.includes("hiany") ||
      typeLower.includes("hiány") ||
      titleLower.includes("hiany") ||
      titleLower.includes("hiány") ||
      typeLower.includes("hazifeladat") ||
      titleLower.includes("házi feladat hiány") ||
      typeLower.includes("házi feladat hiány");
    const isPraise =
      typeLower.includes("dicser") ||
      typeLower.includes("dicsér") ||
      titleLower.includes("dicser") ||
      titleLower.includes("dicsér");
    const isWarning =
      typeLower.includes("figyelmeztet") ||
      typeLower.includes("intes") ||
      typeLower.includes("intés") ||
      typeLower.includes("megrovas") ||
      typeLower.includes("megrovás") ||
      titleLower.includes("figyelmeztet") ||
      titleLower.includes("intés") ||
      titleLower.includes("megrovás");

    result.push({
      id: str(n.Uid ?? (n as Raw).uid ?? (n as Raw).Id ?? (n as Raw).id) || String(result.length),
      title,
      author,
      date,
      type: rawType || "Feljegyzés",
      kind: "note",
      text,
      isHomeworkDeficit,
      isPraise,
      isWarning,
    });
  }

  for (const n of rows(noticesData)) {
    const title = str(n.Cim) || "Faliújság hír";
    const author = str(n.RogzitoNeve ?? (n as Raw).KeszitoTanarNeve ?? "Iskola");
    const date = localDay((n as Raw).ErvenyessegKezdete ?? n.Datum ?? (n as Raw).KeszitesDatuma);
    const text = plain((n as Raw).TartalomText ?? n.Tartalom ?? (n as Raw).Szoveg);

    result.push({
      id: str(n.Uid ?? (n as Raw).uid ?? (n as Raw).Id ?? (n as Raw).id) || String(result.length),
      title,
      author,
      date,
      type: "Faliújság",
      kind: "notice",
      text,
      isHomeworkDeficit: false,
      isPraise: false,
      isWarning: false,
    });
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}
