import { describe, expect, it } from "vitest";
import {
  breakProgress,
  easterSunday,
  estimatedCalendar,
  schoolCalendar,
  weekProgress,
  yearProgress,
} from "./progress";

// Budapest is UTC+1 in winter: 10:00Z is 11:00 local.
const at = (iso: string) => new Date(iso);
const day = (d: string, nev: string, leiras = nev) => ({
  Datum: `${d}T00:00:00Z`,
  Naptipus: { Nev: nev, Leiras: leiras },
});

describe("school-week progress", () => {
  it("measures Monday 00:00 to the end of Friday in Budapest time", () => {
    // Wednesday 2026-11-11 12:00 Budapest = 2.5 of 5 days.
    const week = weekProgress(at("2026-11-11T11:00:00Z"));
    expect(week.weekend).toBe(false);
    expect(week.percent).toBeCloseTo(50, 5);
    expect(week.remainingDays).toBe(3);
    expect(week.schoolDaysLeft).toBe(3);
  });

  it("is full on the weekend and counts down to Monday", () => {
    // Saturday 2026-11-14 00:00 Budapest.
    const week = weekProgress(at("2026-11-13T23:00:00Z"));
    expect(week.weekend).toBe(true);
    expect(week.percent).toBe(100);
    expect(week.untilMondayMs).toBe(2 * 86_400_000);
  });

  it("does not depend on the desktop time zone across a Budapest day boundary", () => {
    // 23:30Z Sunday is already Monday 00:30 in Budapest (winter time).
    const week = weekProgress(at("2026-11-15T23:30:00Z"));
    expect(week.weekend).toBe(false);
    expect(week.percent).toBeLessThan(1);
  });
});

describe("estimated Hungarian calendar", () => {
  it("computes Easter and the usual break windows", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    const year = estimatedCalendar(2025);
    expect(year.firstDay).toBe("2025-09-01");
    expect(year.lastDay).toBe("2026-06-19");
    // Matches the published 2025/26 spring break (2–7 April 2026).
    expect(year.breaks[2]).toMatchObject({ start: "2026-04-02", end: "2026-04-07" });
  });

  it("is used and flagged when KRÉTA publishes no calendar", () => {
    const cal = schoolCalendar([], at("2026-11-09T10:00:00Z"));
    expect(cal.firstEstimated && cal.lastEstimated).toBe(true);
    expect(cal.firstDay).toBe("2026-09-01");
    expect(cal.lastDay).toBe("2027-06-18");
    expect(cal.breaks.map((b) => b.name)).toEqual([
      "Őszi szünet",
      "Téli szünet",
      "Tavaszi szünet",
    ]);
    expect(cal.breaks.every((b) => b.estimated)).toBe(true);
  });
});

describe("school calendar from KRÉTA", () => {
  const published = [
    day("2026-09-01", "ElsoTanitasiNap", "Első tanítási nap"),
    day("2026-10-23", "Unnepnap", "Ünnepnap"),
    ...["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"].map((d) =>
      day(d, "TanitasiSzunet", "Tanítási szünet"),
    ),
    ...[
      "2026-12-21",
      "2026-12-22",
      "2026-12-23",
      "2026-12-24",
      "2026-12-25",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ].map((d) => day(d, "TanitasiSzunet", "Tanítási szünet")),
    // A single bridging day is not a major break.
    day("2027-03-15", "Unnepnap", "Ünnepnap"),
    day("2027-06-18", "UtolsoTanitasiNap", "Utolsó tanítási nap"),
  ];

  it("groups off days across weekends and names them by season", () => {
    const cal = schoolCalendar(published, at("2026-11-09T10:00:00Z"));
    expect(cal.firstEstimated || cal.lastEstimated).toBe(false);
    const real = cal.breaks.filter((b) => !b.estimated);
    expect(real).toEqual([
      // The 23 October holiday and both weekends join the autumn break.
      { name: "Őszi szünet", start: "2026-10-23", end: "2026-11-01", estimated: false },
      { name: "Téli szünet", start: "2026-12-19", end: "2027-01-03", estimated: false },
    ]);
    // Spring is not in the school's data yet, so the usual Easter window is added.
    expect(cal.breaks.filter((b) => b.estimated).map((b) => b.name)).toEqual([
      "Tavaszi szünet",
    ]);
  });

  it("counts down to the next break from the end of the previous one", () => {
    const cal = schoolCalendar(published, at("2026-11-09T10:00:00Z"));
    const next = breakProgress(cal, at("2026-11-09T10:00:00Z"));
    expect(next.current).toBeNull();
    expect(next.next?.name).toBe("Téli szünet");
    expect(next.since).toBe("2026-11-02");
    expect(next.remainingDays).toBe(40);
    // 2 Nov – 18 Dec: seven weeks of teaching, one already behind.
    expect(next.schoolDaysLeft).toBe(30);
    expect(next.percent).toBeGreaterThan(10);
    expect(next.percent).toBeLessThan(20);
  });

  it("reports an ongoing break with time left until school resumes", () => {
    const cal = schoolCalendar(published, at("2026-12-28T10:00:00Z"));
    const now = breakProgress(cal, at("2026-12-28T10:00:00Z"));
    expect(now.current?.name).toBe("Téli szünet");
    expect(now.remainingDays).toBe(7);
    expect(now.next?.name).toBe("Tavaszi szünet");
  });

  it("tracks the whole school year and excludes breaks from teaching days", () => {
    const cal = schoolCalendar(published, at("2027-06-14T10:00:00Z"));
    const year = yearProgress(cal, at("2027-06-14T10:00:00Z"));
    expect(year.phase).toBe("during");
    expect(year.remainingDays).toBe(4);
    expect(year.schoolDaysLeft).toBe(5);
    expect(year.percent).toBeGreaterThan(95);
    const summer = yearProgress(cal, at("2027-07-01T10:00:00Z"));
    expect(summer.phase).toBe("after");
    expect(summer.percent).toBe(100);
    expect(summer.remainingDays).toBe(0);
  });
});
