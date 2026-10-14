"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/errorLog";

/** Ловит ошибки вне React — в обработчиках, таймерах, обещаниях — и пишет их в журнал. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => logClientError(e.message || e.error?.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; stack?: string } | string | undefined;
      if (typeof reason === "string") logClientError(reason);
      else logClientError(reason?.message, reason?.stack);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
