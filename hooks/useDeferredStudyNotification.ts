import { useEffect, useRef } from "react";

/** Never replace an active session, answer review, or completion screen with a push tap. */
export function useDeferredStudyNotification({ notificationId, initialTab, busy, onOpen, onDeferred }: {
  notificationId?: string;
  initialTab?: "tests";
  busy: boolean;
  onOpen: (tab: "home" | "tests") => void;
  onDeferred: () => void;
}) {
  const handled = useRef<string | null>(null);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!notificationId || handled.current === notificationId) return;
    if (busy) {
      if (announced.current !== notificationId) {
        announced.current = notificationId;
        onDeferred();
      }
      return;
    }
    handled.current = notificationId;
    onOpen(initialTab ?? "home");
  }, [busy, initialTab, notificationId, onDeferred, onOpen]);
}
