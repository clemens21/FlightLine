# Sample Company Dataset

## Purpose

This is the canonical fake data set for MVP wireframes.

All first-pass wireframes should use this same company snapshot so screen layouts can be compared honestly.

## Snapshot Metadata

- company: `Summit Air Logistics`
- region: `Rocky Mountain West`
- timestamp: `Wednesday, June 17, 2026 08:20 MDT`
- company phase: `stable small carrier`
- primary business mix: `regional cargo + premium charter`

## Company Summary

| Metric | Value |
| --- | --- |
| Cash | $412,000 |
| Weekly profit trend | +$38,400 |
| Reputation | 61 / 100 |
| Financial pressure | Tight |
| Home base | KAPA |
| Active aircraft | 3 |
| Available aircraft now | 1 |
| Contracts accepted | 3 |
| Contracts blocked | 1 |

## Near-Term Obligations

| Obligation | Amount | Timing |
| --- | --- | --- |
| ATR 42F operating lease | $14,200 | due in 4 days |
| King Air financing payment | $9,800 | due in 6 days |
| Labor fixed cost burn | $3,900 | per day |
| Outsourced maintenance reserve | $1,600 | per day average |

## Aircraft Snapshot

| Tail | Type | Nickname | Location | Operational state | Condition band | Maintenance state | Staffing coverage | Ownership | Next event |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FL-201 | C208 Caravan | Mesa Runner | KGJT | Available | Healthy | Not due | Covered | Owned | Idle now |
| FL-305 | King Air 350 | Alpine Arrow | KAPA | Scheduled | Healthy | Not due | Tight | Financed | Charter departs 10:05 |
| FL-842 | ATR 42F | Wasatch Freight | KSLC | Available | Watch | Due soon | Covered | Leased | Cargo slot available |

## Aircraft Operating Metrics

| Tail | Last 7d profit | Utilization | Best role | Main risk |
| --- | --- | --- | --- | --- |
| FL-201 | $6,900 | 54% | short regional feeder | underused |
| FL-305 | $14,100 | 71% | premium charter | no spare qualified pilot depth |
| FL-842 | $21,700 | 83% | medium cargo | maintenance due in 5.4 flight hours |

## Staffing Snapshot

### Coverage By Category

| Category | Current model | Capacity state | Notes |
| --- | --- | --- | --- |
| Caravan-class pilots | direct hire | Covered | enough for current use |
| King Air-class pilots | direct hire | Tight | only one spare-qualified pilot remains |
| ATR-class pilots | contract pool | Covered | costlier but flexible |
| Flight attendants | contract pool | Covered | enough for current passenger work |
| Mechanics | service agreements | Tight | outsourced line maintenance only |
| Operations support | small internal package | Tight | acceptable now, weak for expansion |

### Staffing Blockers

| Blocker | Impact |
| --- | --- |
| No extra King Air-qualified pilot coverage | blocks taking a second premium same-window charter |
| No in-house mechanic capacity | increases ATR downtime risk if issue escalates |
| Thin operations support | growth beyond 3 aircraft will feel chaotic |

## Contract Market Snapshot

### Accepted Or Assigned

| Id | Type | Route | Payload / Pax | Payout | Deadline | Best aircraft | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-117 | Passenger charter | KAPA -> KASE | 6 pax | $14,800 | 12:20 today | FL-305 | Assigned |
| C-203 | Cargo haul | KSLC -> KGJT | 4,300 lb | $18,200 | 18:00 today | FL-842 | Accepted |
| C-089 | Utility run | KGJT -> KCOS | 1,050 lb | $5,100 | 09:00 tomorrow | FL-201 | Accepted |

### Available Opportunities

| Id | Type | Route | Payload / Pax | Payout | Est. margin | Deadline | Fit note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C-241 | Passenger charter | KEGE -> KAPA | 8 pax | $22,500 | high | 17:10 today | strong King Air fit, blocked by tight pilot coverage |
| C-244 | Cargo haul | KGJT -> KSLC | 3,700 lb | $15,400 | high | 20:30 today | strong ATR fit, competes with maintenance timing |
| C-245 | Regional passenger | KCOS -> KGJT | 4 pax | $7,200 | medium | tomorrow 11:00 | acceptable Caravan fit |
| C-248 | Utility cargo | KRKS -> KSLC | 900 lb | $4,400 | low | today 21:00 | safe but weak margin |

## Alert Snapshot

### Critical

- none at this moment

### Warning

- `FL-842` ATR 42F maintenance due in 5.4 flight hours
- King Air staffing coverage is `tight`
- Accepted cargo work may conflict with maintenance timing if ATR is overused

### Opportunity

- `C-244` KGJT -> KSLC cargo haul is a strong fit for `FL-842`
- `C-241` KEGE -> KAPA passenger charter becomes viable if King Air pilot depth improves

### Info

- yesterday's charter completed on time with +$13,200 realized profit

## Next 12 Hours Event Timeline

| Time | Event |
| --- | --- |
| 09:10 | Player decision point on ATR cargo assignment |
| 10:05 | FL-305 departs KAPA for KASE |
| 11:12 | FL-305 arrives KASE |
| 12:00 | ATR maintenance watch reminder escalates |
| 14:30 | Best window to launch KGJT -> KSLC cargo and still service ATR afterward |
| 18:00 | Deadline for KSLC -> KGJT accepted cargo contract |

## Wireframe Use Notes

- Dashboard should emphasize the ATR warning, the tight King Air staffing, and the next best contract action.
- Contracts should make `C-244` and `C-241` visually compelling for different reasons.
- Dispatch should focus on whether to use the ATR now or protect maintenance margin.
- Fleet should make the three-aircraft tradeoffs obvious at a glance.
- Staffing should make the King Air bottleneck unmistakable.

## Non-Goals For This Data Set

This data is not final balance tuning.

It exists to stress-test layout, information hierarchy, alert logic, and cross-screen consistency.
