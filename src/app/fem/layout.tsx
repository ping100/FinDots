import { FemProvider } from "@/components/fem/DataProvider";
import { FemShell } from "@/components/fem/Shell";

/** FemDots — календарь цикла. Свои данные, своя панель, общий вход. */
export default function FemLayout({ children }: { children: React.ReactNode }) {
  return (
    <FemProvider>
      <FemShell>{children}</FemShell>
    </FemProvider>
  );
}
