"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppRelease } from "@/lib/app-release";

type CheckState = "idle" | "checking" | "ready" | "error";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Advisory only. Never reload on its own; a user must choose to reload.
 * All form edits and pending saves block the reload action.
 */
export function UpdateNotice({ current }: { current: AppRelease }) {
  const [latest, setLatest] = useState<AppRelease | null>(null);
  const [status, setStatus] = useState<CheckState>("idle");
  const [collapsed, setCollapsed] = useState(false);
  const [warning, setWarning] = useState("");

  const check = useCallback(async (manual = false) => {
    if (!navigator.onLine || (!manual && document.visibilityState !== "visible")) return;
    if (manual) setStatus("checking");
    try {
      const response = await fetch(`/api/app-version?t=${Date.now()}`, {
        cache: "no-store", credentials: "same-origin", redirect: "manual",
      });
      // A naturally expired login must never trigger a forced logout/reload.
      if (!response.ok || response.type === "opaqueredirect") {
        if (manual) setStatus("error");
        return;
      }
      const result: AppRelease = await response.json();
      if (typeof result.id !== "string" || typeof result.label !== "string") return;
      setLatest(result.id !== current.id ? result : null);
      if (manual) setStatus("ready");
    } catch {
      if (manual) setStatus("error");
    }
  }, [current.id]);

  useEffect(() => {
    const first = window.setTimeout(() => void check(), 1200);
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onFocus = () => void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  // Track edits on existing and dynamically mounted forms (e.g. modal forms).
  useEffect(() => {
    const onEdit = (event: Event) => {
      const element = event.target;
      if (!(element instanceof Element)) return;
      if (element.closest("[data-og-ignore-draft]")) return;
      const form = element.closest("form");
      if (form && !form.hasAttribute("data-og-ignore-draft")) {
        form.dataset.ogDirty = "true";
      }
    };
    const onReset = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLFormElement) delete target.dataset.ogDirty;
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", onReset, true);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (document.querySelector('form[data-og-dirty="true"], [data-og-saving="true"]')) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", onReset, true);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const apply = () => {
    const pending = document.querySelector('[data-og-saving="true"]');
    const dirtyForms = document.querySelectorAll('form[data-og-dirty="true"]');
    if (pending || dirtyForms.length > 0) {
      setWarning(pending
        ? "저장 중입니다. 저장이 끝나면 다시 눌러주세요."
        : "아직 저장하지 않은 입력이 있습니다. 저장을 마치거나 해당 입력창을 닫고 다시 눌러주세요.");
      setCollapsed(false);
      return;
    }
    // Full navigation is required to load new client-side JS after a deployment.
    window.location.reload();
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span title={`현재 배포: ${current.id}`}>{current.label}</span>
        {latest ? (
          <button type="button" onClick={() => { setCollapsed(false); setWarning(""); }}
            className="font-semibold text-brand-600 underline underline-offset-2">새 버전 있음</button>
        ) : (
          <button type="button" onClick={() => void check(true)} disabled={status === "checking"}
            className="underline underline-offset-2 disabled:opacity-50">{status === "checking" ? "확인 중…" : "업데이트 확인"}</button>
        )}
      </div>
      {status === "error" && !latest && <p className="mt-1 text-[11px] text-muted">확인 실패. 연결을 확인하고 다시 시도해주세요.</p>}
      {latest && !collapsed && (
        <div role="status" aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-[420px] rounded-md border border-line bg-surface p-4 shadow-xl sm:bottom-6 sm:left-auto sm:right-6">
          <p className="text-sm font-bold text-ink">새로운 ERP 버전이 준비되었습니다.</p>
          <p className="mt-1 text-xs text-muted">{latest.label} · 작성 중인 내용은 자동으로 닫히지 않습니다.</p>
          {warning && <p role="alert" className="mt-2 text-xs font-semibold text-danger">{warning}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="btn" onClick={() => { setCollapsed(true); setWarning(""); }}>나중에</button>
            <button type="button" className="btn-primary" onClick={apply}>저장 후 새로고침</button>
          </div>
        </div>
      )}
    </>
  );
}
