import type { Settings } from "../shared/contracts";
import { ThemeScene } from "./ThemeScene";
import { translate } from "./i18n";
import "./appearance-studio.css";

const scenes: Settings["scene"][] = [
  "london",
  "tokyo",
  "newyork",
  "paris",
  "cyber",
  "space",
  "forest",
  "mountain",
  "ocean",
  "sakura",
  "minimal-dark",
  "minimal-light",
];

export function AppearanceStudio({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(settings.locale, key);
  return (
    <div className="appearance-studio">
      <label className="setting-row">
        {t("scene")}
        <select
          aria-label={t("scene")}
          value={settings.scene}
          onChange={(event) =>
            update({ scene: event.target.value as Settings["scene"] })
          }
        >
          {scenes.map((scene) => (
            <option value={scene} key={scene}>
              {t(scene)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">{t("sceneHint")}</p>
      <label className="setting-row">
        {t("sceneArtwork")}
        <select
          aria-label={t("sceneArtwork")}
          value={settings.sceneArtwork}
          onChange={(event) =>
            update({
              sceneArtwork: event.target.value as Settings["sceneArtwork"],
            })
          }
        >
          <option value="realistic">{t("realisticArtwork")}</option>
          <option value="vector">{t("vectorArtwork")}</option>
        </select>
      </label>
      <p className="hint">{t("artworkHint")}</p>
      <div
        className="scene-gallery"
        role="group"
        aria-label={t("sceneGallery")}
      >
        {scenes.map((scene) => (
          <button
            key={scene}
            type="button"
            className="scene-choice"
            aria-label={t(scene)}
            aria-pressed={settings.scene === scene}
            onClick={() => update({ scene })}
          >
            <span className="scene-thumbnail" aria-hidden="true">
              <ThemeScene
                theme={scene}
                artwork={settings.sceneArtwork}
                preview
              />
            </span>
            <span>{t(scene)}</span>
          </button>
        ))}
      </div>
      <label className="setting-row">
        <span>{t("customColors")}</span>
        <input
          type="checkbox"
          checked={settings.customColors}
          onChange={(event) => update({ customColors: event.target.checked })}
        />
      </label>
      <div className="color-controls">
        <label>
          {t("shellColor")}
          <input
            type="color"
            value={settings.shellColor}
            onChange={(event) =>
              update({ shellColor: event.target.value, customColors: true })
            }
          />
        </label>
        <label>
          {t("accentColor")}
          <input
            type="color"
            value={settings.accentColor}
            onChange={(event) =>
              update({ accentColor: event.target.value, customColors: true })
            }
          />
        </label>
      </div>
      <p className="hint">{t("colorHint")}</p>
      <button
        className="button"
        type="button"
        onClick={() =>
          update({
            customColors: false,
            shellColor: "#244b68",
            accentColor: "#a2d3cc",
          })
        }
      >
        {t("resetColors")}
      </button>
    </div>
  );
}
