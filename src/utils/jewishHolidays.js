// src/utils/jewishHolidays.js
// Jewish holidays for 2025–2035 (Gregorian dates)

export const JEWISH_HOLIDAYS = [
  // 2025
  { date: '2025-09-22', name: 'ראש השנה' },
  { date: '2025-09-23', name: 'ראש השנה (יום ב)' },
  { date: '2025-10-01', name: 'יום כיפור' },
  { date: '2025-10-06', name: 'סוכות' },
  { date: '2025-10-13', name: 'שמחת תורה' },
  { date: '2025-12-14', name: 'חנוכה' },
  // 2026
  { date: '2026-03-03', name: 'פורים' },
  { date: '2026-04-01', name: 'פסח' },
  { date: '2026-04-02', name: 'פסח (יום ב)' },
  { date: '2026-04-07', name: 'חול המועד פסח' },
  { date: '2026-04-08', name: 'שביעי של פסח' },
  { date: '2026-04-09', name: 'אחרון של פסח' },
  { date: '2026-04-22', name: 'יום העצמאות' },
  { date: '2026-05-21', name: 'שבועות' },
  { date: '2026-09-11', name: 'ראש השנה' },
  { date: '2026-09-12', name: 'ראש השנה (יום ב)' },
  { date: '2026-09-20', name: 'יום כיפור' },
  { date: '2026-09-25', name: 'סוכות' },
  { date: '2026-10-02', name: 'שמחת תורה' },
  { date: '2026-12-04', name: 'חנוכה' },
  // 2027
  { date: '2027-03-23', name: 'פורים' },
  { date: '2027-04-21', name: 'פסח' },
  { date: '2027-05-09', name: 'יום העצמאות' },
  { date: '2027-06-11', name: 'שבועות' },
  { date: '2027-10-01', name: 'ראש השנה' },
  { date: '2027-10-10', name: 'יום כיפור' },
  { date: '2027-10-15', name: 'סוכות' },
  { date: '2027-10-22', name: 'שמחת תורה' },
  // 2028
  { date: '2028-03-12', name: 'פורים' },
  { date: '2028-04-10', name: 'פסח' },
  { date: '2028-04-28', name: 'יום העצמאות' },
  { date: '2028-05-31', name: 'שבועות' },
  { date: '2028-09-20', name: 'ראש השנה' },
  { date: '2028-09-29', name: 'יום כיפור' },
  { date: '2028-10-04', name: 'סוכות' },
  // 2029
  { date: '2029-03-01', name: 'פורים' },
  { date: '2029-03-29', name: 'פסח' },
  { date: '2029-04-17', name: 'יום העצמאות' },
  { date: '2029-05-19', name: 'שבועות' },
  { date: '2029-09-09', name: 'ראש השנה' },
  { date: '2029-09-18', name: 'יום כיפור' },
  { date: '2029-09-23', name: 'סוכות' },
  // 2030
  { date: '2030-03-19', name: 'פורים' },
  { date: '2030-04-17', name: 'פסח' },
  { date: '2030-05-06', name: 'יום העצמאות' },
  { date: '2030-06-07', name: 'שבועות' },
  { date: '2030-09-27', name: 'ראש השנה' },
  { date: '2030-10-06', name: 'יום כיפור' },
  { date: '2030-10-11', name: 'סוכות' },
];

/** Returns holiday name if date is a Jewish holiday, else null */
export function getHolidayName(dateStr) {
  const h = JEWISH_HOLIDAYS.find(h => h.date === dateStr);
  return h ? h.name : null;
}

/** Returns true if the date string is a Jewish holiday */
export function isJewishHoliday(dateStr) {
  return JEWISH_HOLIDAYS.some(h => h.date === dateStr);
}
