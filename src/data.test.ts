import { describe, expect, it } from "vitest";
import {
  absenceRows,
  average,
  classAverageRows,
  consultationRows,
  dateLabel,
  grades,
  homeworkRows,
  lessons,
  lessonStatus,
  localDay,
  messages,
  monthlyTrend,
  schoolTimestamp,
  timeLabel,
  weekDays,
} from "./data";

// Synthetic fixtures follow Firka's kreta_api models and KRETEN's mailbox contracts.
const grade = (
  id: string,
  value: unknown,
  weight: unknown = 100,
  extra = {},
) => ({
  Uid: id,
  Tantargy: { Nev: "Matematika", Leiras: "A matematika tantárgy leírása" },
  SzamErtek: value,
  SulySzazalekErteke: weight,
  KeszitesDatuma: "2026-09-12T09:15:00+02:00",
  Tipus: { Nev: "evkozi_jegy_ertekeles" },
  ...extra,
});

describe("official mobile evaluations", () => {
  it("uses subject names and weights, excluding text marks and semester finals from averages", () => {
    const items = grades([
      grade("one", 5, 200),
      grade("two", 3, 100),
      grade("text", null, null, { SzovegesErtek: "Dicséret" }),
      grade("final", 1, 100, { Tipus: { Nev: "felevi_jegy_ertekeles" } }),
    ]);
    expect(items[0].subject).toBe("Matematika");
    expect(average(items)).toBeCloseTo(13 / 3);
    expect(items.find((g) => g.id === "text")?.display).toBe("Dicséret");
  });
  it("keeps zero-weight grades from affecting averages and treats null weight as 100 percent", () => {
    expect(
      average(grades([grade("zero", 1, 0), grade("default", 4, null)])),
    ).toBe(4);
    expect(average(grades([grade("negative", 5, -100)]))).toBeNull();
    expect(average(grades([]))).toBeNull();
  });
  it("groups monthly weighted averages by school-local date across a UTC month boundary", () => {
    const result = monthlyTrend(
      grades([
        grade("one", 5, 100, { KeszitesDatuma: "2026-08-31T22:15:00Z" }),
        grade("two", 3, 100, { KeszitesDatuma: "2026-09-02T08:00:00+02:00" }),
      ]),
    );
    expect(result).toEqual([{ month: "2026-09", value: 4 }]);
  });
  it("reads class averages from the actual Firka schema", () => {
    expect(
      classAverageRows([
        {
          Uid: "math",
          Tantargy: { Nev: "Matematika" },
          TanuloAtlag: 4.25,
          OsztalyCsoportAtlag: 3.8,
        },
        { Tantargy: { Nev: "Hiányos" } },
      ]),
    ).toEqual([{ id: "math", name: "Matematika", student: 4.25, group: 3.8 }]);
  });
});

