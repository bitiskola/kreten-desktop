import { Check, Laptop, Moon, Paintbrush, Sun, Type } from "lucide-react";
import { useApp } from "./context";
import { Card, Header, Palette, Toggle } from "./components";
import type { Settings } from "./bridge";
import { t } from "./i18n";

export const uiStyles = [
  {
    id: "glass",
    label: "Glassmorphism",
    description: "Áttetsző, üveges kártyák lágy színátmenetes háttéren.",
  },
  {
    id: "pixel",
    label: "Pixel",
    description: "Kockás, blokkos játékfelület vastag keretekkel és pixeles betűkkel.",
  },
  {
    id: "hyperos",
    label: "HyperOS",
    description: "Tiszta, letisztult MIUI / HyperOS stílus nagy, kerek kártyákkal.",
  },
  {
    id: "material",
    label: "Material 3",
    description: "Google Material You: tónusos felületek, kapszula gombok, dinamikus színek.",
  },
] as const;

const palettes = [
  ["ocean", "Óceán"],
  ["lavender", "Levendula"],
  ["mint", "Menta"],
  ["sunset", "Naplemente"],
  ["rose", "Rózsa"],
  ["graphite", "Grafit"],
];

/** A tiny, self-contained mock of each design so it can be compared before switching. */
function StylePreview({ id }: { id: string }) {
  return (
    <span className={`ui-preview ui-preview-${id}`} aria-hidden="true">
      <i className="ui-preview-nav">
        <b />
        <b />
        <b />
      </i>
      <i className="ui-preview-main">
        <i className="ui-preview-card">
          <b />
          <b className="short" />
        </i>
        <i className="ui-preview-row">
          <i className="ui-preview-card small" />
          <i className="ui-preview-button" />
        </i>
      </i>
    </span>
  );
}

export function ThemePage() {
  const { snapshot, settings } = useApp();
  const s = snapshot.settings;
  const save = (value: Partial<Settings>) => {
    void settings(value).catch(() => {});
  };
  return (
    <>
      <Header
        eyebrow={t("TÉMA")}
        title={t("Olyan, amilyennek látni szeretnéd.")}
        description={t(
          "A felület stílusa, a színek, a háttér és a betűk – minden megjelenési beállítás egy helyen.",
        )}
      />
      <Card
        title={t("Felület stílusa")}
        action={<span className="badge">{t("Új")}</span>}
      >
        <p className="muted small">
          {t(
            "Válts a teljes felület kinézete között. A kiemelőszín és a világos/sötét mód minden stílusnál megmarad.",
          )}
        </p>
        <div className="ui-style-grid">
          {uiStyles.map((style) => {
            const selected = s.uiStyle === style.id;
            return (
              <button
                key={style.id}
                className={`ui-style-choice ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                onClick={() => save({ uiStyle: style.id })}
              >
                <StylePreview id={style.id} />
                <span className="ui-style-copy">
                  <strong>
                    {style.label}
                    {selected && <Check size={14} />}
                  </strong>
                  <small>{t(style.description)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <div className="settings-grid section-gap">
        <div className="stack">
          <Card title={t("Színek")} action={<Paintbrush size={18} />}>
            <fieldset className="appearance-fieldset">
              <legend>{t("Világos vagy sötét?")}</legend>
              <div className="display-choices">
                {(
                  [
                    ["light", "Világos", Sun],
                    ["dark", "Sötét", Moon],
                    ["system", "Rendszer", Laptop],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    className={s.theme === value ? "selected" : ""}
                    aria-pressed={s.theme === value}
                    onClick={() => save({ theme: value })}
                  >
                    <Icon size={18} />
                    {t(label)}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="appearance-fieldset">
              <legend>{t("Kiemelőszín")}</legend>
              <p className="muted small">
                {t("A háttér, a kártyák és a kiemelések együtt váltanak színt.")}
              </p>
              <div className="palette-grid">
                {palettes.map(([value, label]) => (
                  <Palette
                    key={value}
                    value={value}
                    label={t(label)}
                    selected={s.palette === value}
                    onClick={() => save({ palette: value })}
                  />
                ))}
              </div>
            </fieldset>
          </Card>
        </div>
        <div className="stack">
          <Card title={t("Betűk és elrendezés")} action={<Type size={18} />}>
            <label className="setting-row">
              <strong>{t("Navigáció helye")}</strong>
              <select
                className="form-control"
                aria-label={t("Navigáció helye")}
                value={s.sidebarSide}
                onChange={(e) => save({ sidebarSide: e.target.value })}
              >
                <option value="left">{t("Bal oldalon")}</option>
                <option value="right">{t("Jobb oldalon")}</option>
              </select>
            </label>
            <label className="setting-row">
              <strong>{t("Címsor betűtípusa")}</strong>
              <select
                className="form-control"
                aria-label={t("Címsor betűtípusa")}
                value={s.titleFont}
                onChange={(e) => save({ titleFont: e.target.value })}
              >
                <option value="system">{t("Rendszer")}</option>
                <option value="serif">{t("Klasszikus")}</option>
                <option value="rounded">{t("Kerekített")}</option>
              </select>
            </label>
            <label className="setting-row">
              <strong>{t("Címsor vastagsága")}</strong>
              <select
                className="form-control"
                aria-label={t("Címsor vastagsága")}
                value={s.titleWeight}
                onChange={(e) => save({ titleWeight: Number(e.target.value) })}
              >
                {[400, 500, 600, 650, 700, 800].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </Card>
          <Card title={t("Háttér")}>
            <p className="small muted">
              {t("A bejelentkezési képernyő két saját színe.")}
            </p>
            <div
              className="wallpaper-preview"
              style={{
                background: `linear-gradient(120deg, ${s.wallpaperColor1}, ${s.wallpaperColor2})`,
              }}
            />
            <div className="row color-inputs">
              <label>
                {t("Első szín")}
                <input
                  type="color"
                  value={s.wallpaperColor1}
                  onChange={(e) => save({ wallpaperColor1: e.target.value })}
                />
              </label>
              <label>
                {t("Második szín")}
                <input
                  type="color"
                  value={s.wallpaperColor2}
                  onChange={(e) => save({ wallpaperColor2: e.target.value })}
                />
              </label>
            </div>
            <Toggle
              label={t("Mozgó háttér")}
              description={t(
                "A csökkentett mozgás rendszerbeállítása mindig elsőbbséget élvez.",
              )}
              checked={s.animatedBackground}
              onChange={(animatedBackground) => save({ animatedBackground })}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
