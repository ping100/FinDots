import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FemProvider } from "@/components/fem/DataProvider";
import { FemShell } from "@/components/fem/Shell";

/**
 * FemDots — календарь цикла. Свои данные, своя панель, общий вход.
 *
 * Доступ сюда админ может закрыть отдельно от остальных приложений —
 * проверяем до провайдера, как в деньгах и задачах.
 */
export default async function FemLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("access_fem").eq("id", user.id).single();
    if (profile && profile.access_fem === false) redirect("/?denied=fem");
  }

  return (
    <FemProvider>
      <FemShell>{children}</FemShell>
    </FemProvider>
  );
}