describe("Budapest school time", () => {
  it("preserves date-only and unzoned school timestamps independent of OS timezone", () => {
    expect(localDay("2026-09-01")).toBe("2026-09-01");
    expect(localDay("2026-09-01T23:30:00")).toBe("2026-09-01");
    expect(timeLabel("2026-09-01T08:15:00")).toBe("08:15");
    expect(dateLabel("2026-09-01T23:30:00", true)).toContain("2026");
  });
  it("converts offset timestamps into Budapest and accounts for summer/winter time", () => {
    expect(localDay("2026-09-01T23:30:00Z")).toBe("2026-09-02");
    expect(timeLabel("2026-09-01T06:15:00Z")).toBe("08:15");
    expect(schoolTimestamp("2026-09-01T08:15:00")).toBe(
      Date.parse("2026-09-01T06:15:00Z"),
    );
    expect(schoolTimestamp("2026-01-14T08:15:00")).toBe(
      Date.parse("2026-01-14T07:15:00Z"),
    );
  });
  it("uses full recurring lesson UIDs and skips cancelled lessons for the countdown", () => {
    const schedule = lessons([
      {
        Uid: "123,2026-09-01",
        Nev: "Matematika",
        KezdetIdopont: "2026-09-01T08:00:00",
        VegIdopont: "2026-09-01T08:45:00",
        Allapot: { Nev: "Elmaradt" },
      },
      {
        Uid: "123,2026-09-02",
        Nev: "Matematika",
        KezdetIdopont: "2026-09-02T08:00:00",
        VegIdopont: "2026-09-02T08:45:00",
      },
    ]);
    expect(schedule.map((l) => l.id)).toEqual([
      "123,2026-09-01",
      "123,2026-09-02",
    ]);
    expect(
      lessonStatus(schedule, new Date("2026-09-01T06:15:00Z")).active,
    ).toBeUndefined();
    const current = lessonStatus(schedule, new Date("2026-09-02T06:30:00Z"));
    expect(current.active?.id).toBe("123,2026-09-02");
    expect(current.remaining).toBe(15);
  });
  it("retains Saturday and Sunday so replacement teaching days can be shown", () => {
    const days = weekDays();
    expect(days).toHaveLength(7);
    expect(new Date(`${days[0]}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(new Date(`${days[6]}T12:00:00Z`).getUTCDay()).toBe(0);
  });
});

describe("official e-administration message shapes", () => {
  const mailbox = [
    {
      azonosito: 1,
      isElolvasva: true,
      tipus: { kod: "BEERKEZETT" },
      uzenet: {
        azonosito: 101,
        targy: "Received",
        kuldesDatum: "2026-09-01T12:00:00",
        szoveg: "<p>Safe message</p>",
        csatolmanyok: [{ azonosito: 9, fajlNev: "test.pdf" }],
      },
    },
    {
      azonosito: 2,
      tipus: { kod: "ELKULDOTT" },
      uzenet: { azonosito: 102, targy: "Sent" },
    },
    {
      azonosito: 3,
      isToroltElem: true,
      tipus: { kod: "BEERKEZETT" },
      uzenet: { azonosito: 103, targy: "Deleted" },
    },
  ];
  it("uses mailbox identifiers, actual read flags, and folder/deletion rules", () => {
    const received = messages(mailbox, "beerkezett");
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("1");
    expect(received[0].read).toBe(true);
    expect(received[0].attachments[0].fajlNev).toBe("test.pdf");
    expect(messages(mailbox, "elkuldott").map((m) => m.id)).toEqual(["2"]);
    expect(messages(mailbox, "torolt").map((m) => m.id)).toEqual(["3"]);
  });
  it("handles legacy flat mailbox summaries and null detail collections", () => {
    const legacy = messages([
      {
        azonosito: 4,
        uzenetAzonosito: 104,
        uzenetTargy: "Legacy",
        uzenetFeladoNev: null,
        uzenetKuldesDatum: "2026-09-01T10:00:00Z",
        isElolvasva: false,
      },
    ]);
    expect(legacy[0]).toMatchObject({
      id: "4",
      subject: "Legacy",
      sender: "",
      read: false,
    });
    expect(
      messages([
        { azonosito: 5, uzenet: { szoveg: "<p>Text</p>", csatolmanyok: null } },
      ])[0].attachments,
    ).toEqual([]);
  });
  it("turns notice and homework HTML into plain text without executable markup", () => {
    expect(
      messages([
        {
          Uid: "notice",
          Cim: "Hír",
          TartalomFormazott: '<p>Szöveg <img onerror="alert(1)" src="x"></p>',
        },
      ])[0].text,
    ).not.toContain("<");
    expect(
      homeworkRows([
        {
          Uid: "hw",
          Tantargy: { Nev: "Angol" },
          Szoveg: "<strong>Read</strong> chapter 2",
          HataridoDatuma: "2026-09-04",
        },
      ])[0].text,
    ).toContain("Read");
  });
});

describe("school records", () => {
  it("flattens actual grouped consultation data and retains reserved slots", () => {
    const result = consultationRows([
      {
        Tanar: { Nev: "Minta Tanár" },
        Fogadoorak: [
          {
            Uid: "meeting-1",
            KezdoIdopont: "2026-10-15T16:00:00",
            VegIdopont: "2026-10-15T17:00:00",
            Terem: { Nev: "204" },
            Idopontok: [
              { IsJelentkeztem: false, KezdoIdopont: "2026-10-15T16:00:00" },
              { IsJelentkeztem: true, KezdoIdopont: "2026-10-15T16:10:00" },
            ],
          },
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      uid: "meeting-1",
      tanarNev: "Minta Tanár",
      teremNev: "204",
      idopont: "2026-10-15T16:00:00",
      foglalas: "2026-10-15T16:10:00",
    });
  });
  it("does not treat unexcused or pending absences as excused", () => {
    const result = absenceRows(
      ["Igazolt", "Igazolatlan", "Igazolando"].map((status, i) => ({
        Uid: String(i),
        IgazolasAllapota: status,
        KesesPercben: i === 2 ? 7 : null,
      })),
    );
    expect(result.map((a) => a.justified)).toEqual([true, false, false]);
    expect(result.reduce((sum, a) => sum + a.minutes, 0)).toBe(7);
  });
});

describe("school year milestones and honest local predictions", () => {
  it("selects the published school-year markers rather than rendering all ordinary teaching days", async () => {
    const { schoolYearRows } = await import("./data");
    expect(
      schoolYearRows([
        { Datum: "2026-09-01", Naptipus: { Leiras: "Első tanítási nap" } },
        { Datum: "2026-09-02", Naptipus: { Leiras: "Tanítási nap" } },
        { Datum: "2027-01-22", Naptipus: { Leiras: "Első félév vége" } },
      ]),
    ).toEqual([
      { date: "2026-09-01", description: "Első tanítási nap" },
      { date: "2027-01-22", description: "Első félév vége" },
    ]);
  });
  it("uses configurable grade boundaries including exact boundary values and handles missing data", async () => {
    const { estimatedGrade } = await import("./data");
    expect(estimatedGrade(null)).toBeNull();
    expect(estimatedGrade(Number.NaN)).toBeNull();
    expect(estimatedGrade(4.5)).toBe(5);
    expect(estimatedGrade(4.5, [1.8, 2.8, 3.8, 4.8])).toBe(4);
    expect(estimatedGrade(1)).toBe(1);
    expect(estimatedGrade(5)).toBe(5);
    expect(estimatedGrade(4.5, [2, 2, 3, 4])).toBe(5);
  });
});

describe("user requested features & regressions", () => {
  it("hides jegy_xxx internal codes from grades", async () => {
    const { grades, isJegyCode } = await import("./data");
    expect(isJegyCode("jegy_50")).toBe(true);
    expect(isJegyCode("jegy_100")).toBe(true);
    expect(isJegyCode("témazáró")).toBe(false);

    const items = grades([
      grade("g1", 5, 100, { Tema: "jegy_100", Mod: "jegy_50" }),
      grade("g2", 4, 100, { Tema: "Szóbeli felelet", Mod: "Hagyományos" }),
    ]);
    expect(items[0].topic).toBe("");
    expect(items[0].type).toBe("");
    expect(items[1].topic).toBe("Szóbeli felelet");
  });

  it("sorts tests with upcoming closest first, then past tests from most recent to oldest", async () => {
    const { testRows, today } = await import("./data");
    const t = today();
    const rows = testRows([
      { Uid: "old-past", Datum: "2020-01-01", Tantargy: { Nev: "Történelem" }, Temaja: "Róma" },
      { Uid: "recent-past", Datum: "2026-01-01", Tantargy: { Nev: "Magyar" }, Temaja: "Arany János" },
      { Uid: "furthest-future", Datum: "2030-01-01", Tantargy: { Nev: "Fizika" }, Temaja: "Optika" },
      { Uid: "near-future", Datum: t, Tantargy: { Nev: "Matematika" }, Temaja: "Integrál" },
    ]);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(["near-future", "furthest-future", "recent-past", "old-past"]);
  });

  it("extracts and classifies notes into homework deficits, praises, warnings, and notices", async () => {
    const { noteRows } = await import("./data");
    const items = noteRows(
      [
        {
          Uid: "n-deficit",
          Cim: "Házi feladat hiány",
          Tipus: { Leiras: "Házi feladat hiány" },
          KeszitoTanarNeve: "Kovács Anna",
          Tartalom: "Nem készült el a matek házi.",
          Datum: "2026-10-01",
        },
        {
          Uid: "n-praise",
          Cim: "Dicséret",
          Tipus: { Leiras: "Szaktanári dicséret" },
          KeszitoTanarNeve: "Nagy Péter",
          Tartalom: "Kiváló versenyeredmény!",
          Datum: "2026-09-20",
        },
        {
          Uid: "n-warning",
          Cim: "Figyelmeztetés",
          Tipus: { Leiras: "Intő" },
          KeszitoTanarNeve: "Szabó Éva",
          Tartalom: "Késés.",
          Datum: "2026-09-15",
        },
      ],
      [
        {
          Uid: "notice-1",
          Cim: "Iskolanap",
          RogzitoNeve: "Igazgatóság",
          TartalomText: "Pénteken rövidített órák lesznek.",
          ErvenyessegKezdete: "2026-10-05",
        },
      ],
    );

    expect(items).toHaveLength(4);
    const deficit = items.find((i) => i.id === "n-deficit");
    expect(deficit?.isHomeworkDeficit).toBe(true);
    expect(deficit?.isPraise).toBe(false);

    const praise = items.find((i) => i.id === "n-praise");
    expect(praise?.isPraise).toBe(true);

    const warning = items.find((i) => i.id === "n-warning");
    expect(warning?.isWarning).toBe(true);

    const notice = items.find((i) => i.id === "notice-1");
    expect(notice?.kind).toBe("notice");
  });

  it("calculates live lesson timer with remaining seconds and progress percentage", async () => {
    const { currentLiveStatus, remainingCountdownText } = await import("./data");
    expect(remainingCountdownText(65000)).toBe("1 perc 05 mp van hátra");
    expect(remainingCountdownText(120000)).toBe("2 perc 00 mp van hátra");

    const intervals = [
      {
        start: 100000,
        end: 200000,
        date: "2026-10-15",
        subject: "Biológia",
        time: "08:00 – 08:45",
        classroom: "201",
        teacher: "Minta Tanár",
      },
    ];

    const status = currentLiveStatus(intervals, 150000);
    expect(status.kind).toBe("lesson");
    expect(status.title).toBe("Biológia");
    expect(status.progress).toBe(50);
    expect(status.remaining).toBe("0 perc 50 mp van hátra");
  });
});
