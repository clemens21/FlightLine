/*
 * Builds the clock and calendar payload from company time, schedules, contracts, maintenance, and recurring obligations.
 * This is the server-side source of truth for everything shown in the shell clock popover.
 * It intentionally stays informational: this file projects upcoming events into a clean calendar/agenda shape, while
 * the authoritative state still lives in the underlying schedule, contract, maintenance, and finance tables.
 */

import type { FlightLineBackend } from "../application/backend-service.js";
import { loadCompanyContracts } from "../application/queries/company-contracts.js";
import { loadActiveCompanyContext } from "../application/queries/company-state.js";
import { loadMaintenanceTasks } from "../application/queries/maintenance-tasks.js";
import { loadAircraftSchedules } from "../application/queries/schedule-state.js";
import type { SqliteFileDatabase } from "../infrastructure/persistence/sqlite/sqlite-file-database.js";
import type { AirportReferenceRepository } from "../infrastructure/reference/airport-reference.js";
import type { ClockPanelPayload, CalendarAgendaEventView, CalendarDayView } from "./clock-calendar-model.js";

interface RecurringObligationRow extends Record<string, unknown> {
  recurringObligationId: string;
  obligationType: string;
  amount: number;
  nextDueAtUtc: string;
  status: string;
}

interface CalendarEventAccumulator extends CalendarAgendaEventView {}
interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

interface LocalTimeParts {
  hour: number;
  minute: number;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Builds the full clock popover payload for the currently visible calendar month plus the selected day's agenda.
export async function loadClockPanelPayload(
  backend: FlightLineBackend,
  saveId: string,
  selectedLocalDate?: string,
): Promise<ClockPanelPayload | null> {
  return backend.withExistingSaveDatabase(saveId, (context) => {
    const companyContext = loadActiveCompanyContext(context.saveDatabase, saveId);
    if (!companyContext) {
      return null;
    }

    const airportReference = backend.getAirportReference();
    const timeZone = resolveCompanyTimeZone(airportReference, companyContext.homeBaseAirportId);
    const currentTimeUtc = companyContext.currentTimeUtc;
    const currentLocalDate = getLocalDateString(currentTimeUtc, timeZone);
    const normalizedSelectedDate = isValidLocalDate(selectedLocalDate) ? selectedLocalDate : currentLocalDate;
    const monthAnchorDate = normalizeMonthAnchor(normalizedSelectedDate);
    const gridDates = buildCalendarGridDates(monthAnchorDate);
    const rangeStartLocalDate = gridDates[0] ?? monthAnchorDate;
    const rangeEndLocalDate = gridDates[gridDates.length - 1] ?? monthAnchorDate;

    const nextEventSearchEndLocalDate = addDaysToLocalDate(currentLocalDate, 365);

    const events = loadCalendarEvents(
      context.saveDatabase,
      saveId,
      companyContext.companyId,
      currentTimeUtc,
      timeZone,
      airportReference,
      rangeStartLocalDate,
      rangeEndLocalDate,
    );
    const upcomingEvents = loadCalendarEvents(
      context.saveDatabase,
      saveId,
      companyContext.companyId,
      currentTimeUtc,
      timeZone,
      airportReference,
      currentLocalDate,
      nextEventSearchEndLocalDate,
    );

    const eventsByLocalDate = new Map<string, CalendarAgendaEventView[]>();
    for (const event of events) {
      const bucket = eventsByLocalDate.get(event.localDate) ?? [];
      bucket.push(event);
      eventsByLocalDate.set(event.localDate, bucket);
    }

    const monthLabel = formatMonthLabel(monthAnchorDate);
    const selectedDateLabel = formatSelectedDateLabel(normalizedSelectedDate, timeZone);
    const currentLocalDateLabel = formatCurrentLocalDateLabel(currentTimeUtc, timeZone);
    const currentLocalTimeLabel = formatCurrentLocalTimeLabel(currentTimeUtc, timeZone);
    const utcTimeLabel = formatUtcTimeLabel(currentTimeUtc);
    const agenda = [...(eventsByLocalDate.get(normalizedSelectedDate) ?? [])].sort((left, right) => Date.parse(left.startsAtUtc) - Date.parse(right.startsAtUtc));
    const nextCriticalEvent = events
      .filter((event) => event.severity === "critical" && Date.parse(event.startsAtUtc) >= Date.parse(currentTimeUtc))
      .sort((left, right) => Date.parse(left.startsAtUtc) - Date.parse(right.startsAtUtc))[0];
    const nextUpcomingEvent = upcomingEvents
      .filter((event) => !["completed", "cancelled", "missed"].includes(event.status))
      .filter((event) => Date.parse(event.startsAtUtc) > Date.parse(currentTimeUtc))
      .sort((left, right) => Date.parse(left.startsAtUtc) - Date.parse(right.startsAtUtc))[0];

    const days = gridDates.map((localDate) => buildCalendarDayView(
      localDate,
      monthAnchorDate,
      currentLocalDate,
      normalizedSelectedDate,
      currentTimeUtc,
      timeZone,
      eventsByLocalDate.get(localDate) ?? [],
    ));
    const simTo0600WarningEvents = collectAdvanceWarnings(
      events,
      currentTimeUtc,
      resolveCalendarAnchorUtc(normalizedSelectedDate, "06:00", timeZone),
    );

    return {
      saveId,
      timeZone,
      currentTimeUtc,
      currentLocalDate,
      currentLocalDateLabel,
      currentLocalTimeLabel,
      utcTimeLabel,
      selectedLocalDate: normalizedSelectedDate,
      selectedDateLabel,
      monthLabel,
      days,
      agenda,
      quickActions: {
        simTo0600: {
          enabled: canAdvanceToLocalAnchor(currentTimeUtc, normalizedSelectedDate, "06:00", timeZone),
          localDate: normalizedSelectedDate,
          label: "Sim to selected morning",
          warningCount: simTo0600WarningEvents.length,
          warningEvents: simTo0600WarningEvents,
        },
        nextEvent: {
          enabled: Boolean(nextUpcomingEvent),
          label: "Skip to next event",
          localDate: nextUpcomingEvent?.localDate,
          targetTimeUtc: nextUpcomingEvent?.startsAtUtc,
          event: nextUpcomingEvent,
        },
      },
      nextCriticalEvent,
    } satisfies ClockPanelPayload;
  });
}

// Local-anchor helpers convert home-base local calendar actions back into UTC timestamps for simulation commands.
// Converts a local calendar day and clock time into the UTC anchor used by the simulation backend.
export function resolveCalendarAnchorUtc(localDate: string, localTime: string, timeZone: string): string {
  const { year, month, day } = parseLocalDateParts(localDate);
  const { hour, minute } = parseLocalTimeParts(localTime);

  let guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guessUtcMs), timeZone);
    const nextGuessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60_000;
    if (nextGuessUtcMs === guessUtcMs) {
      break;
    }
    guessUtcMs = nextGuessUtcMs;
  }

  return new Date(guessUtcMs).toISOString();
}

