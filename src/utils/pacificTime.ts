const PACIFIC_TZ = "America/Los_Angeles";

type PacificParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const PACIFIC_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const PACIFIC_SHORT_OFFSET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  timeZoneName: "shortOffset",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const PACIFIC_SHORT_NAME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  timeZoneName: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getPacificParts(date: Date): PacificParts {
  const parts = PACIFIC_PARTS_FMT.formatToParts(date);
  const map = new Map<string, string>();
  for (const p of parts) {
    if (p.type === "literal") continue;
    map.set(p.type, p.value);
  }
  return {
    year: map.get("year") ?? "0000",
    month: map.get("month") ?? "00",
    day: map.get("day") ?? "00",
    hour: map.get("hour") ?? "00",
    minute: map.get("minute") ?? "00",
    second: map.get("second") ?? "00",
  };
}

function getPacificOffset(date: Date): string {
  const parts = PACIFIC_SHORT_OFFSET_FMT.formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const m = raw.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return "-08:00";
  const sign = m[1] === "-" ? "-" : "+";
  const hh = m[2]!.padStart(2, "0");
  const mm = (m[3] ?? "00").padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function getPacificAbbrev(date: Date): string {
  const parts = PACIFIC_SHORT_NAME_FMT.formatToParts(date);
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "PT";
  const cleaned = raw.replace(/[^A-Z]/g, "");
  return cleaned.length > 0 ? cleaned : "PT";
}

export function pacificIsoString(date = new Date()): string {
  const p = getPacificParts(date);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  const offset = getPacificOffset(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${ms}${offset}`;
}

export function pacificFileStamp(date = new Date()): string {
  const p = getPacificParts(date);
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  const tz = getPacificAbbrev(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}-${ms}${tz}`;
}

