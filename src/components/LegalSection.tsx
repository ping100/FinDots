/** Раздел юридической страницы: заголовок и текст со списками. */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[1rem] font-semibold">{title}</h2>
      <div className="selectable space-y-2 text-[0.875rem] leading-relaxed [&_li]:relative [&_li]:pl-4 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:content-['•'] [&_li]:before:text-[var(--muted)] [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
