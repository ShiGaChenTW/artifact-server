import {useState} from "react";

import {readerText} from "@/i18n/messages/reader";
import {applyReviewPalette, readReviewPalette, type ReviewPalette} from "./review-palette.ts";

/** Available in every area's existing top bar, including Settings. */
export function PaletteSelect() {
  const [palette, setPalette] = useState<ReviewPalette>(readReviewPalette);
  return (
    <select
      aria-label={readerText.palette.label}
      className="as-bar-button as-palette-select"
      onChange={(event) => {
        const next = event.currentTarget.value === "borderloop" ? "borderloop" : "reader";
        applyReviewPalette(next);
        setPalette(next);
      }}
      title={readerText.palette.label}
      value={palette}
    >
      <option value="reader">{readerText.palette.reader}</option>
      <option value="borderloop">Borderloop</option>
    </select>
  );
}
