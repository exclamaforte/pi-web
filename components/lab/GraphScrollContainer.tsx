"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

interface GraphScrollContainerProps {
  contentWidth: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  stickyTop?: number;
}

export function GraphScrollContainer({
  contentWidth,
  children,
  className,
  style,
  stickyTop = 0,
}: GraphScrollContainerProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Default to true if content is wide, updated by ResizeObserver in browser
  const [hasOverflow, setHasOverflow] = useState(() => contentWidth > 800);

  const handleTopScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const topEl = topScrollRef.current;
    const mainEl = mainScrollRef.current;
    if (!topEl || !mainEl) return;
    if (Math.abs(mainEl.scrollLeft - topEl.scrollLeft) < 1) return;

    isSyncingRef.current = true;
    mainEl.scrollLeft = topEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  const handleMainScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const topEl = topScrollRef.current;
    const mainEl = mainScrollRef.current;
    if (!topEl || !mainEl) return;
    if (Math.abs(topEl.scrollLeft - mainEl.scrollLeft) < 1) return;

    isSyncingRef.current = true;
    topEl.scrollLeft = mainEl.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, []);

  useEffect(() => {
    const mainEl = mainScrollRef.current;
    if (!mainEl) return;

    const checkOverflow = () => {
      setHasOverflow(mainEl.scrollWidth > mainEl.clientWidth + 2);
    };

    checkOverflow();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(checkOverflow);
      ro.observe(mainEl);
      return () => ro.disconnect();
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", checkOverflow);
      return () => window.removeEventListener("resize", checkOverflow);
    }
  }, [contentWidth]);

  useEffect(() => {
    if (hasOverflow && topScrollRef.current && mainScrollRef.current) {
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
    }
  }, [hasOverflow]);

  const scrollByAmount = (delta: number) => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollBy({ left: delta, behavior: "smooth" });
    }
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
      className={className}
    >
      {/* Top horizontal scrollbar pinned at the top */}
      {hasOverflow && (
        <div
          style={{
            position: "sticky",
            top: stickyTop,
            zIndex: 10,
            background: "var(--bg-panel)",
            border: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
            borderRadius: "8px 8px 0 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Controls header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 10px",
              fontSize: 11,
              color: "var(--text-muted)",
              background: "var(--bg)",
              borderBottom: "1px solid var(--border)",
              borderRadius: "7px 7px 0 0",
              userSelect: "none",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500 }}>
              <span style={{ color: "var(--accent)" }}>↔</span>
              <span>Horizontal Scroll</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => scrollByAmount(-300)}
                title="Scroll left 300px"
                aria-label="Scroll graph left"
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 8px",
                  lineHeight: 1.2,
                }}
              >
                ◀ Left
              </button>
              <button
                type="button"
                onClick={() => scrollByAmount(300)}
                title="Scroll right 300px"
                aria-label="Scroll graph right"
                style={{
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "2px 8px",
                  lineHeight: 1.2,
                }}
              >
                Right ▶
              </button>
            </div>
          </div>

          {/* Full-width top scrollbar track */}
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="lab-graph-top-scrollbar"
            aria-label="Graph horizontal scrollbar"
            style={{
              width: "100%",
              overflowX: "auto",
              overflowY: "hidden",
            }}
          >
            <div style={{ width: contentWidth, height: 12 }} />
          </div>
        </div>
      )}

      {/* Main Graph Content Area - bottom scrollbar hidden */}
      <div
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        className="hide-scrollbar"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          background: "var(--bg-panel)",
          border: "1px solid var(--border)",
          borderTop: hasOverflow ? "none" : "1px solid var(--border)",
          borderRadius: hasOverflow ? "0 0 8px 8px" : 8,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
