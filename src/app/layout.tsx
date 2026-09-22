import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
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

export const metadata: Metadata = {
  title: "Findots — трекер расходов",
  description: "Учёт личных финансов: доходы, кошельки и расходы перетаскиванием",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Findots" },
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
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
