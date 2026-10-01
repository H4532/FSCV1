/** Hotel local time. Saudi Arabia is UTC+3 with no daylight saving. */
export const HOTEL_TZ = "Asia/Riyadh";
const OFFSET = "+03:00";

export function localToIso(date: string, time: string) {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}${OFFSET}`).toISOString();
}

export function minusMinutes(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() - minutes * 60000).toISOString();
}

export function fmtDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00${OFFSET}` : d) : d;
  return dt.toLocaleDateString("en-GB", { timeZone: HOTEL_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", {
    timeZone: HOTEL_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function fmtTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : "";
}

/** Today's date in hotel time as YYYY-MM-DD */
export function hotelToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: HOTEL_TZ });
}

/** Value for <input type="datetime-local"> in hotel time */
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 3 * 3600000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string) {
  return v ? new Date(`${v}:00${OFFSET}`).toISOString() : null;
}
