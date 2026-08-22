import { describe, it, expect } from "vitest";
import { generateIcsCalendarFile } from "@/domain/ics/generator";

describe("iCalendar .ics RFC 5545 Generator", () => {
  it("produces compliant VCALENDAR formatted export", () => {
    const ics = generateIcsCalendarFile({
      planId: "plan_test_01",
      venueName: "Tipo Pasta Bar",
      venueAddress: "28 Aliwal Street, Singapore",
      date: "2026-09-05",
      startTime: "19:30",
      mealType: "dinner",
      organizerName: "Maya Chen",
      mapsUrl: "https://www.openstreetmap.org/?mlat=1.3032&mlon=103.8596",
      bookingUrl: "https://www.tipo.sg",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("SUMMARY:🍽️ Tipo Pasta Bar (dinner)");
    expect(ics).toContain("DTSTART;TZID=Asia/Singapore:20260905T193000");
    expect(ics).toContain("LOCATION:28 Aliwal Street\\, Singapore");
    expect(ics).toContain("END:VCALENDAR");
  });
});
