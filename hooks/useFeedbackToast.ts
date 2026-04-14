import { useCallback, useEffect, useState } from "react";

import type { FloatingToastTone } from "../components/FloatingToast";

type ToastState = {
  message: string;
  tone: FloatingToastTone;
  bottom?: number;
};

type UseFeedbackToastOptions = {
  duration?: number;
  bottom?: number;
};

export function useFeedbackToast(options: UseFeedbackToastOptions = {}) {
  const { duration = 2200, bottom = 28 } = options;
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast?.message) return;
    const timeout = setTimeout(() => setToast(null), duration);
    return () => clearTimeout(timeout);
  }, [duration, toast]);

  const showToast = useCallback((message: string, tone: FloatingToastTone = "success", overrideBottom?: number) => {
    setToast({ message, tone, bottom: overrideBottom });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  return {
    showToast,
    hideToast,
    toastProps: {
      visible: !!toast?.message,
      message: toast?.message ?? "",
      tone: toast?.tone ?? "success",
      bottom: toast?.bottom ?? bottom,
    },
  };
}
