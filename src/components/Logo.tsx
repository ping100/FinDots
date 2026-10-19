import { useId } from "react";

/**
 * Знак Dots — три кружка, по одному на приложение: зелёный — Findots,
 * синий — Todots, розовый — FemDots. Цвета зашиты, а не берутся из темы:
 * логотип должен оставаться одним и тем же и в светлой, и в тёмной.
 * Кружки объёмные: перелив от светлого блика сверху слева к тени снизу
 * справа. id градиентов свои у каждого знака (useId), чтобы несколько
 * знаков на странице не мешали друг другу.
 *
 * focus — знак внутри одного приложения: его кружок цветной, остальные
 * приглушены.
 *
 * При появлении кружки разъезжаются из центра по своим местам — ровно тот
 * жест, на котором держится всё приложение. Один раз, без повтора.
 *
 * Во время ожидания те же кружки дышат по очереди: задержки для обоих
 * движений общие, поэтому волна идёт в том же порядке.
 */
// delay — для сборки знака, wait — для дыхания. Разные, потому что и
// длительности разные: на сборке в полсекунды 90 мс уже видны, а на цикле
// дыхания в 1,3 с тот же сдвиг незаметен и кружки гаснут разом.
// slow — задержки для долгой сборки на главной: там знак — главный герой
// экрана, и каждый кружок успевает прилететь сам по себе.
const DOTS = [
  { app: "money", cx: 50, cy: 29.3, hi: "#86efac", color: "#22c55e", lo: "#15803d", dx: 0, dy: 22, delay: 0, slow: 0, wait: 0 },
  { app: "tasks", cx: 31.8, cy: 62.5, hi: "#bfdbfe", color: "#60a5fa", lo: "#1d4ed8", dx: 18.2, dy: -11.1, delay: 90, slow: 170, wait: 210 },
  { app: "fem", cx: 68.2, cy: 62.5, hi: "#fbcfe8", color: "#ec4899", lo: "#be185d", dx: -18.2, dy: -11.1, delay: 180, slow: 340, wait: 420 },
] as const;

/** Приглушённый кружок чужого приложения — виден и на светлом, и на тёмном. */
const MUTED = "rgba(150, 140, 165, 0.32)";

export function Logo({
  size = 72,
  animated = false,
  /** Ожидание: кружки дышат по очереди, пока приложение не готово. */
  breathing = false,
  focus,
}: {
  size?: number;
  /** true — быстрая сборка; "long" — долгая, с поворотом всего знака. */
  animated?: boolean | "long";
  breathing?: boolean;
  /** Знак внутри приложения: его кружок цветной, остальные приглушены. */
  focus?: "money" | "tasks" | "fem";
}) {
  const uid = useId().replace(/:/g, "");
  return (
    // viewBox обрезан по самим кружкам, иначе знак тонет в пустых полях
    <svg
      width={size}
      height={size}
      viewBox="17.5 13.4 65 65"
      role="img"
      aria-label="Dots"
      className={animated === "long" ? "animate-logo-spin" : undefined}
      // Рамка обрезана вплотную по кружкам, а при сборке они перелетают
      // размером и разъезжаются — без этого края кружков срезались бы.
      style={{ overflow: "visible" }}
    >
      <defs>
        {DOTS.map((dot) => (
          <radialGradient key={dot.app} id={`${uid}-${dot.app}`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor={dot.hi} />
            <stop offset="0.55" stopColor={dot.color} />
            <stop offset="1" stopColor={dot.lo} />
          </radialGradient>
        ))}
      </defs>
      {DOTS.map((dot) => {
        const muted = !!focus && focus !== dot.app;
        return (
          <g
            key={dot.app}
            className={
              animated === "long" ? "animate-dot-long" : animated ? "animate-dot" : breathing ? "animate-breathe" : undefined
            }
            style={
              animated || breathing
                ? ({
                    // transform-box: fill-box — чтобы scale считался от центра
                    // самого кружка, а не от угла холста
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animationDelay: `${animated === "long" ? dot.slow : animated ? dot.delay : dot.wait}ms`,
                    "--dx": `${dot.dx}px`,
                    "--dy": `${dot.dy}px`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <circle cx={dot.cx} cy={dot.cy} r={14.3} fill={muted ? MUTED : `url(#${uid}-${dot.app})`} />
            {muted ? null : <circle cx={dot.cx - 4.5} cy={dot.cy - 5} r={3.6} fill="#fff" opacity={0.45} />}
          </g>
        );
      })}
    </svg>
  );
}
