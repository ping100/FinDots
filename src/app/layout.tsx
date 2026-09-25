import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { NoEdgeSwipe } from "@/components/NoEdgeSwipe";
import { Presence } from "@/components/Presence";
import { ReturnHome } from "@/components/ReturnHome";
import { ThemeSync } from "@/components/ThemeSync";
import { LOOK_SCRIPT } from "@/lib/look";
import "./globals.css";

/**
 * Onest: кириллица у него не доделана постфактум, а нарисована вместе с
 * латиницей, поэтому «Ж», «Д» и «щ» не выпадают из строки. Цифры
 * моноширинные по ширине — суммы в столбик не пляшут.
 *
 * next/font кладёт файлы к себе: без запроса к чужому домену в рантайме и
 * без скачка вёрстки при подмене шрифта.
 */
const onest = Onest({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-onest",
});

const TITLE = "Dots — деньги и задачи";
const DESCRIPTION = "Findots и Todots: личные финансы и список дел под одним входом";

export const metadata: Metadata = {
  // Без metadataBase относительные пути в og остаются относительными, а
  // мессенджеру нужен абсолютный адрес картинки.
  metadataBase: new URL("https://dotsapp.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Dots" },
  // Без своей картинки Telegram и прочие цепляют иконку вкладки — она в SVG,
  // рисовать его они не умеют, и в превью получается белый прямоугольник.
  openGraph: {
    type: "website",
    siteName: "Dots",
    locale: "ru_RU",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Dots" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f2f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <head>
        {/* До первой отрисовки: ставим запомненную тему и кегль, иначе
            человек с тёмной темой ловит вспышку белого экрана, пока из базы
            едет профиль. Отсюда и dangerouslySetInnerHTML — другого способа
            выполнить код раньше React не существует. */}
        <script dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} />
      </head>
      <body>
        {children}
        <RegisterSW />
        <NoEdgeSwipe />
        <Presence />
        <ReturnHome />
        <ThemeSync />
      </body>
    </html>
  );
}
