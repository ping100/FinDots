import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DataProvider } from "@/components/tasks/DataProvider";
import { Shell } from "@/components/tasks/Shell";

/**
 * Раздел задач. Свои данные и своя нижняя панель — денежные кошельки и
 * курсы валют задачам ни к чему, а грузить их ради списка дел значило бы
 * заставлять человека ждать чужое.
 *
 * Доступ сюда админ может закрыть отдельно от «Денег» — проверяем перед
 * тем, как отдать провайдер: без этого заблокированный всё равно увидел бы
 * данные на миг, пока фронтенд сам решает, что делать.
 */
export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("access_tasks")
      .eq("id", user.id)
      .single();
    if (profile && !profile.access_tasks) redirect("/?denied=tasks");
  }

  return (
    <DataProvider>
      <Shell>{children}</Shell>
    </DataProvider>
  );
}
