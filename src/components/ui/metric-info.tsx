"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricInfo({
  label,
  description,
  className,
}: {
  label: string;
  description: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function clearCloseTimeout() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }

  function openPopover() {
    clearCloseTimeout();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      closeTimeoutRef.current = null;
    }, 120);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    function updatePosition() {
      const triggerRect = containerRef.current?.getBoundingClientRect();
      const popoverWidth = 256;
      const viewportPadding = 12;

      if (!triggerRect) return;

      let left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - popoverWidth - viewportPadding));

      let top = triggerRect.bottom + 10;
      const estimatedHeight = 112;
      if (top + estimatedHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, triggerRect.top - estimatedHeight - 10);
      }

      setPopoverStyle({
        position: "fixed",
        left,
        top,
        width: popoverWidth,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <span
      ref={containerRef}
      className={cn("z-10 inline-flex items-center pointer-events-auto", className)}
      onMouseEnter={openPopover}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        onClick={() => {
          clearCloseTimeout();
          setOpen((current) => !current);
        }}
        onFocus={openPopover}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
            scheduleClose();
          }
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)] transition hover:text-orange-primary focus:outline-none focus:ring-2 focus:ring-orange-primary/30"
      >
        <Info className="h-3 w-3" />
      </button>

      {open && mounted
        ? createPortal(
            <span
              ref={popoverRef}
              style={popoverStyle}
              onMouseEnter={openPopover}
              onMouseLeave={scheduleClose}
              className="z-[120] rounded-[20px] bg-white px-4 py-3 text-left shadow-[0_22px_55px_rgba(142,94,37,0.18),inset_0_0_0_1px_rgba(232,135,30,0.12)]"
            >
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-orange-primary">
            {label}
          </span>
          <span className="mt-1.5 block text-sm leading-6 text-body">{description}</span>
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
