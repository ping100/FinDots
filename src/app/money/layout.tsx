import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DataProvider } from "@/components/DataProvider";
import { Shell } from "@/components/Shell";

/**
 * Доступ сюда админ может закрыть отдельно от «Задач» — проверяем перед
 * тем, как отдать провайдер: без этого заблокированный всё равно увидел бы
 * данные на миг, пока фронтенд сам решает, что делать.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("access_money")
      .eq("id", user.id)
      .single();
    if (profile && !profile.access_money) redirect("/?denied=money");
  }

  return (
    <DataProvider>
      <Shell>{children}</Shell>
    </DataProvider>
  );
}
