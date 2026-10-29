import { useEffect, useRef, type ReactNode } from "react";
import { CloudRain } from "lucide-react";
import "./browser-notice.css";

export function BrowserNotice({
  title,
  detail,
  children,
  modal = false,
  close,
  closeLabel,
}: {
  title: string;
  detail: string;
  children?: ReactNode;
  modal?: boolean;
  close?: () => void;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [modal]);
  return (
    <div className={modal ? "notice-backdrop" : "notice-page"}>
      <div
        ref={ref}
        tabIndex={-1}
        className="browser-notice card"
        role={modal ? "dialog" : "region"}
        aria-modal={modal || undefined}
        aria-label={title}
        onKeyDown={(event) => {
          if (modal && event.key === "Escape") {
            event.stopPropagation();
            close?.();
          }
          if (modal && event.key === "Tab") {
            const buttons = ref.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
            if (!buttons?.length) return;
            const first = buttons[0],
              last = buttons[buttons.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="notice-brand">
          <CloudRain size={42} aria-hidden="true" />
          <span>
            RainCode<span className="brand-dot">.</span>
          </span>
        </div>
        <h1>{title}</h1>
        <p>{detail}</p>
        <div className="button-row">
          {children}
          {close && (
            <button type="button" className="button" onClick={close}>
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
