import { useId, useState } from "react";

/** Original vector scenery. No remote assets, network requests or animation loops. */
export type SceneKind =
  | "london"
  | "tokyo"
  | "new-york"
  | "paris"
  | "cyber"
  | "space"
  | "forest"
  | "mountain"
  | "ocean"
  | "sakura"
  | "minimal-dark"
  | "minimal-light";

const aliases: Record<string, SceneKind> = {
  london: "london",
  midnight: "space",
  fog: "mountain",
  amber: "paris",
  graphite: "minimal-dark",
  contrast: "minimal-light",
  tokyo: "tokyo",
  newYork: "new-york",
  newyork: "new-york",
  "new-york": "new-york",
  paris: "paris",
  cyber: "cyber",
  space: "space",
  forest: "forest",
  mountain: "mountain",
  ocean: "ocean",
  sakura: "sakura",
  minimalDark: "minimal-dark",
  minimalLight: "minimal-light",
  "minimal-dark": "minimal-dark",
  "minimal-light": "minimal-light",
};

export function sceneForTheme(theme: string): SceneKind {
  return aliases[theme] || "london";
}

type Palette = {
  sky: string;
  horizon: string;
  foreground: string;
  building: string;
  glow: string;
  light: string;
};

const palette: Record<Exclude<SceneKind, "london">, Palette> = {
  tokyo: {
    sky: "#090f2a",
    horizon: "#40305d",
    foreground: "#08111e",
    building: "#11162d",
    glow: "#e047c3",
    light: "#69edff",
  },
  "new-york": {
    sky: "#071a34",
    horizon: "#355675",
    foreground: "#07111a",
    building: "#172c42",
    glow: "#e7b36f",
    light: "#c7e1ed",
  },
  paris: {
    sky: "#19253d",
    horizon: "#796078",
    foreground: "#131c2b",
    building: "#283449",
    glow: "#f9c78a",
    light: "#ffe2a3",
  },
  cyber: {
    sky: "#050b1c",
    horizon: "#183d57",
    foreground: "#030d19",
    building: "#0a2634",
    glow: "#00e6e0",
    light: "#fa5bbc",
  },
  space: {
    sky: "#030615",
    horizon: "#1d2248",
    foreground: "#080a1f",
    building: "#101530",
    glow: "#9abafa",
    light: "#e4e9ff",
  },
  forest: {
    sky: "#071b20",
    horizon: "#385953",
    foreground: "#061417",
    building: "#102b2a",
    glow: "#adc8a6",
    light: "#d4e3cf",
  },
  mountain: {
    sky: "#192838",
    horizon: "#8aa1a8",
    foreground: "#14222c",
    building: "#314855",
    glow: "#c4d3d3",
    light: "#dce9e9",
  },
  ocean: {
    sky: "#08132a",
    horizon: "#446587",
    foreground: "#061b2b",
    building: "#173d54",
    glow: "#b9d1f1",
    light: "#e3ebfb",
  },
  sakura: {
    sky: "#28304c",
    horizon: "#a37693",
    foreground: "#292539",
    building: "#44344e",
    glow: "#ffc2d6",
    light: "#ffe0e5",
  },
  "minimal-dark": {
    sky: "#111b26",
    horizon: "#1f3340",
    foreground: "#111b26",
    building: "#1a2835",
    glow: "#7491a2",
    light: "#a4bac4",
  },
  "minimal-light": {
    sky: "#dae4e9",
    horizon: "#b7cdd4",
    foreground: "#a7bdc5",
    building: "#b4c7cd",
    glow: "#9fbcc4",
    light: "#eef7fa",
  },
};

const skyline = Array.from({ length: 31 }, (_, index) => ({
  x: index * 59 - 42,
  width: 35 + ((index * 17) % 33),
  top: 315 + ((index * 47) % 165),
}));

