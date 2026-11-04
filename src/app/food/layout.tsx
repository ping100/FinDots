import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FoodProvider } from "@/components/food/DataProvider";
import { FoodShell } from "@/components/food/Shell";

/**
 * Yumdots — учёт калорий. Свои данные, своя панель, общий вход.
 * Доступ админ может закрыть отдельно — проверяем до провайдера.
 */
export default async function FoodLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("access_food").eq("id", user.id).single();
    if (profile && profile.access_food === false) redirect("/?denied=food");
  }

  return (
    <FoodProvider>
      <FoodShell>{children}</FoodShell>
    </FoodProvider>
  );
}