// Guards calendar jump actions so the UI only offers "simulate to" anchors that still lie in the future.
export function canAdvanceToLocalAnchor(currentTimeUtc: string, localDate: string, localTime: string, timeZone: string): boolean {
  if (!isValidLocalDate(localDate)) {
    return false;
  }

  const targetUtc = resolveCalendarAnchorUtc(localDate, localTime, timeZone);
  return Date.parse(targetUtc) > Date.parse(currentTimeUtc);
}

function collectAdvanceWarnings(
  events: CalendarAgendaEventView[],
  currentTimeUtc: string,
  targetTimeUtc: string,
): CalendarAgendaEventView[] {
  const currentMs = Date.parse(currentTimeUtc);
  const targetMs = Date.parse(targetTimeUtc);

  if (Number.isNaN(currentMs) || Number.isNaN(targetMs) || targetMs <= currentMs) {
    return [];
  }

  return events
    .filter((event) => !["completed", "cancelled", "missed"].includes(event.status))
    .filter((event) => {
      const eventMs = Date.parse(event.startsAtUtc);
      return !Number.isNaN(eventMs) && eventMs > currentMs && eventMs <= targetMs;
    })
    .sort((left, right) => Date.parse(left.startsAtUtc) - Date.parse(right.startsAtUtc));
}

