/** Тема админки — та же, что у Findots и Todots: светлая «Аврора», тёмная «Ночь». */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="money-theme min-h-dvh">{children}</div>;
}
