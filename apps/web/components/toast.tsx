"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * One centred toast, for the things a person needs told rather than left to notice.
 *
 * It exists because wallet errors were rendered inline next to the button that caused them — a
 * rejected signature put red text into the nav bar, where it sat until the next render and
 * changed the bar's height while doing it. A rejection is a moment, not a state of the page, so
 * it belongs in something that appears, says its piece, and leaves.
 *
 * Deliberately singular. A stack invites a queue of five things nobody reads; this replaces
 * whatever was showing, because the newest message is the one that matches what the user just
 * did.
 */

export type ToastTone = "error" | "info" | "success";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  /** Milliseconds on screen. */
  duration: number;
}

interface ToastApi {
  show: (t: { tone?: ToastTone; title: string; detail?: string; duration?: number }) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Available everywhere, and a no-op where the provider is absent.
 *
 * Returning a working object rather than throwing is deliberate: a component that reports an
 * error should not itself crash because it happens to be rendered outside the provider. The
 * message is lost, which is bad; the page dying on top of the original error is worse.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    show: () => {},
    dismiss: () => {},
  };
}

const DEFAULT_DURATION = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [remaining, setRemaining] = useState(1);
  const paused = useRef(false);
  const startedAt = useRef(0);
  const elapsedBefore = useRef(0);

  const dismiss = useCallback(() => setToast(null), []);

  const show = useCallback<ToastApi["show"]>((t) => {
    elapsedBefore.current = 0;
    startedAt.current = Date.now();
    paused.current = false;
    setRemaining(1);
    setToast({
      id: Date.now(),
      tone: t.tone ?? "info",
      title: t.title,
      detail: t.detail,
      duration: t.duration ?? DEFAULT_DURATION,
    });
  }, []);

  /**
   * The countdown, driven by a timer rather than a CSS animation.
   *
   * A CSS transition would be simpler, but the bar has to pause on hover — a message that
   * expires while being read is worse than no message — and pausing a transition mid-flight
   * means reading its computed state back out. Tracking elapsed time here keeps the bar and
   * the dismissal working from one number, so they cannot disagree about when time is up.
   */
  useEffect(() => {
    if (!toast) return;

    const tick = window.setInterval(() => {
      if (paused.current) return;
      const elapsed = elapsedBefore.current + (Date.now() - startedAt.current);
      const left = Math.max(0, 1 - elapsed / toast.duration);
      setRemaining(left);
      if (left === 0) setToast(null);
    }, 50);

    return () => window.clearInterval(tick);
  }, [toast]);

  // Escape closes it, like anything else that appears over the page.
  useEffect(() => {
    if (!toast) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast, dismiss]);

  const onEnter = () => {
    if (paused.current) return;
    paused.current = true;
    elapsedBefore.current += Date.now() - startedAt.current;
  };

  const onLeave = () => {
    if (!paused.current) return;
    paused.current = false;
    startedAt.current = Date.now();
  };

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}

      {toast && (
        <div
          // Centred, and `pointer-events-none` on the full-screen layer so it never blocks the
          // page behind it — only the card itself takes events.
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center px-5"
          // `alert` for errors so a screen reader interrupts; `status` otherwise so it waits
          // for a pause. A rejected transaction is worth interrupting for.
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
        >
          <div
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onFocus={onEnter}
            onBlur={onLeave}
            className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-edge bg-surface shadow-[0_24px_64px_-16px_rgba(0,0,0,0.55)] motion-safe:animate-toast-in"
          >
            <div className="flex items-start gap-3 p-5">
              <ToneDot tone={toast.tone} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{toast.title}</p>
                {toast.detail && (
                  <p className="mt-1.5 break-words text-[13px] leading-relaxed text-ink-2">
                    {toast.detail}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                  <path
                    d="M1 1l9 9M10 1l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* The timer, so the countdown is visible rather than a surprise. */}
            <div className="h-[3px] w-full bg-rule">
              <div
                className={`h-full ${
                  toast.tone === "error"
                    ? "bg-critical"
                    : toast.tone === "success"
                      ? "bg-good"
                      : "bg-accent"
                }`}
                style={{ width: `${remaining * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToneDot({ tone }: { tone: ToastTone }) {
  const colour =
    tone === "error" ? "bg-critical" : tone === "success" ? "bg-good" : "bg-accent";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${colour}`} aria-hidden />;
}