function buildCalendarDayView(
  localDate: string,
  monthAnchorDate: string,
  currentLocalDate: string,
  selectedLocalDate: string,
  currentTimeUtc: string,
  timeZone: string,
  events: CalendarAgendaEventView[],
): CalendarDayView {
  return {
    localDate,
    dayNumber: Number.parseInt(localDate.slice(8, 10), 10),
    isCurrentMonth: localDate.slice(0, 7) === monthAnchorDate.slice(0, 7),
    isToday: localDate === currentLocalDate,
    isSelected: localDate === selectedLocalDate,
    eventCount: events.length,
    warningCount: events.filter((event) => event.severity === "warning").length,
    criticalCount: events.filter((event) => event.severity === "critical").length,
    canSimTo0600: canAdvanceToLocalAnchor(currentTimeUtc, localDate, "06:00", timeZone),
  };
}

// Event synthesis merges contracts, dispatch, maintenance, and recurring finance into one agenda vocabulary.
function loadCalendarEvents(
  saveDatabase: SqliteFileDatabase,
  saveId: string,
  companyId: string,
  currentTimeUtc: string,
  timeZone: string,
  airportReference: AirportReferenceRepository,
  rangeStartLocalDate: string,
  rangeEndLocalDate: string,
): CalendarAgendaEventView[] {
  const events: CalendarEventAccumulator[] = [];
  const companyContracts = loadCompanyContracts(saveDatabase, saveId)?.contracts ?? [];
  const companyContractsById = new Map(companyContracts.map((contract) => [contract.companyContractId, contract]));
  const schedules = loadAircraftSchedules(saveDatabase, saveId);
  const maintenanceTasks = loadMaintenanceTasks(saveDatabase, saveId);
  const recurringObligations = loadRecurringObligations(saveDatabase, companyId);

  const airportIds = new Set<string>();
  for (const contract of companyContracts) {
    airportIds.add(contract.originAirportId);
    airportIds.add(contract.destinationAirportId);
  }
  for (const schedule of schedules) {
    for (const leg of schedule.legs) {
      airportIds.add(leg.originAirportId);
      airportIds.add(leg.destinationAirportId);
    }
  }

  const airportsByKey = airportReference.findAirportsByAirportKeys([...airportIds]);

  for (const contract of companyContracts) {
    if (!["accepted", "assigned", "active"].includes(contract.contractState)) {
      continue;
    }

    const localDate = getLocalDateString(contract.deadlineUtc, timeZone);
    if (!isLocalDateInRange(localDate, rangeStartLocalDate, rangeEndLocalDate)) {
      continue;
    }

    const origin = airportsByKey.get(contract.originAirportId.toUpperCase());
    const destination = airportsByKey.get(contract.destinationAirportId.toUpperCase());
    const routeLabel = `${origin?.identCode ?? contract.originAirportId} -> ${destination?.identCode ?? contract.destinationAirportId}`;
    events.push({
      calendarEventId: `contract:${contract.companyContractId}:deadline`,
      sourceType: "company_contract",
      sourceId: contract.companyContractId,
      eventType: "contract_deadline",
      category: "contracts",
      severity: severityForContractDeadline(currentTimeUtc, contract.deadlineUtc),
      startsAtUtc: contract.deadlineUtc,
      localDate,
      localTimeLabel: formatAgendaTimeLabel(contract.deadlineUtc, timeZone),
      title: "Contract Due",
      subtitle: `${routeLabel} | ${formatPayloadSummary(contract.volumeType, contract.passengerCount, contract.cargoWeightLb)}`,
      relatedTab: "contracts",
      status: deriveEventStatus(contract.deadlineUtc, currentTimeUtc, contract.contractState),
    });
  }

  for (const schedule of schedules) {
    for (const leg of schedule.legs) {
      const origin = airportsByKey.get(leg.originAirportId.toUpperCase());
      const destination = airportsByKey.get(leg.destinationAirportId.toUpperCase());
      const routeLabel = `${origin?.identCode ?? leg.originAirportId} -> ${destination?.identCode ?? leg.destinationAirportId}`;
      const linkedContracts = leg.linkedCompanyContractIds
        .map((companyContractId) => companyContractsById.get(companyContractId))
        .filter((contract): contract is NonNullable<typeof contract> => Boolean(contract));
      const legSubtitle = buildLegSubtitle(routeLabel, leg.legType, linkedContracts);
      const departureLocalDate = getLocalDateString(leg.plannedDepartureUtc, timeZone);
      if (isLocalDateInRange(departureLocalDate, rangeStartLocalDate, rangeEndLocalDate)) {
        events.push({
          calendarEventId: `leg:${leg.flightLegId}:departure`,
          sourceType: "flight_leg",
          sourceId: leg.flightLegId,
          eventType: "planned_departure",
          category: "dispatch",
          severity: severityForDeparture(currentTimeUtc, leg.plannedDepartureUtc),
          startsAtUtc: leg.plannedDepartureUtc,
          localDate: departureLocalDate,
          localTimeLabel: formatAgendaTimeLabel(leg.plannedDepartureUtc, timeZone),
          title: "Planned Departure",
          subtitle: legSubtitle,
          relatedTab: "dispatch",
          status: deriveLegEventStatus(leg.legState, leg.plannedDepartureUtc, currentTimeUtc),
        });
      }

      const arrivalLocalDate = getLocalDateString(leg.plannedArrivalUtc, timeZone);
      if (isLocalDateInRange(arrivalLocalDate, rangeStartLocalDate, rangeEndLocalDate)) {
        events.push({
          calendarEventId: `leg:${leg.flightLegId}:arrival`,
          sourceType: "flight_leg",
          sourceId: leg.flightLegId,
          eventType: "planned_arrival",
          category: "dispatch",
          severity: "normal",
          startsAtUtc: leg.plannedArrivalUtc,
          localDate: arrivalLocalDate,
          localTimeLabel: formatAgendaTimeLabel(leg.plannedArrivalUtc, timeZone),
          title: "Planned Arrival",
          subtitle: legSubtitle,
          relatedTab: "dispatch",
          status: deriveLegEventStatus(leg.legState, leg.plannedArrivalUtc, currentTimeUtc),
        });
      }
    }
  }

  for (const task of maintenanceTasks) {
    const startLocalDate = getLocalDateString(task.plannedStartUtc, timeZone);
    if (isLocalDateInRange(startLocalDate, rangeStartLocalDate, rangeEndLocalDate)) {
      events.push({
        calendarEventId: `maintenance:${task.maintenanceTaskId}:start`,
        sourceType: "maintenance_task",
        sourceId: task.maintenanceTaskId,
        eventType: "maintenance_start",
        category: "maintenance",
        severity: "warning",
        startsAtUtc: task.plannedStartUtc,
        localDate: startLocalDate,
        localTimeLabel: formatAgendaTimeLabel(task.plannedStartUtc, timeZone),
        title: "Maintenance Start",
        subtitle: `${task.registration} | ${task.maintenanceType.replaceAll("_", " ")}`,
        relatedTab: "aircraft",
        status: deriveTaskStatus(task.taskState, task.plannedStartUtc, currentTimeUtc),
      });
    }

    const endLocalDate = getLocalDateString(task.plannedEndUtc, timeZone);
    if (isLocalDateInRange(endLocalDate, rangeStartLocalDate, rangeEndLocalDate)) {
      events.push({
        calendarEventId: `maintenance:${task.maintenanceTaskId}:complete`,
        sourceType: "maintenance_task",
        sourceId: task.maintenanceTaskId,
        eventType: "maintenance_complete",
        category: "maintenance",
        severity: "normal",
        startsAtUtc: task.plannedEndUtc,
        localDate: endLocalDate,
        localTimeLabel: formatAgendaTimeLabel(task.plannedEndUtc, timeZone),
        title: "Maintenance Complete",
        subtitle: `${task.registration} | ${task.maintenanceType.replaceAll("_", " ")}`,
        relatedTab: "aircraft",
        status: deriveTaskStatus(task.taskState, task.plannedEndUtc, currentTimeUtc),
      });
    }
  }

  for (const obligation of recurringObligations) {
    const localDate = getLocalDateString(obligation.nextDueAtUtc, timeZone);
    if (!isLocalDateInRange(localDate, rangeStartLocalDate, rangeEndLocalDate)) {
      continue;
    }

    events.push({
      calendarEventId: `obligation:${obligation.recurringObligationId}:due`,
      sourceType: "recurring_obligation",
      sourceId: obligation.recurringObligationId,
      eventType: "payment_due",
      category: "finance",
      severity: severityForRecurringPayment(currentTimeUtc, obligation.nextDueAtUtc),
      startsAtUtc: obligation.nextDueAtUtc,
      localDate,
      localTimeLabel: formatAgendaTimeLabel(obligation.nextDueAtUtc, timeZone),
      title: "Payment Due",
      subtitle: `${obligation.obligationType.replaceAll("_", " ")} | ${formatMoney(obligation.amount)}`,
      relatedTab: "activity",
      status: Date.parse(obligation.nextDueAtUtc) < Date.parse(currentTimeUtc) ? "missed" : "upcoming",
    });
  }

  return events.sort((left, right) => Date.parse(left.startsAtUtc) - Date.parse(right.startsAtUtc));
}

