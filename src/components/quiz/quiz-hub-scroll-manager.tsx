"use client";

import { useEffect } from "react";

function scrollToElement(element: HTMLElement | null) {
  if (!element) return;

  // Double-rAF ensures the browser has laid out newly-revealed content
  // (e.g. an opened <details>) before we measure scroll position.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  });
}

function openSubjectSection(anchor: string, updateHash = true) {
  const details = document.querySelector<HTMLElement>(`details[data-quiz-subject-section="${anchor}"]`);
  if (details && "open" in details) {
    (details as HTMLDetailsElement).open = true;
  }

  const firstCard = document.querySelector<HTMLElement>(`[data-quiz-first-card="${anchor}"]`);
  const fallbackTarget =
    firstCard ??
    document.querySelector<HTMLElement>(`[data-quiz-section-content="${anchor}"]`) ??
    document.getElementById(anchor);

  scrollToElement(fallbackTarget);

  if (updateHash) {
    window.history.replaceState(null, "", `#${anchor}`);
  }
}

export function QuizHubScrollManager() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const trigger = target.closest<HTMLElement>("[data-quiz-subject-jump]");
      if (!trigger) return;

      const anchor = trigger.dataset.quizSubjectJump;
      if (!anchor) return;

      event.preventDefault();
      openSubjectSection(anchor);
    };

    document.addEventListener("click", handleClick);

    if (window.location.hash) {
      const anchor = window.location.hash.replace(/^#/, "");
      if (anchor) {
        openSubjectSection(anchor, false);
      }
    }

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  return null;
}
