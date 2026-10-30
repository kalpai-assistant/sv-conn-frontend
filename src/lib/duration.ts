/**
 * The duration label on service cards, the service sheet, the variant picker
 * and the cart (SVC-400 follow-up).
 *
 * Short jobs keep the "60 mins" wording every service has always shown. From
 * two hours up the label switches to hours, so a full-day job like room
 * painting (480) reads "8 hrs" rather than "480 mins".
 */
export function formatDuration(minutes: number): string {
  if (minutes < 120) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hrs} hrs` : `${hrs} hrs ${mins} mins`;
}
