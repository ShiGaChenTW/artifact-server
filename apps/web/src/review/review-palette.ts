/** Palette and light/dark mode are independent browser preferences. */
export type ReviewPalette = "reader" | "borderloop";

export function readReviewPalette(): ReviewPalette {
  try {
    return window.localStorage.getItem("artifact-review-palette") === "borderloop" ? "borderloop" : "reader";
  } catch {
    return "reader";
  }
}

/** Apply the shell palette without navigating or reloading artifact frames. */
export function applyReviewPalette(palette: ReviewPalette, persist = true): void {
  document.documentElement.classList.toggle("theme-reader", palette === "reader");
  document.documentElement.classList.toggle("theme-borderloop", palette === "borderloop");
  if (!persist) return;
  try {
    window.localStorage.setItem("artifact-review-palette", palette);
  } catch {
    // The active palette still applies when browser storage is unavailable.
  }
}
