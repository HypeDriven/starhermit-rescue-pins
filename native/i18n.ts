// Localization: assets/strings.json (generated from the browser build's tables,
// English text as the keys; en-GB, es-ES and fr-CA list only their differences)
// on the engine's strings, which follow the interface language the runtime
// reports (the player's choice in Options › Language, else the account's
// preferred language or the device's) and own the locale fallback and the
// account strings (`starhermit.*`). Every string is drawn through T() each
// frame, so a change shows on the next frame and never restarts the stage.
import { strings } from "starhermit:engine";
import * as ui from "starhermit:ui";

strings.load("assets/strings.json");
strings.defaultLocale = "en-US";
ui.setLanguage(strings.locale);
strings.onChange((locale) => ui.setLanguage(locale));

export type Vars = Record<string, string | number>;
/** An English source string in the player's language; `{name}` placeholders from vars. */
export function T(key: string, vars?: Vars | null): string { return strings.t(key, vars ?? undefined); }
/** Marks an English key that is translated with T() where it is shown. */
export const N = (s: string): string => s;
/** The account strings (signIn, invite, inviteCopied, inviteLink, signedOut, leaderboardPosting, leaderboardRank, leaderboardPosted, leaderboardNotPosted). */
export function S(key: string, vars?: Vars): string { return strings.t(`starhermit.${key}`, vars); }
/** ui.js levelLabel: display names for generated level names ("Emerald Keep 3", "Daily 2026-10-17"). */
export function levelLabel(level: { name?: string; daily?: number; excluded?: boolean } | null): string {
  if (!level) return "";
  if (level.excluded) return T("Daily (excluded)");
  if (level.daily != null) return T("Daily {date}", { date: new Date(level.daily * 86400000).toISOString().slice(0, 10) });
  const m = /^(.*) (\d+)$/.exec(level.name || "");
  return m ? `${T(m[1]!)} ${m[2]}` : (level.name || "");
}
