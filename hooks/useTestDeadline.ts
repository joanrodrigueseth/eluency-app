import { useEffect, useRef } from "react";

type Announcement = 300 | 60 | 30 | 10 | 0 | null;
export function useTestDeadline(options: {
  active: boolean; deadline: number | null;
  submitted: { current: boolean }; announcement: { current: Announcement };
  onRemaining: (seconds: number) => void;
  onWarning: (message: string, haptic: boolean) => void; onExpire: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const { active, deadline } = options;
  useEffect(() => {
    if (!active || deadline == null) return;
    const update = () => {
      const { onRemaining, onWarning, onExpire, submitted, announcement } = latest.current;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      onRemaining(remaining);
      const threshold = remaining <= 10 ? 10 : remaining <= 30 ? 30 : remaining <= 60 ? 60 : remaining <= 300 ? 300 : null;
      if (remaining > 0 && threshold && announcement.current !== threshold) {
        announcement.current = threshold;
        onWarning(threshold === 300 ? "Five minutes remaining." : threshold === 60 ? "One minute remaining." : threshold + " seconds remaining.", threshold === 10 || threshold === 60);
      }
      if (remaining === 0 && !submitted.current) {
        submitted.current = true;
        announcement.current = 0;
        onExpire();
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [active, deadline]);
}
