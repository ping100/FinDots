"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { Denied, Problem, useOverview } from "@/components/admin/shared";
import { AdminHeader, AlertsCard, ToolCards } from "@/components/admin/Tools";
import { SupabaseLimits, VercelBlock } from "@/components/admin/Limits";
import { buildMoment } from "@/lib/update";

/** Техника: уведомления админу, ошибки, фоновые задачи, сервисы, лимиты. */
export default function TechPage() {
  const { data, denied, problem } = useOverview();
  const [built, setBuilt] = useState<string | null>(null);
  useEffect(() => setBuilt(buildMoment()), []);

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Техника" />
      {problem ? <Problem text={problem} /> : null}
      <div className="mb-2">
        <AlertsCard />
      </div>
      <ToolCards />
      {data ? <SupabaseLimits data={data} /> : null}
      <VercelBlock built={built} />
    </div>
  );
}
