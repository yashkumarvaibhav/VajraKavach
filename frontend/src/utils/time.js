/**
 * Parse a backend datetime string as UTC.
 * Backend sends naive ISO datetimes (e.g. "2026-02-26T12:53:13.332044") without
 * a trailing 'Z', so JavaScript's new Date() treats them as local time instead of UTC.
 * This helper ensures they are parsed as UTC.
 */
export function utcDate(s) {
  if (!s) return new Date();
  const str = String(s);
  return new Date(str.endsWith('Z') ? str : str + 'Z');
}

/** Format a backend datetime to IST time string (HH:MM) */
export function toIST(s, opts = {}) {
  return utcDate(s).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    ...opts,
  });
}

/** Format a backend datetime to IST full date+time string */
export function toISTDateTime(s) {
  return utcDate(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/** Format a backend datetime to IST date string */
export function toISTDate(s) {
  return utcDate(s).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}
