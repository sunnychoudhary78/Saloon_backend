const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function localDateString(timezone = DEFAULT_TIMEZONE, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function localTimeString(timezone = DEFAULT_TIMEZONE, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  const second = parts.find((p) => p.type === 'second')?.value || '00';
  return `${hour}:${minute}:${second}`;
}

function parseDateOnly(value, timezone = DEFAULT_TIMEZONE) {
  if (!value) return localDateString(timezone);
  const str = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error('date must be YYYY-MM-DD');
  }
  return str;
}

function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dayUtcBounds(dateStr, timezone = DEFAULT_TIMEZONE) {
  const offsetMatch = timezone === 'Asia/Kolkata' ? '+05:30' : null;
  if (offsetMatch) {
    return {
      start: new Date(`${dateStr}T00:00:00${offsetMatch}`),
      end: new Date(`${dateStr}T23:59:59.999${offsetMatch}`),
    };
  }
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(`${dateStr}T23:59:59.999Z`);
  return { start, end };
}

function periodBounds(fromDate, toDate, timezone = DEFAULT_TIMEZONE) {
  const start = dayUtcBounds(fromDate, timezone).start;
  const end = dayUtcBounds(toDate, timezone).end;
  return { start, end };
}

module.exports = {
  DEFAULT_TIMEZONE,
  localDateString,
  localTimeString,
  parseDateOnly,
  addDaysToDateString,
  dayUtcBounds,
  periodBounds,
};
