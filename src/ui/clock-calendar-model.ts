/*
 * Defines the payload types used by the clock and calendar UI.
 * These shapes keep the server-side clock builder and browser shell client synchronized on what the popover can render.
 */

export type ClockRateMode = "paused" | "1x" | "10x" | "60x" | "360x";

export interface CalendarDayView {
  localDate: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  eventCount: number;
  warningCount: number;
  criticalCount: number;
  canSimTo0600: boolean;
}

export interface CalendarAgendaEventView {
  calendarEventId: string;
  sourceType:
    | "company_contract"
    | "flight_leg"
    | "maintenance_task"
    | "recurring_obligation";
  sourceId: string;
  eventType:
    | "contract_deadline"
    | "planned_departure"
    | "planned_arrival"
    | "maintenance_start"
    | "maintenance_complete"
    | "payment_due";
  category: "contracts" | "dispatch" | "maintenance" | "finance";
  severity: "critical" | "warning" | "normal";
  startsAtUtc: string;
  localDate: string;
  localTimeLabel: string;
  title: string;
  subtitle: string;
  relatedTab: "contracts" | "dispatch" | "aircraft" | "activity";
  status: "upcoming" | "in_progress" | "completed" | "missed" | "cancelled";
}

export interface ClockPanelPayload {
  saveId: string;
  timeZone: string;
  currentTimeUtc: string;
  currentLocalDate: string;
  currentLocalDateLabel: string;
  currentLocalTimeLabel: string;
  utcTimeLabel: string;
  selectedLocalDate: string;
  selectedDateLabel: string;
  monthLabel: string;
  days: CalendarDayView[];
  agenda: CalendarAgendaEventView[];
  quickActions: {
    simTo0600: {
      enabled: boolean;
      localDate: string;
      label: string;
      warningCount: number;
      warningEvents: CalendarAgendaEventView[];
    };
  };
  nextCriticalEvent: CalendarAgendaEventView | undefined;
}
