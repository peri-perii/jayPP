import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  formatStudentName,
  WELCOME_HOLD_MS,
  WELCOME_REDUCED_HOLD_MS,
  WELCOME_TRANSITION_MS,
  WELCOME_STAGGER_MS,
} from "../lib/nameFormat";

export {
  WELCOME_HOLD_MS,
  WELCOME_REDUCED_HOLD_MS,
  WELCOME_TRANSITION_MS,
  WELCOME_STAGGER_MS,
};

export interface WelcomeScreenProps {
  rawName?: string | null;
  onComplete: () => void;
  onStartExit?: () => void;
}

type WelcomeStage = "ready" | "entering" | "holding" | "exiting";

export function WelcomeScreen({ rawName, onComplete, onStartExit }: WelcomeScreenProps) {
  const [stage, setStage] = useState<WelcomeStage>("ready");
  const exitStartedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const { greeting, displayName } = useMemo(() => formatStudentName(rawName), [rawName]);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const triggerExit = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    clearAllTimers();

    setStage("exiting");
    onStartExit?.();

    const finishTimer = setTimeout(() => {
      onComplete();
    }, WELCOME_TRANSITION_MS);
    timersRef.current.push(finishTimer);
  }, [clearAllTimers, onComplete, onStartExit]);

  // Main lifecycle timeline
  useEffect(() => {
    const holdDuration = isReducedMotion ? WELCOME_REDUCED_HOLD_MS : WELCOME_HOLD_MS;

    // Frame 1: Trigger entrance transition
    const enterFrame = requestAnimationFrame(() => {
      setStage("entering");
    });

    // Hold steady after entrance transition finishes (450ms)
    const holdTimer = setTimeout(() => {
      if (!exitStartedRef.current) {
        setStage("holding");
      }
    }, WELCOME_TRANSITION_MS);
    timersRef.current.push(holdTimer);

    // Trigger exit at the configured hold duration (1600ms total from t=0)
    const exitTimer = setTimeout(() => {
      triggerExit();
    }, holdDuration);
    timersRef.current.push(exitTimer);

    return () => {
      cancelAnimationFrame(enterFrame);
      clearAllTimers();
    };
  }, [isReducedMotion, triggerExit, clearAllTimers]);

  // Capacitor / Native Android back button: skip straight to Home, never back to login
  useEffect(() => {
    const cap = (globalThis as unknown as {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener: (evt: string, cb: () => void) => { remove: () => void };
          };
        };
      };
    }).Capacitor;
    const appPlugin = cap?.Plugins?.App;
    if (!appPlugin) return;

    let sub: { remove: () => void } | null = null;
    try {
      sub = appPlugin.addListener("backButton", () => {
        triggerExit();
      });
    } catch {}

    return () => {
      sub?.remove();
    };
  }, [triggerExit]);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    triggerExit();
  };

  const isAnimating = stage === "entering" || stage === "exiting";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`welcome-screen-overlay stage-${stage} ${isAnimating ? "is-animating" : ""}`}
      onClick={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      <div className="welcome-content-block">
        <p className={`welcome-greeting ${!displayName ? "welcome-greeting-standalone" : ""}`}>
          {greeting}
        </p>
        {displayName && (
          <h1 className="welcome-name" lang="en">
            {displayName}
          </h1>
        )}
      </div>
    </div>
  );
}
