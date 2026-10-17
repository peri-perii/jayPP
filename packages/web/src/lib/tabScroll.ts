/**
 * Tab scroll position restoration & scroll-to-top coordination.
 * Preserves each tab's scroll offset during navigation.
 * Resets on tab re-tap (smooth scroll to top) or explicit refresh.
 */

import { useEffect, useLayoutEffect, useRef } from "react";

const scrollStore: Record<string, number> = {};

export function getTabScroll(tabId: string): number {
  return scrollStore[tabId] || 0;
}

export function setTabScroll(tabId: string, y: number): void {
  scrollStore[tabId] = Math.max(0, y);
}

export function resetTabScroll(tabId: string): void {
  scrollStore[tabId] = 0;
}

export function scrollToTopTab(tabId: string): void {
  resetTabScroll(tabId);
  window.dispatchEvent(
    new CustomEvent("juet:scroll-to-top", { detail: { tab: tabId } })
  );
}

/**
 * Hook attached to the single scroll container of each tab.
 * - Restores saved scroll position on mount.
 * - Persists scroll position on scroll.
 * - Listens for scroll-to-top events when the active tab is re-tapped.
 */
export function useTabScroll(
  tabId: string,
  containerRef: React.RefObject<HTMLElement | null>
) {
  const isRestoring = useRef(false);

  // Restore scroll position immediately when DOM mounts
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const saved = getTabScroll(tabId);
    if (saved > 0) {
      isRestoring.current = true;
      el.scrollTop = saved;
      requestAnimationFrame(() => {
        if (el) el.scrollTop = saved;
        isRestoring.current = false;
      });
    }
  }, [tabId, containerRef]);

  // Listen for scroll-to-top re-tap event
  useEffect(() => {
    const onScrollToTop = (e: Event) => {
      const detail = (e as CustomEvent<{ tab?: string }>).detail;
      if (!detail?.tab || detail.tab === tabId) {
        containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        setTabScroll(tabId, 0);
      }
    };

    window.addEventListener("juet:scroll-to-top", onScrollToTop);
    return () => window.removeEventListener("juet:scroll-to-top", onScrollToTop);
  }, [tabId, containerRef]);

  // Track scroll position
  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    if (isRestoring.current) return;
    const top = e.currentTarget.scrollTop;
    setTabScroll(tabId, top);
  };

  return { handleScroll };
}