function City({ kind, p }: { kind: SceneKind; p: Palette }) {
  return (
    <>
      <path d="M0 580 800 440 1600 580V900H0Z" fill={p.foreground} />
      <g fill={p.building}>
        {skyline.map(({ x, width, top }, i) => (
          <g key={i}>
            <rect x={x} y={top} width={width} height={625 - top} />
            {i % 3 === 0 && (
              <path d={`M${x + width / 2 - 2} ${top}v-42h4v42`} />
            )}
          </g>
        ))}
      </g>
      <g fill={p.light} opacity=".55">
        {skyline.flatMap(({ x, top }, index) =>
          Array.from({ length: 4 }, (_, row) => (
            <rect
              key={`${index}-${row}`}
              x={x + 8 + ((index + row) % 2) * 15}
              y={top + 17 + row * 28}
              width="4"
              height="8"
              opacity={(index + row) % 4 === 0 ? 0.12 : 0.7}
            />
          )),
        )}
      </g>
      {kind === "tokyo" && (
        <g data-landmark="tokyo-tower">
          <path
            d="m1260 580 64-350 64 350m-110-76h92m-78-80h64m-50-76h36M1324 230v-85"
            fill="none"
            stroke="#ef8979"
            strokeWidth="8"
            strokeLinejoin="round"
          />
          <path
            d="m1280 504 75-80m-63 0 76 80m-64-156 40 76m-40 0 40-76"
            fill="none"
            stroke="#f7cbb7"
            strokeWidth="3"
            opacity=".8"
          />
          <path d="M1301 307h46v19h-46ZM1286 414h76v18h-76Z" fill="#f2b8ad" />
          <circle cx="1324" cy="145" r="4" fill={p.light} />
          <path
            d="M1020 463h205l-25 14h-155Z M1045 477h158v146h-158Z M1070 420h105l-20 43h-65Z"
            fill="#09131c"
          />
          <path
            d="M1041 508h163 M1032 560h180"
            stroke={p.glow}
            strokeWidth="5"
          />
          <path
            d="M1090 510v50m45-50v50m43-50v50"
            stroke={p.light}
            strokeWidth="4"
          />
          <rect
            x="280"
            y="385"
            width="24"
            height="174"
            rx="3"
            fill={p.glow}
            opacity=".7"
          />
          <rect
            x="343"
            y="421"
            width="19"
            height="129"
            rx="3"
            fill={p.light}
            opacity=".7"
          />
          <g stroke="#fff0fc" strokeWidth="3" opacity=".85">
            <path d="M285 403h14m-7-7v25m-7 14h14m-14 9h14m-7-16v29m-7 18h14m-7-7v26" />
            <path d="M348 437h9m-5-6v23m-4 13h9m-9 9h9m-5-16v29" />
          </g>
          <path d="M85 474h118v53H85Z" fill="#205f83" />
          <path
            d="M93 485h102m-102 15h65m-65 15h91"
            stroke={p.light}
            strokeWidth="4"
          />
          <path d="M1420 381h35v164h-35Z" fill="#8c3e8b" />
          <path
            d="M1428 399h19m-19 21h19m-19 21h19m-19 21h19m-19 21h19m-19 21h19"
            stroke="#ffbfdc"
            strokeWidth="5"
          />
        </g>
      )}
      {kind === "new-york" && (
        <g data-landmark="manhattan-skyline">
          <path
            d="M1010 580V300h19v-43h17v-35h20v-50h8v50h20v35h17v43h19v280Z"
            fill="#263f58"
          />
          <path
            d="M1046 230h48m-65 42h82m-101 38h120M1034 327v205m22-205v205m28-205v205m22-205v205"
            stroke={p.glow}
            strokeWidth="3"
            opacity=".8"
          />
          <path
            d="M1230 580V347h12v-32h12v-25l24-44 24 44v25h12v32h12v233Z"
            fill="#2d465c"
          />
          <path
            d="m1254 307 24-31 24 31m-48 14 24-23 24 23m-48 13 24-15 24 15M1278 246v-61"
            fill="none"
            stroke={p.light}
            strokeWidth="3"
          />
          <path d="M497 580 512 286h30l15 294Z" fill="#29445c" />
          <path
            d="M527 286V173m-11 140h22m-24 21h26m-27 23h29"
            stroke={p.light}
            strokeWidth="3"
            opacity=".7"
          />
          <g data-landmark="brooklyn-bridge" fill="none">
            <path
              d="M-80 681 760 630M136 695V470h66v221m370-24V445h66v218"
              stroke="#42566c"
              strokeWidth="19"
            />
            <path
              d="M-80 610Q40 610 169 470Q365 760 605 445Q680 550 810 555M-80 669 760 619"
              stroke="#d0dfe8"
              strokeWidth="3"
            />
            <path
              d="M243 559v91m64-42v38m64-20v16m64-31v28m64-69v66m64-142v138M30 585v78m64-104v100m575-143v109m64-83v79"
              stroke="#93a9ba"
              strokeWidth="2"
            />
          </g>
          <g fill="#d5e2e8" opacity=".75">
            {skyline.map(({ x, width, top }, i) => (
              <rect key={i} x={x} y={top - 2} width={width} height="4" rx="2" />
            ))}
          </g>
        </g>
      )}
      {kind === "paris" && (
        <>
          <path
            d="m1120 600 68-380 64 380h-132Zm18-65h96m-90-95h86m-73-80h57M1188 220v-55"
            fill="none"
            stroke="#1f293a"
            strokeWidth="17"
            strokeLinejoin="round"
          />
          <path
            d="m1151 528 74-90m-71 0 67 90"
            fill="none"
            stroke={p.glow}
            strokeWidth="3"
            opacity=".6"
          />
          <path
            d="M300 670v-151m0-20v-32m-25 32h50m-45-22 20-27 20 27"
            fill="none"
            stroke="#18242f"
            strokeWidth="12"
          />
          <circle cx="300" cy="508" r="20" fill={p.glow} opacity=".55" />
        </>
      )}
      {kind === "cyber" && (
        <>
          <path
            d="M600 360h105v240H600Zm24-51h56v51h-56Zm195-30h45v300h-45Z"
            fill="#092132"
          />
          <path
            d="M605 390h94m-94 29h94m-94 29h94m-94 29h94M840 280v290"
            stroke={p.glow}
            strokeWidth="3"
            opacity=".8"
          />
          <circle
            cx="651"
            cy="415"
            r="32"
            fill="none"
            stroke={p.light}
            strokeWidth="5"
            opacity=".65"
          />
        </>
      )}
      <path
        d="M0 607 800 484 1600 607"
        fill="none"
        stroke={p.glow}
        strokeWidth="3"
        opacity=".24"
      />
      <path
        d="M0 900 640 566 960 566 1600 900"
        fill={p.foreground}
        opacity={kind === "new-york" ? ".35" : ".8"}
      />
      <path
        d="M640 566 72 900m888-334 568 334"
        stroke={p.glow}
        strokeWidth="3"
        opacity=".32"
      />
      <g stroke={p.light} opacity=".18">
        {Array.from({ length: 13 }, (_, i) => (
          <path
            key={i}
            d={`M${i * 150} ${665 + ((i * 37) % 230)}h${60 + (i % 4) * 35}`}
          />
        ))}
      </g>
      {kind === "tokyo" && (
        <g data-landmark="shibuya-crossing" fill="#b5ccdf" opacity=".3">
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${310 + i * 137} 820h55l-90-80h-42Z`} />
          ))}
          <path d="m95 900 425-181 16 8L142 900Zm140 0 336-160 17 8-305 152Zm110 0 280-137 19 9-249 128Z" />
        </g>
      )}
      {kind === "new-york" && (
        <g data-weather="snow" fill="#e5f0f6">
          <path
            d="M0 846Q150 805 332 851T667 861L595 900H0ZM1167 900l-103-48q196-47 536-30v78Z"
            opacity=".24"
          />
          {Array.from({ length: 150 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 359 + 43) % 1600}
              cy={(i * 211 + 17) % 900}
              r={i % 7 === 0 ? 3 : i % 3 === 0 ? 1.8 : 1}
              opacity={i % 7 === 0 ? 0.8 : 0.38}
            />
          ))}
        </g>
      )}
    </>
  );
}

function Nature({ kind, p, id }: { kind: SceneKind; p: Palette; id: string }) {
  if (kind === "space")
    return (
      <>
        <circle cx="1100" cy="278" r="130" fill={`url(#${id}-orb)`} />
        <ellipse
          cx="1100"
          cy="285"
          rx="195"
          ry="45"
          fill="none"
          stroke={p.light}
          strokeWidth="13"
          opacity=".34"
          transform="rotate(-18 1100 285)"
        />
        <path d="M0 680Q350 515 740 710T1600 690V900H0Z" fill={p.foreground} />
        <path
          d="M0 770Q400 640 800 770T1600 740"
          fill="none"
          stroke={p.glow}
          strokeWidth="6"
          opacity=".3"
        />
        {Array.from({ length: 105 }, (_, i) => (
          <circle
            key={i}
            cx={(i * 379) % 1600}
            cy={(i * 223) % 570}
            r={i % 9 === 0 ? 2 : 0.8}
            fill={p.light}
            opacity={i % 5 === 0 ? 0.9 : 0.45}
          />
        ))}
      </>
    );
  if (kind === "ocean")
    return (
      <>
        <circle cx="1050" cy="262" r="75" fill={p.light} opacity=".7" />
        <path d="M0 550Q500 538 1000 550T1600 550V900H0Z" fill={p.foreground} />
        {Array.from({ length: 18 }, (_, i) => (
          <path
            key={i}
            d={`M${(i * 281) % 1500} ${580 + ((i * 91) % 285)}q70-10 160 0`}
            fill="none"
            stroke={p.light}
            strokeWidth={i % 4 === 0 ? 3 : 1.5}
            opacity={0.16 + (i % 4) * 0.07}
          />
        ))}
        <path
          d="M1020 550 850 900h400l-170-350"
          fill={`url(#${id}-reflection)`}
          opacity=".32"
        />
      </>
    );
  if (kind === "forest" || kind === "sakura")
    return (
      <>
        <path
          d="M0 675Q390 420 780 650T1600 590V900H0Z"
          fill={p.building}
          opacity=".7"
        />
        <path d="M0 754Q380 590 850 724T1600 635V900H0Z" fill={p.foreground} />
        {Array.from({ length: 26 }, (_, i) => {
          const x = i * 67 - 30;
          const y = 625 + ((i * 37) % 180);
          return kind === "forest" ? (
            <g key={i} fill={p.foreground}>
              <path d={`M${x} ${y - 142}l-38 105h76Zm0 46-44 112h88Z`} />
              <rect x={x - 5} y={y - 30} width="10" height="70" />
            </g>
          ) : (
            <g key={i}>
              <path
                d={`M${x} ${y + 30}v-160m0 37-47-37m47 54 46-48`}
                stroke={p.foreground}
                strokeWidth="11"
                fill="none"
              />
              <circle cx={x} cy={y - 139} r="31" fill={p.glow} opacity=".48" />
              <circle
                cx={x - 39}
                cy={y - 128}
                r="25"
                fill={p.glow}
                opacity=".37"
              />
              <circle
                cx={x + 38}
                cy={y - 112}
                r="26"
                fill={p.glow}
                opacity=".35"
              />
            </g>
          );
        })}
        {kind === "sakura" && (
          <path
            d="M735 630h130v125H735Zm-26-16 91-48 92 48Z"
            fill={p.building}
            stroke={p.light}
            strokeWidth="3"
          />
        )}
      </>
    );
  return (
    <>
      <path
        d="M0 635 320 235 610 602 925 160 1300 630 1480 355 1600 510V900H0Z"
        fill={p.building}
      />
      <path
        d="M0 655 320 235l92 129-105-43-55 82Zm690-171 235-324 147 235-105-64-66 75Z"
        fill={p.light}
        opacity=".35"
      />
      <path d="M0 780Q470 605 920 760T1600 675V900H0Z" fill={p.foreground} />
      <path
        d="M0 790Q500 735 900 790T1600 770"
        stroke={p.glow}
        strokeWidth="25"
        opacity=".12"
        fill="none"
      />
    </>
  );
}

const realisticScenes: Partial<Record<SceneKind, string>> = {
  london: "/london-rain.png",
  "new-york": "/scenes/new-york-snow-v1.png",
  tokyo: "/scenes/tokyo-rain-v1.png",
  paris: "/scenes/paris-evening-v1.png",
  forest: "/scenes/forest-rain-v1.png",
  mountain: "/scenes/mountain-fog-v1.png",
  ocean: "/scenes/ocean-night-v1.png",
  sakura: "/scenes/sakura-v1.png",
  cyber: "/scenes/cyber-city-v1.png",
  space: "/scenes/deep-space-v1.png",
  "minimal-dark": "/scenes/minimal-dark-v1.png",
  "minimal-light": "/scenes/minimal-light-v1.png",
};

function RealisticScene({
  kind,
  source,
  preview,
}: {
  kind: SceneKind;
  source: string;
  preview: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ThemeScene theme={kind} artwork="vector" />;
  return (
    <div
      className="scene scene-realistic"
      data-scene={kind}
      data-artwork="realistic"
      aria-hidden="true"
    >
      <img
        src={source}
        alt=""
        decoding="async"
        loading={preview ? "lazy" : "eager"}
        fetchPriority={preview ? "low" : "high"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function ThemeScene({
  theme,
  artwork = "vector",
  preview = false,
}: {
  theme: string;
  artwork?: "realistic" | "vector";
  preview?: boolean;
}) {
  const id = useId();
  const kind = sceneForTheme(theme);
  const source = realisticScenes[kind];
  if (artwork === "realistic" && source)
    return (
      <RealisticScene
        key={kind}
        kind={kind}
        source={source}
        preview={preview}
      />
    );
  if (kind === "london")
    return <div className="scene" data-scene={kind} aria-hidden="true" />;
  const p = palette[kind];
  if (kind.startsWith("minimal"))
    return (
      <div
        className={`scene scene-${kind}`}
        data-scene={kind}
        aria-hidden="true"
      >
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`${id}-minimal-grad`} x2="1" y2="1">
              <stop stopColor={p.sky} />
              <stop offset="1" stopColor={p.horizon} />
            </linearGradient>
          </defs>
          <rect width="1600" height="900" fill={`url(#${id}-minimal-grad)`} />
          <path
            d="M0 720Q650 465 1600 590V900H0Z"
            fill={p.foreground}
            opacity=".34"
          />
        </svg>
      </div>
    );
  const urban = ["tokyo", "new-york", "paris", "cyber"].includes(kind);
  return (
    <div className={`scene scene-${kind}`} data-scene={kind} aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-sky`} x2="0" y2="1">
            <stop stopColor={p.sky} />
            <stop offset="1" stopColor={p.horizon} />
          </linearGradient>
          <radialGradient id={`${id}-orb`}>
            <stop stopColor={p.light} />
            <stop offset=".55" stopColor={p.glow} />
            <stop offset="1" stopColor={p.sky} />
          </radialGradient>
          <linearGradient id={`${id}-reflection`} x2="0" y2="1">
            <stop stopColor={p.light} />
            <stop offset="1" stopColor={p.foreground} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-ambient`}>
            <stop stopColor={p.glow} stopOpacity=".38" />
            <stop offset="1" stopColor={p.glow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill={`url(#${id}-sky)`} />
        <ellipse
          cx={urban ? 1040 : 1130}
          cy={urban ? 355 : 480}
          rx="650"
          ry="420"
          fill={`url(#${id}-ambient)`}
        />
        {urban ? (
          <City kind={kind} p={p} />
        ) : (
          <Nature kind={kind} p={p} id={id} />
        )}
      </svg>
    </div>
  );
}
