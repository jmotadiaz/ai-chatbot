const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How old a listing row is, in the compact form the histories show next to the
 * title: minutes and hours while the difference is still meaningful, then days,
 * then the calendar date. `now` is injectable so the rule is testable.
 */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
