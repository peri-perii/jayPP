import { useState, useEffect, useRef, useMemo } from "react";
import { features } from "@juet/core";
import { client, getSessionStatus } from "../lib/portal";
import { useFeature, getCached, setCached, sessionCacheKey, getCacheGeneration, isCacheGenerationCurrent } from "../hooks/useFeature";
import { useSemester } from "../hooks/useSemester";
import { SectionError, formatSemester, formatLastSync, shouldThrottleRefresh, recordRefreshAttempt } from "../components/DataViews";
import { SubjectDetailSheet } from "../components/SubjectDetailSheet";
import {
  getManualRefreshQuota,
  recordSuccessfulManualRefresh,
  doesSubjectNeedDeepFetch,
  subscribePortalDayRollover,
  FEATURE_TTL,
  computeSubjectRowChecksum,
  type RefreshQuotaState,
} from "../lib/portalSchedule";
import type { Session } from "../types";
import {
  type AttRow,
  type AttData,
  subjectName,
  combinedAttendance,
  getCachedSubjectDetail,
  getCachedSubjectDetailEntry,
  setCachedSubjectDetail,
  useAttendanceInitial,
  getCachedLov,
  setCachedLov,
} from "../sections/attendance";

export function AttendancePage({
  session,
  isExpired,
  isRecovering,
  onBack,
  onLogout,
  onRequestRenew,
}: {
  session: Session;
  isExpired?: boolean;
  isRecovering?: boolean;
  onBack: () => void;
  onLogout: () => void;
  onRequestRenew?: () => void;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (msg: string, ms: number) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setQuotaNotice(msg);
    noticeTimer.current = setTimeout(() => {
      if (pageIsLive.current) setQuotaNotice(null);
    }, ms);
  };
  const refreshInProgress = useRef(false);
  const pageIsLive = useRef(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [selectedSubject, setSelectedSubject] = useState<(AttRow & Record<string, unknown>) | null>(null);
  const [filter, setFilter] = useState<"all" | "short">("all");

  useEffect(() => {
    pageIsLive.current = true;
    return () => {
      pageIsLive.current = false;
    };
  }, []);

  const [lastSync, setLastSync] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem("juet.portal.last_sync");
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const update = () => {
      try {
        const raw = localStorage.getItem("juet.portal.last_sync");
        if (raw) setLastSync(Number(raw));
      } catch {}
    };
    window.addEventListener("storage", update);
    window.addEventListener("juet:sync", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("juet:sync", update);
    };
  }, []);

  const [refreshQuota, setRefreshQuota] = useState<RefreshQuotaState>(() => getManualRefreshQuota(session));

  useEffect(() => {
    const updateQuota = () => {
      setRefreshQuota(getManualRefreshQuota(session));
    };
    window.addEventListener("juet:quota-changed", updateQuota);
    window.addEventListener("storage", updateQuota);
    const unsubscribeRollover = subscribePortalDayRollover(updateQuota);
    return () => {
      window.removeEventListener("juet:quota-changed", updateQuota);
      window.removeEventListener("storage", updateQuota);
      unsubscribeRollover();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [session]);

  const att = useAttendanceInitial(session);
  const initial = att.data;
  const [semId, setSemId, sem] = useSemester(sessionCacheKey("semester", session, "attendance"), initial?.semesters);
  const isDefault = semId === String(initial?.semesters?.[0]?.registrationid);
  const lastSemRef = useRef(`${session.username}:${session.instituteid ?? "default"}:${semId}`);

  const detail = useFeature<{ rows: AttRow[] }>({
    run: () =>
      features.getAttendanceDetail(client, session, {
        stynumber: initial?.header?.stynumber,
        registrationid: sem?.registrationid,
        registrationcode: sem?.registrationcode,
      }),
    deps: [session, semId],
    enabled: sem !== null && !isDefault,
    cacheKey: semId ? sessionCacheKey("att.detail", session, semId) : undefined,
    staleTimeMs: FEATURE_TTL.pastDetail,
  });

  const rows = isDefault ? (initial?.rows ?? []) : (detail.data?.rows ?? []);
  const semesters = initial?.semesters ?? [];

  const loading = att.loading || detail.loading;

  const [detailsMap, setDetailsMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      const cached = getCachedSubjectDetail(session.username, semId, r, session.instituteid);
      if (cached) {
        const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
        map[subId] = cached;
      }
    }
    return map;
  });

  useEffect(() => {
    if (isExpired) {
      setIsRefreshing(false);
      setSyncingIds(new Set());
      setSyncProgress({ done: 0, total: 0 });
    }
  }, [isExpired]);

  useEffect(() => {
    if (!rows.length || isExpired || !isDefault || refreshInProgress.current) return;

    const generation = getCacheGeneration();
    let isLive = true;
    let isAborted = false;
    let successCount = 0;
    let detailFailures = 0;
    const currentMap: Record<string, Record<string, unknown>> = {};
    const toFetch: (AttRow & Record<string, unknown>)[] = [];

    for (const r of rows) {
      const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
      const entry = getCachedSubjectDetailEntry(session.username, semId, r, session.instituteid);
      if (entry.data) {
        currentMap[subId] = entry.data;
      }
      if (doesSubjectNeedDeepFetch(r as AttRow & Record<string, unknown>, entry.data, entry.updatedAt, entry.checksum)) {
        toFetch.push(r as AttRow & Record<string, unknown>);
      }
    }

    const currentSemKey = `${session.username}:${session.instituteid ?? "default"}:${semId}`;
    const isNewSemester = lastSemRef.current !== currentSemKey;
    lastSemRef.current = currentSemKey;
    setDetailsMap((prev) => (isNewSemester ? currentMap : { ...prev, ...currentMap }));

    if (toFetch.length > 0 && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
      setSyncProgress({ done: 0, total: toFetch.length });

      const base = {
        stynumber: initial?.header?.stynumber,
        registrationid: sem?.registrationid,
        registrationcode: sem?.registrationcode,
      };

      const queue = [...toFetch];
      const concurrency = 4;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0 && isLive && !isAborted && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
          const r = queue.shift();
          if (!r) break;
          const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
          if (isLive) {
            setSyncingIds((prev) => new Set(prev).add(subId));
          }
          try {
            const data = await features.getSubjectAttendanceAll(client, session, r, base, "current");
            if (pageIsLive.current && data && isCacheGenerationCurrent(generation) && getSessionStatus() !== "expired") {
              const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
              setCachedSubjectDetail(session, semId, r, data);
              setDetailsMap((prev) => ({ ...prev, [subId]: data }));
              if (isLive && !isAborted) {
                successCount++;
              }
            }
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code;
            const status = (err as { status?: number })?.status;
            if (code === "SESSION_EXPIRED" || status === 401 || getSessionStatus() === "expired") {
              isAborted = true;
              queue.length = 0;
              if (isLive) {
                setSyncingIds(new Set());
                setSyncProgress({ done: 0, total: 0 });
              }
              break;
            }
            detailFailures++;
          } finally {
            if (isLive && !isAborted) {
              setSyncingIds((prev) => {
                const next = new Set(prev);
                next.delete(subId);
                return next;
              });
              setSyncProgress((prev) => ({ ...prev, done: prev.done + 1 }));
            }
          }
        }
      });

      Promise.all(workers)
        .then(() => {
          if (isLive && !isAborted && successCount > 0 && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
            try {
              localStorage.setItem("juet.portal.last_sync", String(Date.now()));
              window.dispatchEvent(new CustomEvent("juet:sync"));
            } catch {}
          }
        })
        .finally(() => {
          if (isLive) {
            setSyncingIds(new Set());
            setSyncProgress({ done: 0, total: 0 });
            if (!isAborted && detailFailures > 0 && getSessionStatus() !== "expired" && isCacheGenerationCurrent(generation)) {
              showNotice("Some subject details could not be updated", 3500);
            }
          }
        });
    }

    return () => {
      isLive = false;
      isAborted = true;
      setSyncingIds(new Set());
      setSyncProgress({ done: 0, total: 0 });
    };
  }, [rows, semId, session, initial?.header?.stynumber, sem?.registrationid, sem?.registrationcode, isExpired]);

  const isSyncing = !isExpired && (isRefreshing || loading || syncingIds.size > 0);

  const { shortsCount, filteredRows } = useMemo(() => {
    let count = 0;
    const filtered: (AttRow & Record<string, unknown>)[] = [];
    for (const r of rows) {
      const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
      const isShort = combinedAttendance(r, detailsMap[subId]).isShort;
      if (isShort) count++;
      if (filter === "all" || isShort) {
        filtered.push(r as AttRow & Record<string, unknown>);
      }
    }
    return { shortsCount: count, filteredRows: filtered };
  }, [rows, detailsMap, filter]);

  const handleRefresh = async () => {
    if (refreshInProgress.current || isSyncing || isExpired) return;

    if (!isDefault) {
      showNotice("Only current semester updates", 2000);
      return;
    }

    const quota = getManualRefreshQuota(session);
    if (!quota.canRefresh) {
      showNotice("Up to date with portal", 2500);
      return;
    }
    if (shouldThrottleRefresh("attendance")) {
      showNotice("Please wait a few seconds to refresh", 2000);
      return;
    }

    const requestGeneration = getCacheGeneration();
    refreshInProgress.current = true;
    recordRefreshAttempt("attendance");
    setRefreshError(null);
    setQuotaNotice(null);
    setIsRefreshing(true);

    const cachedInitialBefore = getCached<AttData>(sessionCacheKey("att.initial", session));
    const baselineRows = rows.length > 0 ? rows : (cachedInitialBefore.data?.rows ?? []);

    try {
      let freshRows: (AttRow & Record<string, unknown>)[] | null = null;
      const basePayload = {
        stynumber: initial?.header?.stynumber,
        registrationid: sem?.registrationid,
        registrationcode: sem?.registrationcode,
      };

      if (isDefault) {
        const cachedLov = getCachedLov(session);
        const freshAtt = await features.getAttendance(client, session, cachedLov ?? undefined);
        if (!pageIsLive.current || !isCacheGenerationCurrent(requestGeneration)) return;
        if (freshAtt && Array.isArray(freshAtt.rows)) {
          freshRows = freshAtt.rows as (AttRow & Record<string, unknown>)[];
          setCached(sessionCacheKey("att.initial", session), freshAtt);
          setCachedLov(session, freshAtt);
        } else {
          throw new Error("Portal returned no attendance data");
        }
      } else if (sem?.registrationid) {
        const freshDetail = await features.getAttendanceDetail(client, session, basePayload);
        if (!pageIsLive.current || !isCacheGenerationCurrent(requestGeneration)) return;
        if (freshDetail && Array.isArray(freshDetail.rows)) {
          freshRows = freshDetail.rows as (AttRow & Record<string, unknown>)[];
          setCached(sessionCacheKey("att.detail", session, semId), freshDetail);
        } else {
          throw new Error("Portal returned no attendance data");
        }
      }

      if (!pageIsLive.current || !isCacheGenerationCurrent(requestGeneration)) return;

      const activeRows = freshRows ?? rows;
      const rowsDiffered = baselineRows.length > 0
        ? (baselineRows.length !== (freshRows?.length ?? 0) || (freshRows ?? []).some((fr) => {
            const subId = String(fr.subjectid ?? fr.individualsubjectcode ?? fr.subjectcode);
            const oldRow = baselineRows.find((or) => String(or.subjectid ?? or.individualsubjectcode ?? or.subjectcode) === subId);
            if (!oldRow) return true;
            return computeSubjectRowChecksum(fr) !== computeSubjectRowChecksum(oldRow);
          }))
        : true;

      const hasSubjectDetailChanged = activeRows.some((r) => {
        const entry = getCachedSubjectDetailEntry(session.username, semId, r, session.instituteid);
        return doesSubjectNeedDeepFetch(r as AttRow & Record<string, unknown>, entry.data, entry.updatedAt, entry.checksum);
      });
      const attendanceChanged = rowsDiffered || hasSubjectDetailChanged;

      const isValidCurrentSync =
        isDefault &&
        Boolean(freshRows && freshRows.length > 0) &&
        pageIsLive.current &&
        isCacheGenerationCurrent(requestGeneration) &&
        getSessionStatus() !== "expired";

      if (isValidCurrentSync) {
        const next = recordSuccessfulManualRefresh(session, { changed: attendanceChanged });
        setRefreshQuota(next);
        if (!attendanceChanged) {
          showNotice("Up to date with portal", 2500);
        }
        try {
          localStorage.setItem("juet.portal.last_sync", String(Date.now()));
          window.dispatchEvent(new CustomEvent("juet:sync"));
        } catch {}
      }

      if (pageIsLive.current) {
        setIsRefreshing(false);
      }
      refreshInProgress.current = false;

      if (pageIsLive.current && isCacheGenerationCurrent(requestGeneration)) {
        window.dispatchEvent(new CustomEvent("juet:refresh-attendance"));
      }
    } catch (err: unknown) {
      if (pageIsLive.current && getSessionStatus() !== "expired") {
        setRefreshError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      refreshInProgress.current = false;
      if (pageIsLive.current) {
        setIsRefreshing(false);
      }
    }
  };

  const error = refreshError ?? att.error ?? detail.error;
  const isHardBlocked = isDefault && !refreshQuota.canRefresh && !error;
  const retry = refreshError ? () => handleRefresh() : att.error ? att.retry : detail.retry;

  return (
    <main className="dash att-page dash-view-enter">
      {/* Top Navigation Bar */}
      <header className="dash-top-bar att-top-bar">
        <div className="att-top-left">
          <button
            type="button"
            onClick={onBack}
            className="dash-refresh-btn"
            aria-label="Back to dashboard"
            title="Back to dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="att-header-titles">
            <h1 className="att-header-title">Attendance</h1>
            {isSyncing ? (
              <span className="att-sync-pill is-syncing" role="status" aria-live="polite">
                <span className="att-sync-dot" aria-hidden="true" />
                <span>
                  {syncProgress.total > 0
                    ? `Refreshing ${syncProgress.done}/${syncProgress.total}…`
                    : "Refreshing…"}
                </span>
              </span>
            ) : quotaNotice ? (
              <span className="att-sync-pill att-sync-notice" role="status" aria-live="polite">
                {quotaNotice}
              </span>
            ) : lastSync ? (
              <span className="att-sync-pill">
                {formatLastSync(lastSync)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="att-top-actions">
          {semesters.length > 1 && (
            <select
              value={semId ?? ""}
              onChange={(e) => setSemId(e.target.value)}
              disabled={loading || isSyncing}
              className="sem-picker"
              aria-label="Select Semester"
            >
              {semesters.map((s) => (
                <option key={String(s.registrationid)} value={String(s.registrationid)}>
                  {formatSemester(s.registrationcode ?? s.registrationdesc)}
                </option>
              ))}
            </select>
          )}

          {isExpired && !isRecovering && (
            <button
              onClick={onRequestRenew}
              className="m3-reconnect-pill"
              title="Session expired — tap to reconnect"
            >
              <span className="reconnect-dot" />
              <span>Reconnect</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleRefresh()}
            className={`dash-refresh-btn ${isSyncing ? "is-spinning" : ""}`}
            aria-label="Refresh attendance"
            title={
              isSyncing
                ? "Refreshing attendance…"
                : isHardBlocked
                ? "Up to date with portal"
                : shouldThrottleRefresh("attendance") && lastSync
                ? formatLastSync(lastSync)
                : "Refresh attendance"
            }
            disabled={isSyncing}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </header>

      <div className="att-content">
        {/* Segmented Pill Toggle (only when subjects are short) */}
        {shortsCount > 0 && rows.length > 0 && (
          <div className="att-filter-bar">
            <div className="segmented-pill-toggle" role="tablist" aria-label="Filter subjects">
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                className={`segmented-pill ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All {rows.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "short"}
                className={`segmented-pill ${filter === "short" ? "active" : ""}`}
                onClick={() => setFilter("short")}
              >
                Short {shortsCount}
              </button>
            </div>
          </div>
        )}

        {/* Subject List Items */}
        <section className="att-list" aria-label="Subject list">
          {loading && (
            <p className="muted" style={{ padding: "24px 20px" }}>Loading attendance records…</p>
          )}

          {filteredRows.length > 0 &&
            filteredRows.map((r, i) => {
              const { name, badge } = subjectName(r.subjectcode);
              const subId = String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode);
              const isSubjectSyncing = syncingIds.has(subId);
              const attInfo = combinedAttendance(r, detailsMap[subId]);

              return (
                <button
                  key={String(r.subjectid ?? r.individualsubjectcode ?? r.subjectcode ?? i)}
                  type="button"
                  className={`m3-list-item att-subject-row ${attInfo.isShort ? "is-short-row" : ""}`}
                  onClick={() => setSelectedSubject(r as AttRow & Record<string, unknown>)}
                  aria-label={`${name}, ${attInfo.pct} attendance`}
                >
                  <div className="m3-item-content">
                    <span className="m3-item-headline att-subject-name">{name}</span>
                    <span className="att-subject-supporting">
                      {badge && <span className="att-code">{badge}</span>}
                      {badge && " · "}
                      {isSubjectSyncing ? (
                        <span className="att-count-syncing">
                          <span className="sync-pulse-dot" aria-hidden="true" />
                          Refreshing…
                        </span>
                      ) : attInfo.hasHeldClasses && attInfo.totalClasses > 0 ? (
                        `${attInfo.totalPresent}/${attInfo.totalClasses} classes`
                      ) : attInfo.hasHeldClasses && attInfo.totalClasses === 0 ? (
                        attInfo.components.L?.pct != null && attInfo.components.T?.pct != null
                          ? `L: ${attInfo.components.L.pct}% · T: ${attInfo.components.T.pct}%`
                          : "Classes held"
                      ) : (
                        "No classes yet"
                      )}
                    </span>
                  </div>
                  <span className={`att-row-pct ${attInfo.hasHeldClasses && attInfo.totalClasses > 0 ? attInfo.colorClass : "is-empty"} ${isSubjectSyncing ? "att-pct-syncing" : ""}`}>
                    {isSubjectSyncing ? "…" : attInfo.hasHeldClasses && attInfo.pct !== "—" ? attInfo.pct : "--"}
                  </span>
                </button>
              );
            })}

          {/* Empty filter message */}
          {rows.length > 0 && filteredRows.length === 0 && (
            <div className="att-empty-filter">
              <p className="muted">No subjects match this filter.</p>
              <button type="button" className="att-reset-filter-btn" onClick={() => setFilter("all")}>
                Show All Subjects
              </button>
            </div>
          )}

          {initial && rows.length === 0 && !error && !loading && (
            <p className="muted" style={{ padding: "24px 20px" }}>No attendance rows found.</p>
          )}

          {error && <SectionError label="Attendance" error={error} retry={retry} />}
        </section>
      </div>

      {/* Slide-over sheet for detailed history */}
      {selectedSubject && (
        <SubjectDetailSheet
          row={selectedSubject}
          registrationid={sem?.registrationid}
          registrationcode={sem?.registrationcode}
          session={session}
          onClose={() => setSelectedSubject(null)}
          onLogout={onLogout}
        />
      )}

      <footer className="dash-footer">
        <span className="peri-watermark">peri-peri</span>
        <div className="m3-connected-button-group" role="group" aria-label="Quick links">
          <button
            type="button"
            onClick={onLogout}
            className="m3-connected-btn logout-action"
            aria-label="Logout"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </footer>
    </main>
  );
}
