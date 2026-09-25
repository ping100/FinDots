import { notFound } from "next/navigation";
import { ViewScreen } from "@/components/admin/ViewScreen";
import { VIEWS, isView } from "@/lib/admin";

/**
 * Списки заранее известны, поэтому страницы собираются при сборке: переход
 * с плитки открывает готовую страницу, а не ждёт сервер.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(VIEWS).map((view) => ({ view }));
}

export default async function AdminViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!isView(view)) notFound();
  return <ViewScreen initial={view} />;
}
