import { useState, useEffect } from "react";
import { Home, Clock3, CalendarDays, Award, MoreHorizontal, type LucideIcon } from "lucide-react";

export type TabId = "home" | "timetable" | "calendar" | "results" | "more";

interface TabDefinition {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDefinition[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "timetable", label: "Timetable", icon: Clock3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "results", label: "Results", icon: Award },
  { id: "more", label: "More", icon: MoreHorizontal },
];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;

    const handleResize = () => {
      if (viewport) {
        const diff = window.innerHeight - viewport.height;
        setKeyboardOpen(diff > 140);
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (isInput && window.innerWidth < 1024) {
        setKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setKeyboardOpen(false);
    };

    viewport?.addEventListener("resize", handleResize);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      viewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const activeIndex = TABS.findIndex((t) => t.id === active);
  const clampedIndex = activeIndex >= 0 ? activeIndex : 0;

  return (
    <nav
      className={`btm-nav ${keyboardOpen ? "is-keyboard-hidden" : ""}`}
      role="tablist"
      aria-label="Main navigation"
    >
      <div
        className="btm-nav-indicator"
        style={{ transform: `translateX(${clampedIndex * 100}%)` }}
        aria-hidden="true"
      />
      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            aria-current={selected ? "page" : undefined}
            className={`btm-nav-tab ${selected ? "active" : ""}`}
            onClick={() => onChange(id)}
          >
            <span className="btm-nav-icon-wrap">
              <Icon
                size={22}
                strokeWidth={1.8}
                fill={selected ? "currentColor" : "none"}
                className="btm-nav-icon"
                aria-hidden="true"
              />
            </span>
            <span className="btm-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
