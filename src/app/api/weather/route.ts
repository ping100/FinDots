import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Погода там, где человек сейчас, — для цветка в FemDots.
 *
 * Где он, знает Vercel по адресу в интернете (с точностью до города), без
 * запроса разрешений. Координаты округляем до ~10 км, отдаём только саму
 * погоду и нигде их не храним. Источник — Open-Meteo (бесплатно, без ключа).
 */
export async function GET(request: NextRequest) {
  const lat = Number(request.headers.get("x-vercel-ip-latitude"));
  const lon = Number(request.headers.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return NextResponse.json({ error: "Не удалось понять, где вы" }, { status: 404 });
  }
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat.toFixed(1)}&longitude=${lon.toFixed(1)}` +
    "&current=temperature_2m,weather_code,wind_speed_10m,is_day";
  const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const data = res?.ok ? ((await res.json().catch(() => null)) as { current?: Record<string, number> } | null) : null;
  const cur = data?.current;
  if (!cur || typeof cur.weather_code !== "number") {
    return NextResponse.json({ error: "Погода сейчас недоступна" }, { status: 502 });
  }
  return NextResponse.json(
    { code: cur.weather_code, temp: Math.round(cur.temperature_2m), wind: Math.round(cur.wind_speed_10m), day: cur.is_day === 1 },
    { headers: { "Cache-Control": "private, max-age=900" } },
  );
}
