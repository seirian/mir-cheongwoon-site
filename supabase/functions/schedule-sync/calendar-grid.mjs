/** Resolve only the two known Sunday-first, six-week template conventions.
 * All 42 displayed day labels must match before any event can be written.
 * @param {number} year
 * @param {number} month 1-based month
 * @param {string[][]} days Six rows, seven already-normalized day labels each
 * @returns {Date}
 */
export function resolveCalendarGridStart(year, month, days) {
  const invalid = () => new Error('calendar_layout_changed');
  if (!Number.isInteger(year) || year < 100 || year > 9999
      || !Number.isInteger(month) || month < 1 || month > 12
      || !Array.isArray(days) || days.length !== 6
      || days.some((row) => !Array.isArray(row) || row.length !== 7
        || row.some((day) => typeof day !== 'string' || !/^(?:[1-9]|[12][0-9]|3[01])$/.test(day)))) {
    throw invalid();
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const normal = Date.UTC(year, month - 1, 1 - first.getUTCDay());
  const candidates = [normal];
  // The source template may include the previous full week when day 1 is Sunday.
  // Do not accept arbitrary shifts for any other month or relax date checking.
  if (first.getUTCDay() === 0) candidates.push(normal - 7 * 86400000);
  const matches = candidates.filter((start) => days.every((row, week) => row.every((day, column) =>
    day === String(new Date(start + (week * 7 + column) * 86400000).getUTCDate()))));
  if (matches.length !== 1) throw invalid();
  const start = matches[0];
  const last = Date.UTC(year, month, 0);
  if (start > first.getTime() || start + 41 * 86400000 < last) throw invalid();
  return new Date(start);
}
