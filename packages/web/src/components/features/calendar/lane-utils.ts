import type {CalendarEvent} from './types';
import {dateToKey, parseLocalDate} from './day-cell';

/**
 * Assigns a "lane" number to each event so that overlapping events occupy
 * different horizontal (visual) rows within a calendar day cell.
 *
 * Algorithm (hazel-admin greedy style):
 *
 * 1. **Sort** events by start-date ASC → longer-duration-first DESC →
 *    startTime ASC → id (stability).
 * 2. **Greedy lane assignment** — for each event, pick the smallest lane
 *    number that is not already occupied by a date-overlapping event.
 *    "Occupied" means: same lane AND the stored event's [start, end] range
 *    overlaps the new event's range (start ≤ candidateEnd && end ≥ candidateStart).
 * 3. **Spread** multi-day events across all dates they span so each date
 *    cell can look up its events in O(1).
 * 4. **Sort each day's event list** by lane ASC then startTime ASC for
 *    deterministic rendering order.
 *
 * @param events - Array of calendar events (including virtual recurrence instances).
 * @returns
 *   - `eventsByDate` — Map<dateKey, CalendarEvent[]> for O(1) per-cell lookup.
 *   - `eventLaneMap` — Map<eventId, laneNumber> for rendering position.
 */
export function computeEventLanes(events: CalendarEvent[]): {
  eventsByDate: Map<string, CalendarEvent[]>;
  eventLaneMap: Map<string, number>;
} {
  // 1. Sort for stable greedy assignment
  const sorted = [...events].sort((a, b) => {
    const startCmp = a.startDate.localeCompare(b.startDate);
    if (startCmp !== 0) return startCmp;
    const endCmp = b.endDate.localeCompare(a.endDate);
    if (endCmp !== 0) return endCmp;
    const aTime = a.startTime ?? '';
    const bTime = b.startTime ?? '';
    const timeCmp = aTime.localeCompare(bTime);
    if (timeCmp !== 0) return timeCmp;
    return a.id.localeCompare(b.id);
  });

  // 2. Greedy lane assignment
  const laneMap = new Map<string, number>();
  const occupied: { start: string; end: string; lane: number }[] = [];

  for (const event of sorted) {
    let lane = 0;
    while (
      occupied.some(
        (o) => o.lane === lane && o.start <= event.endDate && o.end >= event.startDate,
      )
    ) {
      lane++;
    }
    laneMap.set(event.id, lane);
    occupied.push({ start: event.startDate, end: event.endDate, lane });
  }

  // 3. Spread multi-day events into each date they cover
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const current = parseLocalDate(event.startDate);
    const end = parseLocalDate(event.endDate);
    while (current <= end) {
      const key = dateToKey(current);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
      current.setDate(current.getDate() + 1);
    }
  }

  // 4. Sort each day's events by lane then by startTime
  for (const list of map.values()) {
    list.sort((a, b) => {
      const laneCmp = (laneMap.get(a.id) ?? 0) - (laneMap.get(b.id) ?? 0);
      if (laneCmp !== 0) return laneCmp;
      const aTime = a.startTime ?? '';
      const bTime = b.startTime ?? '';
      return aTime.localeCompare(bTime);
    });
  }

  return { eventsByDate: map, eventLaneMap: laneMap };
}