// Severity and status helpers intentionally collapse several simulation tables into the smaller badge vocabulary shown in the popover.
function loadRecurringObligations(saveDatabase: SqliteFileDatabase, companyId: string): RecurringObligationRow[] {
  return saveDatabase.all<RecurringObligationRow>(
    `SELECT
      recurring_obligation_id AS recurringObligationId,
      obligation_type AS obligationType,
      amount AS amount,
      next_due_at_utc AS nextDueAtUtc,
      status AS status
    FROM recurring_obligation
    WHERE company_id = $company_id
      AND status = 'active'
    ORDER BY next_due_at_utc ASC`,
    { $company_id: companyId },
  );
}

function resolveCompanyTimeZone(airportReference: AirportReferenceRepository, homeBaseAirportId: string): string {
  return airportReference.findAirport(homeBaseAirportId)?.timezone ?? "UTC";
}

function severityForContractDeadline(currentTimeUtc: string, deadlineUtc: string): "critical" | "warning" {
  const hoursRemaining = (Date.parse(deadlineUtc) - Date.parse(currentTimeUtc)) / 3_600_000;
  return hoursRemaining <= 12 ? "critical" : "warning";
}

function severityForDeparture(currentTimeUtc: string, departureUtc: string): "warning" | "normal" {
  const hoursRemaining = (Date.parse(departureUtc) - Date.parse(currentTimeUtc)) / 3_600_000;
  return hoursRemaining <= 6 ? "warning" : "normal";
}

