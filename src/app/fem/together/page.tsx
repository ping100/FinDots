"use client";

import { OwnTogether } from "@/components/fem/Together";
import { PartnerShare } from "@/components/fem/PartnerShare";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";

/**
 * «Вместе»: всё общение с партнёром — новое от него, статус дня, просьбы,
 * как они идут, «Что я люблю». Партнёр не подключён — тут же и подключить.
 */
export default function FemTogether() {
  const { share } = useFem();
  const name = share?.partner_name ?? null;
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title={name ? `Вы и ${name}` : "Вместе"} sub="FemDots" />
      {name ? (
        <OwnTogether />
      ) : (
        <PartnerShare />
      )}
    </div>
  );
}
