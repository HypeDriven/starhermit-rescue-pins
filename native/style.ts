// The look of the rails, tray, coach, panels and screens: the browser build's
// index.html <style>, rewritten class-based in tools/ui-style.css and
// converted once with `starhermit css` into assets/ui-style.json (`npm run
// css`), registered at start with the theme the runtime's own widgets
// (scroll bars, focus rings, selects, sliders) take. The runtime's high
// contrast option is the old body.hc token set.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

type Tokens = Record<string, string>;
const BASE: Tokens = {
  bg: "#0e1115", panel: "#1b2029", edge: "#3f4a5c", fg: "#f3f6fa", dim: "#b9c3d0",
  accent: "#8cf0b9", "accent-ink": "#0c2418", danger: "#ff7d70", "danger-ink": "#2a0c08",
  btn: "#313b4c", "btn-hi": "#465268", "btn-edge": "#5d6a80", focus: "#ffd66b",
};
/** body.hc. */
const CONTRAST: Tokens = {
  bg: "#000000", panel: "#000000", edge: "#ffffff", fg: "#ffffff", dim: "#e6e6e6", accent: "#00ff88", "accent-ink": "#000000",
  btn: "#000000", "btn-hi": "#333333", "btn-edge": "#ffffff", danger: "#ff5540", "danger-ink": "#000000", focus: "#ffff00",
};

let current: Tokens = { ...BASE };
export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setFont({ family: "sans-serif" });
  ui.setTheme({
    fontSize: 16, smallSize: 13.6, headingSize: 24, padding: 8, spacing: 8, radius: 10,
    text: BASE.fg!, muted: BASE.dim!, panel: BASE.panel!, control: BASE.btn!, hovered: BASE["btn-hi"]!,
    pressed: "#56627a", field: BASE.btn!, accent: BASE.accent!, focus: BASE.focus!, outline: BASE["btn-edge"]!,
  });
  ui.setTokens(css.tokens);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: "$fg" } },
    paragraph: { text: { color: "$fg" } },
    heading: { text: { color: "$fg" } },
    widget: { focusRing: { color: "$focus", width: 3, offset: 2 } },
    scrollArea: { parts: { bar: { background: "$btn-edge", radius: 4 } } },
    tooltip: { background: "$panel", text: { color: "$fg" }, radius: 6, padding: 6 },
    // .rp-overlay: rgba(4, 6, 9, 0.62) behind the panels.
    dialog: { background: "#00000000", padding: 0, parts: { backdrop: { background: "#0406099e" } } },
  });
  key = "";
  applyTokens(false);
}

let key = "";
/** The base or high-contrast tokens (cheap when unchanged). */
export function applyTokens(highContrast: boolean): void {
  const k = String(highContrast);
  if (k === key) return;
  key = k;
  current = { ...BASE, ...(highContrast ? CONTRAST : {}) };
  ui.setTokens(current);
  ui.setTheme({
    text: current.fg!, muted: current.dim!, panel: current.panel!, control: current.btn!, hovered: current["btn-hi"]!,
    field: current.btn!, accent: current.accent!, focus: current.focus!, outline: current["btn-edge"]!,
  });
}
/** A token's current colour (for draw calls, which take real colours). */
export function token(name: string): string { return current[name] ?? "#000000"; }
