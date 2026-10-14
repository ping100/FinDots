"use client";

import { SupportCard } from "@/components/admin/SupportCard";
import { ReviewsCard } from "@/components/admin/ReviewsCard";
import { AdminHeader, LinkCard } from "@/components/admin/Tools";

/** Поддержка: обращения, отзывы и всё, что людям говорим мы сами. */
export default function CarePage() {
  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Поддержка" />
      <SupportCard />
      <ReviewsCard />
      <p className="mb-2 mt-5 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
        Сказать всем
      </p>
      <LinkCard href="/admin/broadcast" icon="share" color="#8b5cf6" title="Рассылка" caption="Объявление всем — полосой и пушем" />
      <LinkCard href="/admin/notice" icon="hammer" color="#f59e0b" title="Технические работы" caption="Полоса «возможны перебои» у всех" />
      <LinkCard href="/admin/empty" icon="users" color="#94a3b8" title="Пустые аккаунты" caption="Помочь начать или убрать спам-регистрации" />
    </div>
  );
}
