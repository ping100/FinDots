import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import { LOOK_SCRIPT } from "@/lib/look";
import "./globals.css";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-onest",
});

const TITLE = "ToDots — задачи и напоминания";
const DESCRIPTION = "Задачи по дням: лента дат и список на сегодня";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  // iOS до 16.4 значок из манифеста не берёт — ему нужен именно этот тег.
  icons: { apple: "/icons/icon-180.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ToDots" },
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
        {/* До первой отрисовки: ставим запомненную тему, иначе человек с
            тёмной темой ловит вспышку белого экрана, пока из базы едет
            профиль. Отсюда и dangerouslySetInnerHTML — другого способа
            выполнить код раньше React не существует. */}
        <script dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
