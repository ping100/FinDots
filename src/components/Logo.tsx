/**
 * Знак Findots — те же три кружка, что на иконке приложения и на главном
 * экране: доход, кошелёк, расход. Цвета зашиты, а не берутся из темы:
 * логотип должен оставаться одним и тем же и в светлой, и в тёмной.
 *
 * При появлении кружки разъезжаются из центра по своим местам — ровно тот
 * жест, на котором держится всё приложение. Один раз, без повтора.
 *
 * Во время ожидания те же кружки дышат по очереди: задержки для обоих
 * движений общие, поэтому волна идёт в том же порядке — доход, кошелёк,
 * расход.
 */
// delay — для сборки знака, wait — для дыхания. Разные, потому что и
// длительности разные: на сборке в полсекунды 90 мс уже видны, а на цикле
// дыхания в 1,3 с тот же сдвиг незаметен и кружки гаснут разом.
const DOTS = [
  { cx: 50, cy: 29.3, color: "#22c55e", dx: 0, dy: 22, delay: 0, wait: 0 },
  { cx: 31.8, cy: 62.5, color: "#60a5fa", dx: 18.2, dy: -11.1, delay: 90, wait: 210 },
  { cx: 68.2, cy: 62.5, color: "#f97316", dx: -18.2, dy: -11.1, delay: 180, wait: 420 },
];

export function Logo({
  size = 72,
  animated = false,
  /** Ожидание: кружки дышат по очереди, пока приложение не готово. */
  breathing = false,
}: {
  size?: number;
  animated?: boolean;
  breathing?: boolean;
}) {
  return (
    // viewBox обрезан по самим кружкам, иначе знак тонет в пустых полях
    <svg width={size} height={size} viewBox="17.5 13.4 65 65" role="img" aria-label="Findots">
      {DOTS.map((dot) => (
        <circle
          key={dot.color}
          cx={dot.cx}
          cy={dot.cy}
          r={14.3}
          fill={dot.color}
          className={animated ? "animate-dot" : breathing ? "animate-breathe" : undefined}
          style={
            animated || breathing
              ? ({
                  // transform-box: fill-box — чтобы scale считался от центра
                  // самого кружка, а не от угла холста
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  animationDelay: `${animated ? dot.delay : dot.wait}ms`,
                  "--dx": `${dot.dx}px`,
                  "--dy": `${dot.dy}px`,
                } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </svg>
  );
}
