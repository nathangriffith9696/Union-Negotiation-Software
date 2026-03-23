export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Date-only or timestamp strings; omits time of day. */
export function formatOptionalDate(value: string | null): string | null {
  if (!value) return null;
  const t = value.includes("T") ? value : `${value}T12:00:00.000Z`;
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
      new Date(t)
    );
  } catch {
    return value;
  }
}

export function formatStatus(status: string) {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function normalizeByteSize(value: number | string): number {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded =
    i === 0 || v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded} ${units[i]}`;
}