function severityForRecurringPayment(currentTimeUtc: string, dueUtc: string): "critical" | "warning" {
  const hoursRemaining = (Date.parse(dueUtc) - Date.parse(currentTimeUtc)) / 3_600_000;
  return hoursRemaining <= 24 ? "critical" : "warning";
}

function deriveEventStatus(startsAtUtc: string, currentTimeUtc: string, contractState: string): "upcoming" | "in_progress" | "completed" | "missed" | "cancelled" {
  if (contractState === "cancelled") {
    return "cancelled";
  }
  if (["completed", "late_completed"].includes(contractState)) {
    return "completed";
  }
  if (contractState === "failed") {
    return "missed";
  }
  return Date.parse(startsAtUtc) < Date.parse(currentTimeUtc) ? "missed" : "upcoming";
}

function deriveLegEventStatus(legState: string, startsAtUtc: string, currentTimeUtc: string): "upcoming" | "in_progress" | "completed" | "missed" | "cancelled" {
  if (["completed", "arrived"].includes(legState)) {
    return "completed";
  }
  if (["cancelled", "skipped"].includes(legState)) {
    return "cancelled";
  }
  if (["in_flight", "departed"].includes(legState)) {
    return "in_progress";
  }
  return Date.parse(startsAtUtc) < Date.parse(currentTimeUtc) ? "missed" : "upcoming";
}

function deriveTaskStatus(taskState: string, startsAtUtc: string, currentTimeUtc: string): "upcoming" | "in_progress" | "completed" | "missed" | "cancelled" {
  if (taskState === "completed") {
    return "completed";
  }
  if (taskState === "in_progress") {
    return "in_progress";
  }
  return Date.parse(startsAtUtc) < Date.parse(currentTimeUtc) ? "missed" : "upcoming";
}

function formatPayloadSummary(volumeType: "passenger" | "cargo", passengerCount: number | undefined, cargoWeightLb: number | undefined): string {
  return volumeType === "cargo"
    ? `${formatNumber(cargoWeightLb ?? 0)} lb cargo`
    : `${formatNumber(passengerCount ?? 0)} pax`;
}

