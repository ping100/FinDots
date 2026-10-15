"use client";

import { Chat } from "@/components/fem/Together";
import { PartnerShare } from "@/components/fem/PartnerShare";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";

/**
 * «Вместе»: переписка с партнёром — сообщения, просьбы, его ответы,
 * приглашения; сверху статус дня. Партнёр не подключён — тут же и
 * подключить.
 */
export default function FemTogether() {
  const { share } = useFem();
  const name = share?.partner_name ?? null;
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title={name ? `Вы и ${name}` : "Вместе"} sub="FemDots" />
      {name ? (
        <Chat who="her" name={name} bottom="calc(env(safe-area-inset-bottom) + 92px)" />
      ) : (
        <PartnerShare />
      )}
    </div>
  );
}
