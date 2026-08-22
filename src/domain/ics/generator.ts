export interface IcsEventOptions {
  planId: string;
  venueName: string;
  venueAddress: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  mealType: string;
  organizerName: string;
  mapsUrl?: string | null;
  bookingUrl?: string | null;
}

function formatIcsDateTime(dateStr: string, timeStr: string, durationHours = 2): { start: string; end: string } {
  // Asia/Singapore is UTC+8
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  const pad = (n: number) => String(n).padStart(2, "0");

  const startFormatted = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;

  const endHour = (hour + durationHours) % 24;
  const endDay = hour + durationHours >= 24 ? day + 1 : day;
  const endFormatted = `${year}${pad(month)}${pad(endDay)}T${pad(endHour)}${pad(minute)}00`;

  return { start: startFormatted, end: endFormatted };
}

export function generateIcsCalendarFile(options: IcsEventOptions): string {
  const { planId, venueName, venueAddress, date, startTime, mealType, organizerName, mapsUrl, bookingUrl } = options;
  const { start, end } = formatIcsDateTime(date, startTime, mealType === "coffee" || mealType === "drinks" ? 1.5 : 2);
  const uid = `hangtime-${planId}@hangtime.app`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const descriptionLines = [
    `Hangtime: ${mealType.toUpperCase()} with ${organizerName}`,
    `Venue: ${venueName}`,
    `Address: ${venueAddress}`,
    mapsUrl ? `Directions: ${mapsUrl}` : "",
    bookingUrl ? `Reservations: ${bookingUrl}` : "",
    `Planned on Hangtime Singapore`,
  ].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hangtime//Social Planning Singapore//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Asia/Singapore:${start}`,
    `DTEND;TZID=Asia/Singapore:${end}`,
    `SUMMARY:🍽️ ${venueName} (${mealType})`,
    `DESCRIPTION:${descriptionLines}`,
    `LOCATION:${venueAddress.replace(/,/g, "\\,")}`,
    mapsUrl ? `URL:${mapsUrl}` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
