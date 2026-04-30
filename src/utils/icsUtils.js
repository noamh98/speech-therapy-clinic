// src/utils/icsUtils.js

/**
 * Export appointments to ICS (iCal) format
 * @param {Array} appointments - array of appointment objects
 * @param {Array} patients - array of patient objects (for name lookup)
 * @returns {string} ICS file content
 */
export function exportToICS(appointments, patients) {
  const patientMap = Object.fromEntries(patients.map(p => [p.id, p.full_name]));

  const events = appointments
    .filter(a => a.status === 'scheduled')
    .map(a => {
      const patientName = patientMap[a.patient_id] || 'מטופל';
      const [y, mo, d] = a.date.split('-');
      const [h, mi] = (a.start_time || '09:00').split(':');
      const durationMins = a.duration_minutes || 45;

      const startDT = `${y}${mo}${d}T${h}${mi}00`;
      const endDate = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi) + durationMins);
      const endDT = endDate.toISOString().replace(/[-:]/g, '').slice(0, 15);

      const uid = a.id || crypto.randomUUID();

      return [
        'BEGIN:VEVENT',
        `UID:${uid}@clinicapp`,
        `DTSTART:${startDT}`,
        `DTEND:${endDT}`,
        `SUMMARY:טיפול – ${patientName}`,
        `DESCRIPTION:מטופל: ${patientName}\\nמשך: ${durationMins} דקות`,
        `STATUS:CONFIRMED`,
        'END:VEVENT',
      ].join('\r\n');
    });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClinicApp//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Parse ICS file content into appointment-like objects
 * @param {string} icsContent
 * @returns {Array} parsed events
 */
export function parseICS(icsContent) {
  const events = [];
  const lines = icsContent.replace(/\r\n/g, '\n').split('\n');

  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':');
      if (key === 'DTSTART') {
        // Parse YYYYMMDDTHHMMSS
        current.date = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`;
        current.start_time = `${value.slice(9,11)}:${value.slice(11,13)}`;
      } else if (key === 'SUMMARY') {
        // Try to extract patient name after "–" or just use the whole summary
        const parts = value.split('–');
        current.summary = value;
        current.patient_name_hint = parts.length > 1 ? parts[1].trim() : value.trim();
      } else if (key === 'DESCRIPTION') {
        current.description = value.replace(/\\n/g, '\n');
      } else if (key === 'UID') {
        current.uid = value;
      }
    }
  }
  return events;
}

/** Trigger browser download of a text file */
export function downloadFile(content, filename, mimeType = 'text/calendar') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
