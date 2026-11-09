import { emptySnapshot, type Snapshot } from "./bridge";
import { today, weekDays } from "./data";
import { estimatedCalendar, schoolYearOf } from "./progress";
export function demoSnapshot(): Snapshot {
  const s = emptySnapshot();
  const base = new Date(`${today()}T12:00:00`);
  const day = (offset: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const subjects = [
    "Matematika",
    "Magyar irodalom",
    "Történelem",
    "Angol nyelv",
    "Digitális kultúra",
    "Biológia",
    "Testnevelés",
  ];
  const teachers = [
    "Kovács Anna",
    "Szabó Eszter",
    "Nagy Péter",
    "Tóth Júlia",
    "Varga Dániel",
    "Kiss Éva",
    "Farkas Gábor",
  ];
  s.activeAccountId = "demo";
  s.accounts = [
    {
      id: "demo",
      name: "Minta Alex",
      institutionCode: "demo",
      institutionName: "Minta Gimnázium · bemutató",
      username: "demo",
    },
  ];
  s.data = {
    student: {
      Nev: "Minta Alex",
      IntezmenyNev: "Minta Gimnázium",
      IntezmenyAzonosito: "demo",
      EmailCim: "alex@example.invalid",
      TanevUid: "2026/2027",
      Osztaly: "11. B",
      Gondviselok: [
        { Nev: "Minta Andrea", EmailCim: "andrea@example.invalid" },
      ],
    },
    grades: Array.from({ length: 36 }, (_, i) => ({
      Uid: `grade-${i}`,
      Tantargy: { Nev: subjects[i % 7] },
      SzamErtek: [5, 4, 5, 5, 4, 3, 5, 4, 5][i % 9],
      SulySzazalekErteke: i % 4 === 0 ? 200 : 100,
      KeszitesDatuma: day(-i * 3),
      Tema: [
        "Másodfokú egyenletek",
        "A romantika irodalma",
        "A reformkor",
        "Unit 4 · Our changing world",
        "Algoritmusok",
        "A sejt felépítése",
        "Atlétika",
      ][i % 7],
      ErtekeloTanarNeve: teachers[i % 7],
      Mod: { Leiras: i % 4 === 0 ? "Témazáró dolgozat" : "Órai munka" },
      Tipus: { Nev: "evkozi_jegy_ertekeles" },
    })),
    timetable: weekDays()
      .slice(0, 5)
      .flatMap((d, di) =>
        subjects.slice(0, 6 - (di % 2)).map((_, i) => {
          const n = (i + di) % 7;
          return {
            Uid: `lesson-${d}-${i}`,
            Datum: d,
            Tantargy: { Nev: subjects[n] },
            KezdetIdopont: `${d}T${String(8 + i).padStart(2, "0")}:00:00`,
            VegIdopont: `${d}T${String(8 + i).padStart(2, "0")}:45:00`,
            Oraszam: i + 1,
            TanarNeve: teachers[n],
            TeremNeve: `${101 + n * 11}`,
            Tema: ["Gyakorlás és feladatmegoldás", "Új ismeretek feldolgozása"][
              i % 2
            ],
            Allapot: { Nev: "Tervezett" },
          };
        }),
      ),
    homework: [
      {
        Uid: "hw-1",
        Tantargy: { Nev: "Matematika" },
        Szoveg:
          "Másodfokú egyenletek: tankönyv 84. oldal, 3–6. feladat. A megoldások menetét is írd le!",
        HataridoDatuma: day(1),
        RogzitoTanarNeve: teachers[0],
      },
      {
        Uid: "hw-2",
        Tantargy: { Nev: "Angol nyelv" },
        Szoveg:
          "Workbook, Unit 4: exercises 2–5. Prepare a short presentation about your favourite place.",
        HataridoDatuma: day(2),
        RogzitoTanarNeve: teachers[3],
      },
      {
        Uid: "hw-3",
        Tantargy: { Nev: "Magyar irodalom" },
        Szoveg: "Olvasd el a kijelölt verset, és gyűjtsd ki a költői képeket.",
        HataridoDatuma: day(3),
        RogzitoTanarNeve: teachers[1],
      },
    ],
    tests: [
      {
        Uid: "test-1",
        Tantargy: { Nev: "Történelem" },
        Temaja: "A reformkor és az 1848-as forradalom",
        Datum: day(2),
        RogzitoTanarNeve: teachers[2],
        Modja: { Leiras: "Témazáró dolgozat" },
      },
      {
        Uid: "test-2",
        Tantargy: { Nev: "Biológia" },
        Temaja: "Sejtek és szövetek",
        Datum: day(5),
        RogzitoTanarNeve: teachers[5],
        Modja: { Leiras: "Röpdolgozat" },
      },
    ],
    absences: Array.from({ length: 4 }, (_, i) => ({
      Uid: `abs-${i}`,
      Tantargy: { Nev: subjects[i] },
      Datum: day(-8),
      IgazolasAllapota: i === 3 ? "Igazolando" : "Igazolt",
      Tipus: { Leiras: "Hiányzás" },
    })),
    messagesInbox: [
      {
        azonosito: "m-1",
        elolvasva: false,
        uzenet: {
          targy: "Őszi osztálykirándulás – tudnivalók",
          feladoNev: "Kovács Anna",
          kuldesDatum: day(-1),
          szoveg:
            "Kedves Diákok!\n\nA pénteki kirándulásra 7:45-kor találkozunk az iskola főbejáratánál. Hozzatok kényelmes cipőt, innivalót és esőkabátot.\n\nSzép hetet kívánok!\nKovács Anna",
        },
      },
      {
        azonosito: "m-2",
        elolvasva: true,
        uzenet: {
          targy: "Könyvtári nyitvatartás",
          feladoNev: "Iskolai könyvtár",
          kuldesDatum: day(-3),
          szoveg:
            "A könyvtár hétfőtől csütörtökig 8 és 16 óra között vár mindenkit. Pénteken 14 óráig vagyunk nyitva.",
        },
      },
    ],
    messagesSent: [],
    messagesDeleted: [],
    notices: [
      {
        Uid: "notice-1",
        Cim: "Diáknap a jövő héten",
        RogzitoNeve: "Diákönkormányzat",
        TartalomText:
          "Sport, közös programok és sok-sok élmény. A részletes program hamarosan érkezik!",
        ErvenyessegKezdete: day(-2),
      },
    ],
    notes: [
      {
        Uid: "note-1",
        Cim: "Házi feladat hiány",
        KeszitoTanarNeve: teachers[0],
        Datum: day(-1),
        KeszitesDatuma: `${day(-1)}T08:15:00`,
        Tipus: {
          Nev: "HaziFeladatHiany",
          Leiras: "Házi feladat hiány",
        },
        Tartalom: "A kijelölt feladatgyűjteményi gyakorlatok (42-45. feladat) nem készültek el az órára.",
      },
      {
        Uid: "note-2",
        Cim: "Dicséret",
        KeszitoTanarNeve: teachers[1],
        Datum: day(-3),
        KeszitesDatuma: `${day(-3)}T10:30:00`,
        Tipus: {
          Nev: "Dicseret",
          Leiras: "Szaktanári dicséret",
        },
        Tartalom: "Kiemelkedő órai aktivitásért és a versenyfeladatok önálló megoldásáért szaktanári dicséretben részesül.",
      },
      {
        Uid: "note-3",
        Cim: "Figyelmeztetés",
        KeszitoTanarNeve: teachers[2],
        Datum: day(-5),
        KeszitesDatuma: `${day(-5)}T11:45:00`,
        Tipus: {
          Nev: "Figyelmeztetes",
          Leiras: "Szaktanári figyelmeztetés",
        },
        Tartalom: "Felszerelés hiánya miatt szaktanári figyelmeztetésben részesül.",
      },
    ],
    consultations: [
      {
        TanarNeve: teachers[0],
        KezdetIdopont: `${day(7)}T16:00:00`,
        VegIdopont: `${day(7)}T17:00:00`,
        TeremNeve: "101",
      },
    ],
    lep: [
      {
        eloadasId: "lep-1",
        eloadasCim: "Egy este a színházban",
        helyszin: "Városi Színház",
        datum: day(14),
        leiras: "Közös színházi előadás a Lázár Ervin Program keretében.",
        idotartam: 90,
        engedelyezve: true,
      },
    ],
  };
  s.lastSyncedAt = new Date().toISOString();
  s.notifications = [
    {
      id: "n1",
      kind: "grade",
      title: "Új értékelés · Matematika",
      body: "Jeles (5) · Másodfokú egyenletek",
      createdAt: new Date().toISOString(),
      accountId: "demo",
    },
  ];
  // A plausible published school calendar so the progress page has real-looking data.
  const year = estimatedCalendar(schoolYearOf(today()));
  const calendar: Record<string, unknown>[] = [
    { Datum: year.firstDay, Naptipus: { Nev: "ElsoTanitasiNap", Leiras: "Első tanítási nap" } },
    { Datum: year.lastDay, Naptipus: { Nev: "UtolsoTanitasiNap", Leiras: "Utolsó tanítási nap" } },
  ];
  for (const pause of year.breaks)
    for (let d = new Date(`${pause.start}T00:00:00Z`); d.toISOString().slice(0, 10) <= pause.end; d.setUTCDate(d.getUTCDate() + 1))
      if (d.getUTCDay() % 6 !== 0)
        calendar.push({
          Datum: d.toISOString().slice(0, 10),
          Naptipus: { Nev: "TanitasiSzunet", Leiras: "Tanítási szünet" },
        });
  s.data.schoolYear = calendar;
  return s;
}