function buildLegSubtitle(
  routeLabel: string,
  legType: string,
  linkedContracts: ReadonlyArray<{
    volumeType: "passenger" | "cargo";
    passengerCount: number | undefined;
    cargoWeightLb: number | undefined;
  }>,
): string {
  if (linkedContracts.length === 0) {
    return `${routeLabel} | ${legType.replaceAll("_", " ")}`;
  }

  const passengerCount = linkedContracts.reduce((total, contract) => total + (contract.passengerCount ?? 0), 0);
  const cargoWeightLb = linkedContracts.reduce((total, contract) => total + (contract.cargoWeightLb ?? 0), 0);
  const payloadParts: string[] = [];

  if (passengerCount > 0) {
    payloadParts.push(`${formatNumber(passengerCount)} pax`);
  }

  if (cargoWeightLb > 0) {
    payloadParts.push(`${formatNumber(cargoWeightLb)} lb cargo`);
  }

  const contractSummary = linkedContracts.length === 1
    ? "1 scheduled contract"
    : `${formatNumber(linkedContracts.length)} scheduled contracts`;

  return `${routeLabel} | ${contractSummary}${payloadParts.length > 0 ? ` | ${payloadParts.join(" + ")}` : ""}`;
}

// Date helpers below avoid a larger timezone library while still honoring the company's home-base zone.
function buildCalendarGridDates(monthAnchorDate: string): string[] {
  const year = Number.parseInt(monthAnchorDate.slice(0, 4), 10);
  const month = Number.parseInt(monthAnchorDate.slice(5, 7), 10);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDay.getUTCDay();
  const gridStart = addDaysToLocalDate(monthAnchorDate, -firstWeekday);
  return Array.from({ length: 42 }, (_, index) => addDaysToLocalDate(gridStart, index));
}

function normalizeMonthAnchor(localDate: string): string {
  return `${localDate.slice(0, 7)}-01`;
}

function isValidLocalDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isLocalDateInRange(localDate: string, startLocalDate: string, endLocalDate: string): boolean {
  return localDate >= startLocalDate && localDate <= endLocalDate;
}

function addDaysToLocalDate(localDate: string, dayOffset: number): string {
  const { year, month, day } = parseLocalDateParts(localDate);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatMonthLabel(localDate: string): string {
  const { year, month } = parseLocalDateParts(localDate);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatSelectedDateLabel(localDate: string, timeZone: string): string {
  const utcAtMidday = resolveCalendarAnchorUtc(localDate, "12:00", timeZone);
  const weekday = weekdayLabels[new Date(Date.parse(utcAtMidday)).getUTCDay()];
  return `${weekday}, ${new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(utcAtMidday))}`;
}

function formatCurrentLocalDateLabel(currentTimeUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(currentTimeUtc));
}

function formatCurrentLocalTimeLabel(currentTimeUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(currentTimeUtc));
}

function formatUtcTimeLabel(currentTimeUtc: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(currentTimeUtc));
}

function formatAgendaTimeLabel(currentTimeUtc: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(currentTimeUtc));
}

function getLocalDateString(currentTimeUtc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(currentTimeUtc));
  return `${getFormatterPart(parts, "year")}-${getFormatterPart(parts, "month")}-${getFormatterPart(parts, "day")}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const asUtc = Date.UTC(
    Number.parseInt(getFormatterPart(parts, "year"), 10),
    Number.parseInt(getFormatterPart(parts, "month"), 10) - 1,
    Number.parseInt(getFormatterPart(parts, "day"), 10),
    Number.parseInt(getFormatterPart(parts, "hour"), 10),
    Number.parseInt(getFormatterPart(parts, "minute"), 10),
    Number.parseInt(getFormatterPart(parts, "second"), 10),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function parseLocalDateParts(localDate: string): LocalDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) {
    throw new Error(`Invalid local date: ${localDate}`);
  }

  return {
    year: Number.parseInt(match[1]!, 10),
    month: Number.parseInt(match[2]!, 10),
    day: Number.parseInt(match[3]!, 10),
  };
}

function parseLocalTimeParts(localTime: string): LocalTimeParts {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) {
    throw new Error(`Invalid local time: ${localTime}`);
  }

  return {
    hour: Number.parseInt(match[1]!, 10),
    minute: Number.parseInt(match[2]!, 10),
  };
}

function getFormatterPart(parts: Intl.DateTimeFormatPart[], partType: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((entry) => entry.type === partType)?.value;
  if (!part) {
    throw new Error(`Missing formatter part: ${partType}`);
  }

  return part;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}





