import { useEffect, useRef } from "react";
import type { Settings } from "../shared/contracts";
import { decorationBudget } from "../shared/performance";

const intensity = { off: 0, low: 64, medium: 150, high: 280, cinematic: 440 };

export function RainCanvas({
  settings,
  active,
}: {
  settings: Settings;
  active: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const hardware = navigator.hardwareConcurrency || 4;
    const requested = intensity[settings.rain];
    const snow = settings.scene === "newyork";
    const space = settings.scene === "space";
    canvas.dataset.effect = space ? "space-debris" : snow ? "snow" : "rain";
    const {
      economy,
      particles: ceiling,
      fps,
    } = decorationBudget(settings, hardware);
    const interval = 1000 / fps;
    let frame = 0,
      previous = 0,
      elapsed = 0,
      width = 1,
      height = 1,
      ratio = 1;
    let density = 1,
      slowFrames = 0;
    const drops = Array.from(
      {
        length: Math.min(
          ceiling,
          space ? Math.ceil(requested / 12) : requested,
        ),
      },
      (_, i) => {
        const layer = i % 10 < 5 ? 0 : i % 10 < 9 ? 1 : 2;
        return {
          x: Math.random(),
          y: Math.random(),
          layer,
          speed:
            (layer === 0 ? 155 : layer === 1 ? 350 : 650) *
            (0.7 + Math.random() * 0.6),
          length:
            (layer === 0 ? 8 : layer === 1 ? 20 : 39) *
            (0.65 + Math.random() * 0.7),
        };
      },
    );
    const beads = Array.from(
      { length: settings.rain === "cinematic" ? 7 : 3 },
      (_, i) => ({
        x: (i * 0.173 + 0.116) % 1,
        y: Math.random(),
        speed: 0.012 + Math.random() * 0.018,
        radius: 1.8 + Math.random() * 2.1,
        phase: Math.random() * Math.PI * 2,
      }),
    );
    const reason = () => {
      if (!settings.graphicsEnabled) return "disabled";
      if (!requested) return "off";
      if (
        settings.motionPreference === "reduced" ||
        (settings.motionPreference !== "full" && media.matches)
      )
        return "reduced-motion";
      if (!active) return "background";
      if (document.hidden) return "hidden";
      return "none";
    };
    const clear = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const resize = () => {
      width = Math.max(1, canvas.clientWidth);
      height = Math.max(1, canvas.clientHeight);
      // Keep the backing store sharp at fractional DPI without unbounded 4K/8K GPU work.
      ratio = Math.min(
        devicePixelRatio || 1,
        economy ? 1 : 1.5,
        Math.sqrt((economy ? 1_500_000 : 4_500_000) / (width * height)),
      );
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      const paused = reason();
      if (paused !== "none") {
        canvas.dataset.running = "false";
        canvas.dataset.pauseReason = paused;
        clear();
        return;
      }
      frame = requestAnimationFrame(draw);
      if (time - previous < interval) return;
      const started = performance.now();
      const delta = Math.min((time - previous) / 1000, 0.08);
      previous = time - ((time - previous) % interval);
      elapsed += delta;
      clear();
      const amount = Math.ceil(drops.length * density);
      const wind = -30 + Math.sin(elapsed * 0.17) * 9;
      for (let i = 0; i < amount; i++) {
        const p = drops[i];
        p.y += (p.speed * (space ? 0.008 : snow ? 0.13 : 1) * delta) / height;
        p.x +=
          ((space
            ? 7 + p.layer * 4
            : snow
              ? Math.sin(elapsed * 0.4 + i) * 16
              : wind) *
            (0.5 + p.layer * 0.35) *
            delta) /
          width;
        if (p.y > 1.08 || p.x < -0.05 || p.x > 1.08) {
          p.y = -0.08;
          p.x = space ? Math.random() : Math.random() * 1.05;
        }
      }
      // Three depth planes, each batched into one path. Front streaks have a
      // soft wide halo and a fine glint; no CSS filter is applied to UI text.
      for (let layer = 0; layer < 3; layer++) {
        context.beginPath();
        for (let i = 0; i < amount; i++) {
          const p = drops[i];
          if (p.layer !== layer) continue;
          const x = p.x * width,
            y = p.y * height;
          if (space) {
            const radius = 1.3 + p.layer * 1.5;
            const rotation = elapsed * (0.05 + (i % 3) * 0.025) + i * 2.399;
            for (let side = 0; side < 6; side++) {
              const angle = rotation + (side * Math.PI) / 3;
              const edge = radius * (0.65 + ((side * 7 + i) % 5) * 0.09);
              const px = x + Math.cos(angle) * edge;
              const py = y + Math.sin(angle) * edge;
              if (side === 0) context.moveTo(px, py);
              else context.lineTo(px, py);
            }
            context.closePath();
          } else if (snow) {
            const radius = 0.8 + p.layer * 0.7;
            context.moveTo(x + radius, y);
            context.arc(x, y, radius, 0, Math.PI * 2);
          } else {
            context.moveTo(x, y);
            context.lineTo(x - p.length * 0.16, y + p.length);
          }
        }
        if (snow || space) {
          context.fillStyle = space
            ? `rgba(165,175,186,${0.32 + layer * 0.13})`
            : `rgba(231,244,255,${0.35 + layer * 0.18})`;
          context.fill();
          continue;
        }
        context.lineCap = "round";
        if (layer === 2 && !economy) {
          context.lineWidth = 3.4;
          context.strokeStyle = "rgba(175,211,231,0.055)";
          context.stroke();
        }
        context.lineWidth = layer === 0 ? 0.7 : layer === 1 ? 1 : 1.35;
        context.strokeStyle =
          layer === 0
            ? "rgba(191,216,230,0.19)"
            : layer === 1
              ? "rgba(205,229,241,0.31)"
              : "rgba(224,239,247,0.43)";
        context.stroke();
      }
      const cinematic =
        !snow &&
        !space &&
        settings.cinematic &&
        settings.rain === "cinematic" &&
        !economy;
      if (cinematic) {
        // Slow low-contrast mist and a warm lamplight reflection are confined
        // to the scenery. No flashing or high-frequency brightness modulation.
        if (settings.glow) {
          const lamp = context.createRadialGradient(
            width * 0.76,
            height * 0.66,
            0,
            width * 0.76,
            height * 0.66,
            width * 0.16,
          );
          lamp.addColorStop(
            0,
            `rgba(242,184,108,${0.024 + Math.sin(elapsed * 0.38) * 0.007})`,
          );
          lamp.addColorStop(1, "rgba(242,184,108,0)");
          context.fillStyle = lamp;
          context.fillRect(
            width * 0.56,
            height * 0.4,
            width * 0.4,
            height * 0.5,
          );
        }
        const fogX = width * (0.66 + Math.sin(elapsed * 0.055) * 0.08);
        const fog = context.createRadialGradient(
          fogX,
          height * 0.69,
          0,
          fogX,
          height * 0.69,
          width * 0.31,
        );
        fog.addColorStop(0, "rgba(164,190,208,0.035)");
        fog.addColorStop(1, "rgba(164,190,208,0)");
        context.fillStyle = fog;
        context.fillRect(
          width * 0.23,
          height * 0.35,
          width * 0.77,
          height * 0.65,
        );
        for (let i = 0; i < 5; i++) {
          const age = (elapsed * 0.7 + i * 0.21) % 1;
          context.strokeStyle = `rgba(195,220,230,${(1 - age) * 0.13})`;
          context.lineWidth = 0.8;
          context.beginPath();
          context.ellipse(
            width * (0.37 + i * 0.117),
            height * (0.84 + (i % 2) * 0.08),
            2 + age * 18,
            0.7 + age * 3.2,
            0,
            0,
            Math.PI * 2,
          );
          context.stroke();
        }
      }
      if (
        !snow &&
        !space &&
        !economy &&
        settings.cinematic &&
        (settings.rain === "high" || cinematic)
      ) {
        for (const bead of beads) {
          bead.y +=
            bead.speed *
            delta *
            (0.45 + Math.max(0, Math.sin(elapsed * 0.6 + bead.phase)));
          if (bead.y > 1.1) bead.y = -0.1;
          const x = bead.x * width + Math.sin(bead.y * 14 + bead.phase) * 3;
          const y = bead.y * height;
          context.strokeStyle = "rgba(201,224,236,0.13)";
          context.lineWidth = 1.4;
          context.beginPath();
          context.moveTo(x + 1, y - 38);
          context.quadraticCurveTo(x - 3, y - 16, x, y);
          context.stroke();
          context.fillStyle = "rgba(8,21,33,0.15)";
          context.beginPath();
          context.ellipse(
            x,
            y,
            bead.radius,
            bead.radius * 1.65,
            -0.13,
            0,
            Math.PI * 2,
          );
          context.fill();
          context.strokeStyle = "rgba(226,242,249,0.32)";
          context.lineWidth = 0.8;
          context.beginPath();
          context.ellipse(
            x - 0.5,
            y,
            bead.radius * 0.72,
            bead.radius * 1.2,
            -0.13,
            Math.PI * 0.9,
            Math.PI * 1.6,
          );
          context.stroke();
        }
      }
      canvas.dataset.running = "true";
      canvas.dataset.pauseReason = "none";
      canvas.dataset.particles = String(amount);
      canvas.dataset.fpsLimit = String(fps);
      // Degrade particle work on sustained slow drawing, without disabling a
      // user-selected effect or raising the requested FPS cap.
      slowFrames =
        performance.now() - started > interval * 0.55
          ? slowFrames + 1
          : Math.max(0, slowFrames - 1);
      if (slowFrames >= 12) {
        density = Math.max(0.4, density * 0.8);
        slowFrames = 0;
      }
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      clear();
      previous = performance.now();
      canvas.dataset.running = "false";
      canvas.dataset.pauseReason = reason();
      if (reason() === "none") frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(() => {
      resize();
      restart();
    });
    observer.observe(canvas);
    resize();
    document.addEventListener("visibilitychange", restart);
    media.addEventListener("change", restart);
    restart();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      media.removeEventListener("change", restart);
      clear();
      canvas.dataset.running = "false";
    };
  }, [
    active,
    settings.rain,
    settings.fps,
    settings.powerSave,
    settings.cinematic,
    settings.glow,
    settings.motionPreference,
    settings.performanceMode,
    settings.graphicsEnabled,
    settings.scene,
  ]);
  return (
    <canvas
      ref={ref}
      className="rain-canvas"
      aria-hidden="true"
      data-testid="rain-canvas"
      data-running="false"
      data-quality={settings.rain}
      data-weather={settings.scene === "newyork" ? "snow" : "rain"}
    />
  );
}
