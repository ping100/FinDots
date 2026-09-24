/**
 * Знак ToDots — тот же самый знак, что и у Findots: три кружка, доход/
 * кошелёк/расход там, вход/точка/выполнено здесь. Цвета и анимации не
 * меняются между приложениями — это общая подпись экосистемы, а не
 * повторно изобретённый логотип.
 */
const DOTS = [
  { cx: 50, cy: 29.3, color: "#22c55e", dx: 0, dy: 22, delay: 0, wait: 0 },
  { cx: 31.8, cy: 62.5, color: "#60a5fa", dx: 18.2, dy: -11.1, delay: 90, wait: 210 },
  { cx: 68.2, cy: 62.5, color: "#f97316", dx: -18.2, dy: -11.1, delay: 180, wait: 420 },
];

export function Logo({
  size = 72,
  animated = false,
  breathing = false,
}: {
  size?: number;
  animated?: boolean;
  breathing?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="17.5 13.4 65 65" role="img" aria-label="ToDots">
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
