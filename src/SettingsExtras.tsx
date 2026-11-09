import { useEffect, useState } from "react";
import { Bell, SlidersHorizontal } from "lucide-react";
import { useApp } from "./context";
import { Button, Card, Toggle } from "./components";
import type { Settings } from "./bridge";
import { t } from "./i18n";

const navigation = [
  ["timetable", "Órarend"],
  ["grades", "Jegyek"],
  ["statistics", "Statisztikák"],
  ["progress", "Haladás"],
  ["homework", "Házi feladatok"],
  ["absences", "Hiányzások"],
  ["messages", "Üzenetek"],
  ["notes", "Feljegyzések"],
  ["consultations", "Fogadóórák"],
  ["lep", "LEP programok"],
];
const categories = [
  ["grades", "Jegyek"],
  ["homework", "Házi feladatok"],
  ["tests", "Dolgozatok"],
  ["absences", "Hiányzások"],
  ["timetable", "Órarendváltozás"],
  ["notes", "Feljegyzések"],
  ["notices", "Faliújság"],
  ["messagesInbox", "Üzenetek"],
];

export function SettingsExtras() {
  const { snapshot, settings, toast } = useApp();
  const s = snapshot.settings;
  const save = (value: Partial<Settings>) => {
    void settings(value).catch(() => {});
  };
  const [thresholds, setThresholds] = useState(s.gradeThresholds);
  useEffect(() => setThresholds(s.gradeThresholds), [s.gradeThresholds]);
  return (
    <div className="settings-extras two-column section-gap">
      <div className="stack">
        <Card
          title={t("Nyelv és menü")}
          action={<SlidersHorizontal size={18} />}
        >
          <label className="setting-row">
            <strong>{t("Nyelv")}</strong>
            <select
              className="form-control"
              aria-label={t("Nyelv")}
              value={s.language}
              onChange={(e) => save({ language: e.target.value })}
            >
              <option value="hu">Magyar</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <fieldset className="appearance-fieldset section-gap">
            <legend>{t("Látható menüpontok")}</legend>
            <div className="preferences-checks">
              {navigation.map(([id, label]) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={!s.hiddenNav.includes(id)}
                    onChange={(e) =>
                      save({
                        hiddenNav: e.target.checked
                          ? s.hiddenNav.filter((v) => v !== id)
                          : [...s.hiddenNav, id],
                      })
                    }
                  />
                  {t(label)}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      </div>
      <div className="stack">
        <Card
          title={t("Milyen változásokról szóljunk?")}
          action={<Bell size={18} />}
        >
          <p className="small muted">
            {t(
              "A kikapcsolt kategóriák frissülnek, de nem küldenek értesítést.",
            )}
          </p>
          {categories.map(([id, label]) => (
            <Toggle
              key={id}
              label={t(label)}
              description=""
              checked={s.notificationCategories.includes(id)}
              onChange={(enabled) =>
                save({
                  notificationCategories: enabled
                    ? [...s.notificationCategories, id]
                    : s.notificationCategories.filter((v) => v !== id),
                })
              }
            />
          ))}
        </Card>
        <Card title={t("Csengő és jegytervezés")}>
          <label className="setting-row">
            <span>
              <strong>{t("Csengő eltolása")}</strong>
              <small>
                {t(
                  "Pozitív érték: az iskola csengője késik. Csak a visszaszámlálást módosítja.",
                )}
              </small>
            </span>
            <select
              className="form-control"
              aria-label={t("Csengő eltolása")}
              value={s.bellOffsetMinutes}
              onChange={(e) =>
                save({ bellOffsetMinutes: Number(e.target.value) })
              }
            >
              {Array.from({ length: 61 }, (_, i) => i - 30).map((value) => (
                <option key={value} value={value}>
                  {value > 0 ? "+" : ""}
                  {value} min
                </option>
              ))}
            </select>
          </label>
          <fieldset className="appearance-fieldset section-gap">
            <legend>{t("Becsült év végi jegyek határai")}</legend>
            <p className="small muted">
              {t(
                "Saját tervezési becslés, nem hivatalos osztályzat. A tanár értékelése eltérhet.",
              )}
            </p>
            <div className="threshold-inputs">
              {thresholds.map((value, i) => (
                <label key={i}>
                  {i + 2}
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.05"
                    aria-label={`${t("Jegyhatár")} ${i + 2}`}
                    value={value}
                    onChange={(e) =>
                      setThresholds((old) =>
                        old.map((n, j) =>
                          i === j ? Number(e.target.value) : n,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <Button
              onClick={() => {
                if (
                  thresholds.some(
                    (value, i) =>
                      !Number.isFinite(value) ||
                      value < 1 ||
                      value > 5 ||
                      (i > 0 && value <= thresholds[i - 1]),
                  )
                ) {
                  toast(
                    t(
                      "A jegyhatárok 1 és 5 közé eső, növekvő számok legyenek.",
                    ),
                  );
                  return;
                }
                void settings({ gradeThresholds: thresholds })
                  .then(() => toast(t("Beállítások mentve.")))
                  .catch(() => {});
              }}
            >
              {t("Jegyhatárok mentése")}
            </Button>
          </fieldset>
        </Card>
        {snapshot.storageMode === "file" && (
          <Card title={t("Helyi kulcstárolás")}>
            <p className="small muted">
              {t(
                "A rendszer kulcstartója nem érhető el. A titkosítás kulcsát csak a saját felhasználód által olvasható helyi fájl tárolja. A kulcsot ne töröld vagy mozgasd külön az adattárolótól.",
              )}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
