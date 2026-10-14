import { RegisterSW } from "./RegisterSW";
import { AdminReplyBanner } from "./AdminReplyBanner";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { NoticeBanner } from "./NoticeBanner";

/**
 * Полосы внизу экрана — про обновление, ответ администратора и новости. Общий
 * контейнер, а не своя плавающая позиция у каждой: появившись одновременно,
 * они легли бы одна на другую. pointer-events выключены на пустом
 * контейнере и включены только там, где реально есть полоса, — иначе пустое
 * место над нижней панелью вкладок перестало бы отвечать на нажатия.
 */
export function BottomBanners() {
  return (
    <div className="pb-safe pointer-events-none fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md flex-col-reverse gap-2 [&>*]:pointer-events-auto">
      <RegisterSW />
      <AdminReplyBanner />
      <AnnouncementBanner />
      <NoticeBanner />
    </div>
  );
}
