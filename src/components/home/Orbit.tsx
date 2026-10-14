import Link from "next/link";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";

export interface OrbitApp {
  id: string;
  href: string;
  name: string;
  what: string;
  icon: string;
  color: string;
  /** Светлая и тёмная сторона шара — для объёма. */
  hi: string;
  lo: string;
}

/**
 * Орбита: знак Dots в центре, вокруг медленно (оборот за две минуты)
 * плывут шары приложений. Сами шары и подписи под ними не кружатся —
 * крутятся обратно с той же скоростью и всегда стоят ровно.
 *
 * compact — когда под орбитой сводка: шары меньше, орбита уже.
 */
export function Orbit({
  apps,
  compact,
  delay,
  ratings,
}: {
  apps: OrbitApp[];
  compact: boolean;
  delay: number;
  ratings: Map<string, { average: number; total: number }> | null;
}) {
  const style = {
    "--ball": compact ? "min(68px, 19vw)" : "min(90px, 24vw)",
    "--ring": compact ? "min(168px, 46vw)" : "min(214px, 58vw)",
  } as React.CSSProperties;

  return (
    // Снизу запас под подпись нижнего шара: при обороте любой может оказаться внизу.
    <div className="transition-[padding] duration-500" style={{ paddingBottom: compact ? 22 : 34 }}>
      <div className="orbit" style={style}>
        <span className="orbit-ring animate-fade" style={{ animationDelay: `${delay}ms` }} />
        <span className="orbit-center glass animate-fade" style={{ animationDelay: `${delay}ms` }}>
          <Logo size={compact ? 24 : 30} animated="long" />
        </span>
        <div className="orbit-spin">
          {apps.map((app, i) => {
            // Первый — сверху, остальные поровну по кругу.
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / apps.length;
            const rating = ratings?.get(app.id);
            return (
              <div
                key={app.id}
                className="orbit-slot"
                style={{
                  left: `calc(50% + ${Math.cos(angle).toFixed(4)} * var(--ring) / 2)`,
                  top: `calc(50% + ${Math.sin(angle).toFixed(4)} * var(--ring) / 2)`,
                }}
              >
                <div className="orbit-upright">
                  <Link
                    href={app.href}
                    aria-label={`${app.name} — ${app.what}`}
                    className="orbit-link animate-orbit-in block h-full w-full"
                    style={{ animationDelay: `${delay + 120 + i * 130}ms` }}
                  >
                    <span
                      className="orbit-ball"
                      style={{ "--c": app.color, "--hi": app.hi, "--lo": app.lo } as React.CSSProperties}
                    >
                      <Icon name={app.icon} size={compact ? 26 : 34} />
                    </span>
                    <span
                      className="absolute left-1/2 top-full mt-1.5 flex -translate-x-1/2 flex-col items-center whitespace-nowrap leading-tight"
                    >
                      <span className={`font-bold ${compact ? "text-[0.8125rem]" : "text-[0.9375rem]"}`}>{app.name}</span>
                      {rating && !compact ? (
                        <span
                          className="animate-fade flex items-center gap-0.5 text-[0.6875rem] font-semibold tabular-nums"
                          style={{ color: "var(--ink-2)" }}
                          aria-label={`Средняя оценка ${fmt(rating.average)} из 5`}
                        >
                          <span style={{ color: "#f59e0b" }}>★</span>
                          {fmt(rating.average)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
