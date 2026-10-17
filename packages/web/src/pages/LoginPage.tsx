import { useEffect, useRef, useState } from "react";
import {
  GraduationCap,
  User,
  Users,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { auth, session } from "@juet/core";
import { client } from "../lib/portal";
import { fetchAutosolvedCaptcha, MAX_AUTOSOLVE_ATTEMPTS } from "../lib/captchaSolve";
import type { Captcha, Session } from "../types";

export function LoginPage({ onDone }: { onDone: (s: Session) => void }) {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("juet.portal.last_user") ?? "";
    } catch {
      return "";
    }
  });
  const [savedPw] = useState(() => {
    try {
      return localStorage.getItem("juet.portal.saved_pw") ?? "";
    } catch {
      return "";
    }
  });
  const [hasSavedProfile, setHasSavedProfile] = useState(() => Boolean(savedPw));
  const [password, setPassword] = useState(() => savedPw);
  const [rememberPw, setRememberPw] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaText, setCaptchaText] = useState("");
  const [usertype, setUsertype] = useState<"S" | "P">(() => {
    try {
      return (localStorage.getItem("juet.portal.last_usertype") as "S" | "P") ?? "S";
    } catch {
      return "S";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [autoSolveFailed, setAutoSolveFailed] = useState(false);
  const [isAutoSolved, setIsAutoSolved] = useState(false);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(false);

  const loading = useRef(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const captchaInputRef = useRef<HTMLInputElement>(null);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortController.current?.abort();
    };
  }, []);

  const load = async () => {
    if (loading.current) return;
    abortController.current?.abort();
    const ac = new AbortController();
    abortController.current = ac;
    loading.current = true;
    setIsCaptchaLoading(true);
    setCaptcha(null);
    setCaptchaText("");
    setAutoSolveFailed(false);
    setIsAutoSolved(false);
    try {
      const { captcha: c, text, autoSolved } = await fetchAutosolvedCaptcha(MAX_AUTOSOLVE_ATTEMPTS, { signal: ac.signal });
      if (ac.signal.aborted) return;
      setCaptcha(c);
      if (text) {
        setCaptchaText(text);
        setAutoSolveFailed(!autoSolved);
        setIsAutoSolved(autoSolved);
      } else {
        setCaptchaText("");
        setAutoSolveFailed(true);
        setIsAutoSolved(false);
        setTimeout(() => captchaInputRef.current?.focus(), 60);
      }
    } finally {
      loading.current = false;
      if (!ac.signal.aborted) setIsCaptchaLoading(false);
    }
  };

  useEffect(() => {
    if (session.consumeSessionExpired()) setExpired(true);
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    if (username) {
      if (!savedPw) passRef.current?.focus();
    } else {
      userRef.current?.focus();
    }
  }, []);

  const handleClearSaved = () => {
    setUsername("");
    setPassword("");
    setRememberPw(false);
    setHasSavedProfile(false);
    try {
      localStorage.removeItem("juet.portal.last_user");
      localStorage.removeItem("juet.portal.saved_pw");
    } catch {}
    userRef.current?.focus();
  };

  const ready = captcha !== null && !busy && !isCaptchaLoading && Boolean(username.trim()) && Boolean(password) && Boolean(captchaText.trim());

  return (
    <main className="auth-canvas">
      <div className="auth-ambient-glow" aria-hidden="true" />
      <div className="auth-ambient-glow-2" aria-hidden="true" />
      <div className="auth-ambient-glow-3" aria-hidden="true" />
      <div className="auth-card-container">
        <div className="auth-brand-block">
          <div className="auth-brand-icon-box" aria-hidden="true">
            <GraduationCap size={28} className="auth-brand-icon" />
          </div>
          <div className="auth-brand-info">
            <div className="auth-brand-row">
              <span className="auth-brand-name">J.P P</span>
              <span className="auth-brand-tag">JUET</span>
            </div>
            <p className="auth-brand-sub">Attendance, grades, and schedule in one place</p>
          </div>
        </div>

        <form
          className="auth-card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!captcha || busy || isCaptchaLoading) return;
            setBusy(true);
            setError(null);
            try {
              const s = (await auth.login(client, {
                username: username.trim(),
                password,
                captchaText: captchaText.trim(),
                captcha,
                usertype,
              })) as unknown as Session;
              try {
                localStorage.setItem("juet.portal.last_user", username.trim());
                localStorage.setItem("juet.portal.last_usertype", usertype);
                if (rememberPw) {
                  localStorage.setItem("juet.portal.saved_pw", password);
                } else {
                  localStorage.removeItem("juet.portal.saved_pw");
                }
              } catch {}
              onDone(s);
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : String(err));
              load().catch(() => {});
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="auth-header">
            <div className="auth-header-text">
              <h1 className="auth-title">Sign in</h1>
              <p className="auth-subtitle">with your studentportal credentials</p>
            </div>
          </div>

          {expired && (
            <div role="alert" className="auth-banner auth-banner-warning">
              <AlertTriangle size={18} className="shrink-0" />
              <span>Portal logged you out. Please sign in again.</span>
            </div>
          )}

          {error && (
            <div role="alert" className="auth-banner auth-banner-error">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field-group">
            <div className="segmented-pill-toggle" role="radiogroup" aria-label="User role">
              <button
                type="button"
                role="radio"
                aria-checked={usertype === "S"}
                className={`segmented-pill ${usertype === "S" ? "active" : ""}`}
                onClick={() => setUsertype("S")}
              >
                <User size={15} />
                <span>Student</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={usertype === "P"}
                className={`segmented-pill ${usertype === "P" ? "active" : ""}`}
                onClick={() => setUsertype("P")}
              >
                <Users size={15} />
                <span>Parent</span>
              </button>
            </div>
          </div>

          <div className="auth-field-group">
            <div className="auth-label-row">
              <label htmlFor="auth-username" className="auth-field-label">
                Enrollment no
              </label>
              {hasSavedProfile && username && (
                <div className="saved-profile-chip" title="Saved credentials on this device">
                  <Check size={12} strokeWidth={2.5} />
                  <span>Saved</span>
                  <button
                    type="button"
                    className="saved-profile-clear"
                    onClick={handleClearSaved}
                    aria-label="Clear saved credentials"
                    title="Switch / clear saved credentials"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="auth-input-action-wrapper">
              <input
                id="auth-username"
                ref={userRef}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="e.g. 241b6969"
                className={`auth-input ${username ? "has-action" : ""}`}
              />
              {username && !busy && (
                <button
                  type="button"
                  className="auth-input-inline-btn"
                  onClick={() => {
                    setUsername("");
                    userRef.current?.focus();
                  }}
                  aria-label="Clear enrollment number"
                  title="Clear enrollment number"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="auth-field-group">
            <label htmlFor="auth-password" className="auth-field-label">
              Password
            </label>
            <div className="auth-input-action-wrapper">
              <input
                id="auth-password"
                ref={passRef}
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="password"
                className="auth-input has-action"
              />
              <button
                type="button"
                className="auth-input-inline-btn"
                onClick={() => setShowPassword((v) => !v)}
                disabled={busy}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="ios-switch-row">
            <span className="ios-switch-label">Remember device</span>
            <button
              type="button"
              role="switch"
              aria-checked={rememberPw}
              onClick={() => setRememberPw(!rememberPw)}
              className={`ios-switch ${rememberPw ? "is-on" : ""}`}
              aria-label="Remember device on this browser"
            >
              <span className="ios-switch-thumb" />
            </button>
          </div>

          <div className="auth-field-group">
            <label htmlFor="auth-captcha-input" className="auth-field-label">
              Captcha
            </label>

            <div className="auth-captcha-media-row">
              <div
                className="auth-captcha-frame"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (busy || isCaptchaLoading) return;
                  setError(null);
                  load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (busy || isCaptchaLoading) return;
                    setError(null);
                    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
                  }
                }}
                aria-label="Click to refresh captcha"
                title="Click image to refresh captcha"
              >
                {captcha ? (
                  <img src={captcha.imageDataUrl} alt="Captcha image" className="auth-captcha-img" />
                ) : (
                  <div className="auth-captcha-placeholder">
                    <span className="auth-captcha-spinner" />
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`auth-captcha-refresh ${isCaptchaLoading || busy ? "is-loading" : ""}`}
                onClick={() => {
                  setError(null);
                  load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
                }}
                disabled={busy || isCaptchaLoading}
                aria-label="Refresh captcha"
                title="Refresh captcha"
              >
                <RefreshCw size={17} className={isCaptchaLoading || busy ? "spin-icon" : ""} />
              </button>
            </div>

            <div className="auth-input-action-wrapper">
              <input
                id="auth-captcha-input"
                ref={captchaInputRef}
                required
                autoComplete="off"
                value={captchaText}
                onChange={(e) => {
                  setCaptchaText(e.target.value);
                  setIsAutoSolved(false);
                }}
                placeholder="Enter captcha text"
                className={`auth-input ${isAutoSolved ? "has-status" : ""}`}
              />
              {isAutoSolved && (
                <span className="auth-input-inline-status" aria-label="Auto-solved guess">
                  <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                  <span>auto-solved</span>
                </span>
              )}
            </div>
          </div>

          <button type="submit" disabled={!ready} className="auth-submit-btn">
            {busy ? (
              <span className="auth-btn-content">
                <span className="auth-btn-spinner" aria-hidden="true" />
                <span>Signing in…</span>
              </span>
            ) : (
              <span className="auth-btn-content">
                <span>Enter portal</span>
                <ArrowRight size={17} className="auth-btn-arrow" aria-hidden="true" />
              </span>
            )}
          </button>
        </form>

        <div className="auth-simple-campux" aria-label="Campux Lynx">
          IT&apos;S DONE CAMPUX LYNX
        </div>

        <footer className="app-footer">
          <span className="peri-watermark">peri-peri</span>
        </footer>
      </div>
    </main>
  );
}
