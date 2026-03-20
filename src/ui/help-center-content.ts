export type HelpCenterSectionId = "home" | "next" | "blocked" | "concepts";

export interface HelpCenterSection {
  id: HelpCenterSectionId;
  label: string;
  description: string;
}

export interface HelpCenterTopic {
  id: string;
  sectionId: Exclude<HelpCenterSectionId, "home">;
  title: string;
  summary: string;
  whatThisIs: string;
  whyYouMightBeStuck: string[];
  whatToDoNext: string[];
  whereToGo: string[];
  relatedTopicIds: string[];
}

export interface HelpCenterHomeShortcutGroup {
  title: string;
  description: string;
  topicIds: string[];
}

export const helpCenterSections: HelpCenterSection[] = [
  {
    id: "home",
    label: "Help Home",
    description: "Start here if you need a clear next step or a quick recovery path.",
  },
  {
    id: "next",
    label: "Do This Next",
    description: "Short task-first guides for moving the company forward.",
  },
  {
    id: "blocked",
    label: "Why Am I Blocked?",
    description: "Player-facing troubleshooting for common stuck states.",
  },
  {
    id: "concepts",
    label: "Key Concepts",
    description: "Plain-language primers for the core terms you keep seeing.",
  },
];

export const helpCenterTopics: HelpCenterTopic[] = [
  {
    id: "what-should-i-do-next",
    sectionId: "next",
    title: "What should I do next?",
    summary: "Use this when you feel lost and need the shortest path back into the FlightLine loop.",
    whatThisIs: "FlightLine works best when you move in a simple rhythm: look for work, make sure you can support it, build a workable dispatch, then advance time carefully. You do not need to optimize everything at once.",
    whyYouMightBeStuck: [
      "You opened a save and do not know which workspace matters first.",
      "You accepted work but have not turned it into a schedule yet.",
      "You are waiting on an aircraft, staffing, or Dispatch decision without realizing it.",
    ],
    whatToDoNext: [
      "Open Contracts and look for work your current aircraft can actually fly.",
      "Check Aircraft and Staff if the company looks constrained before taking more work.",
      "Use Dispatch to turn accepted work into a draft, then commit it when validation is clear.",
      "Open Time Advance only after you know what should happen next.",
    ],
    whereToGo: [
      "Contracts for available work and accepted work.",
      "Aircraft for readiness, location, and maintenance limits.",
      "Staff for pilot and coverage gaps.",
      "Dispatch for route-plan handoff, drafts, and commit.",
    ],
    relatedTopicIds: [
      "how-the-flightline-loop-works",
      "how-to-go-from-available-work-to-a-flown-contract",
      "i-accepted-work-and-do-not-know-what-to-do-next",
    ],
  },
  {
    id: "how-the-flightline-loop-works",
    sectionId: "next",
    title: "How the FlightLine loop works",
    summary: "The slice is built around turning available work into completed flying without losing control of aircraft, staffing, or cash.",
    whatThisIs: "The main loop is operational, not decorative. You find work, decide whether your company can support it, line up aircraft and staffing, build a dispatchable schedule, and then advance time to let the simulation resolve outcomes.",
    whyYouMightBeStuck: [
      "The game shows several workspaces at once and they can feel like separate systems.",
      "You may be trying to jump straight from Contracts to Time Advance without checking Dispatch.",
      "A blocked schedule or unavailable aircraft can stop the loop in the middle.",
    ],
    whatToDoNext: [
      "Start in Contracts to review available or accepted work.",
      "Use Aircraft and Staff to confirm the company can support the plan.",
      "Use Dispatch to assemble and validate the schedule for one aircraft.",
      "Advance time once you know the next planned event should succeed.",
    ],
    whereToGo: [
      "Contracts to choose work.",
      "Aircraft and Staff to confirm capacity.",
      "Dispatch to build and commit a plan.",
      "Time Advance and Calendar to move the simulation forward.",
    ],
    relatedTopicIds: [
      "what-should-i-do-next",
      "contracts",
      "dispatch-and-validation",
    ],
  },
  {
    id: "how-to-go-from-available-work-to-a-flown-contract",
    sectionId: "next",
    title: "How to go from available work to a flown contract",
    summary: "This is the short version of turning an offer into something your company can actually complete.",
    whatThisIs: "A contract is not useful until it survives the rest of the loop. The slice expects you to accept work, hand it into planning, validate it in Dispatch, and only then advance time.",
    whyYouMightBeStuck: [
      "You accepted a contract but stopped before Dispatch.",
      "The route plan is not bound to an aircraft yet.",
      "The aircraft, staff, or timing does not support the work you picked.",
    ],
    whatToDoNext: [
      "Accept or route-plan the contract in Contracts.",
      "Open Dispatch and select the aircraft that should carry the work.",
      "Use route-plan handoff or accepted work input to build the draft.",
      "Read validation before committing the schedule.",
      "Advance time only after the draft is committed or you understand the blocker.",
    ],
    whereToGo: [
      "Contracts for available work and accepted work.",
      "Dispatch for route-plan handoff, draft legs, and commit.",
      "Aircraft and Staff when Dispatch says the plan is not ready.",
    ],
    relatedTopicIds: [
      "what-should-i-do-next",
      "dispatch-and-validation",
      "i-cannot-dispatch-this-contract",
    ],
  },
  {
    id: "how-dispatch-works",
    sectionId: "next",
    title: "How Dispatch works",
    summary: "Dispatch is where accepted work becomes a concrete aircraft plan that the simulation can trust.",
    whatThisIs: "Dispatch is the planning-first board for one aircraft at a time. It shows accepted work, route-plan handoff, the leg queue, validation, and the commit step that turns a draft into an active schedule.",
    whyYouMightBeStuck: [
      "Dispatch looks like a summary board until you select an aircraft and a leg.",
      "The draft may exist, but validation can still block commit.",
      "Accepted work alone does not mean the company is ready to fly it.",
    ],
    whatToDoNext: [
      "Pick the aircraft you want to plan first.",
      "Use the work-input lane to hand accepted work or route-plan items into that aircraft.",
      "Read the leg queue and the validation rail before committing.",
      "Commit the draft when the plan is clear, then return to Time Advance.",
    ],
    whereToGo: [
      "Dispatch for the aircraft board and validation.",
      "Contracts if you still need work to plan.",
      "Aircraft or Staff if Dispatch says the aircraft is not ready.",
    ],
    relatedTopicIds: [
      "dispatch-and-validation",
      "i-cannot-dispatch-this-contract",
      "how-to-go-from-available-work-to-a-flown-contract",
    ],
  },
  {
    id: "i-accepted-work-and-do-not-know-what-to-do-next",
    sectionId: "blocked",
    title: "I accepted work and do not know what to do next",
    summary: "Accepted work still needs planning before the company can actually fly it.",
    whatThisIs: "An accepted contract is a promise, not a finished schedule. After acceptance, the normal next stop is Dispatch so you can attach that work to a specific aircraft plan.",
    whyYouMightBeStuck: [
      "You expected accepted work to start automatically.",
      "You have not opened Dispatch since taking the contract.",
      "The aircraft you want is not ready, so planning stops when you first try to use it.",
    ],
    whatToDoNext: [
      "Open Dispatch and pick the aircraft that should take the work.",
      "Use the accepted work or route-plan handoff lane to add it to the plan.",
      "Read validation and fix the blocker before you commit.",
    ],
    whereToGo: [
      "Dispatch for the planning surface.",
      "Aircraft if the selected aircraft is unavailable.",
      "Staff if the company does not have enough coverage.",
    ],
    relatedTopicIds: [
      "what-should-i-do-next",
      "how-to-go-from-available-work-to-a-flown-contract",
      "i-cannot-dispatch-this-contract",
    ],
  },
  {
    id: "i-cannot-dispatch-this-contract",
    sectionId: "blocked",
    title: "I cannot dispatch this contract",
    summary: "When Dispatch blocks a plan, it is usually warning you that the company cannot truthfully fly that work as drafted.",
    whatThisIs: "Dispatch validation is the slice's final check before time starts resolving the schedule. A blocked dispatch usually points to timing, aircraft readiness, route fit, staffing, or an incomplete draft.",
    whyYouMightBeStuck: [
      "The aircraft is grounded, busy, or otherwise not dispatch ready.",
      "The leg timing would miss the contract window.",
      "Required staffing or pilot readiness is not available for that aircraft.",
      "The draft is incomplete or still missing a needed handoff step.",
    ],
    whatToDoNext: [
      "Read the validation rail and the selected leg detail instead of guessing.",
      "Change aircraft, timing, or the work input if the current plan cannot fit.",
      "Fix Aircraft or Staff constraints first when Dispatch says the company is not ready.",
      "Commit only when the draft clearly says it is ready.",
    ],
    whereToGo: [
      "Dispatch for the exact blocker text.",
      "Aircraft for readiness and location limits.",
      "Staff for coverage and named-pilot limits.",
    ],
    relatedTopicIds: [
      "how-dispatch-works",
      "dispatch-and-validation",
      "my-aircraft-is-unavailable",
    ],
  },
  {
    id: "i-do-not-have-enough-staffing-coverage",
    sectionId: "blocked",
    title: "I do not have enough staffing coverage",
    summary: "Staffing coverage is one of the gates that decides whether the company can safely take on more flying.",
    whatThisIs: "In the current slice, staffing is a mix of named pilots and pooled coverage packages. If coverage is missing, the company may not be able to support the aircraft or work you are trying to fly.",
    whyYouMightBeStuck: [
      "You have too little coverage for the work already in motion.",
      "A named pilot is reserved, training, or otherwise not ready now.",
      "You are trying to solve an operations problem only from Dispatch instead of checking Staff.",
    ],
    whatToDoNext: [
      "Open Staff and review named pilots plus support coverage.",
      "Hire or add the missing coverage before stacking more work on the company.",
      "Return to Dispatch after coverage changes if a draft was blocked.",
    ],
    whereToGo: [
      "Staff for named pilots and pooled staffing coverage.",
      "Dispatch to re-check the draft after staffing changes.",
      "Contracts if you need to scale back planned work instead.",
    ],
    relatedTopicIds: [
      "staff-in-the-current-slice",
      "dispatch-and-validation",
      "what-should-i-do-next",
    ],
  },
  {
    id: "my-aircraft-is-unavailable",
    sectionId: "blocked",
    title: "My aircraft is unavailable",
    summary: "Aircraft availability is a combination of where the aircraft is, what state it is in, and whether the current schedule leaves room for new work.",
    whatThisIs: "An aircraft can be present in your fleet and still be unavailable for new work. Location, maintenance, grounded state, an existing schedule, or poor readiness can all remove it from the practical pool.",
    whyYouMightBeStuck: [
      "The aircraft is grounded or in a bad maintenance state.",
      "It is at the wrong airport for the work you want to plan.",
      "A committed or draft schedule already owns the time window you need.",
    ],
    whatToDoNext: [
      "Open Aircraft and read the current readiness and location details.",
      "If the aircraft is healthy but misplaced, reposition it through a workable schedule.",
      "If the aircraft is grounded, fix the readiness problem before taking more work on it.",
      "Choose a different aircraft when recovery would take too long.",
    ],
    whereToGo: [
      "Aircraft for readiness, location, and market decisions.",
      "Dispatch for schedule conflicts and reposition legs.",
      "Contracts if you need to choose different work.",
    ],
    relatedTopicIds: [
      "aircraft-availability",
      "i-cannot-dispatch-this-contract",
      "how-to-go-from-available-work-to-a-flown-contract",
    ],
  },
  {
    id: "i-advanced-time-and-something-stopped",
    sectionId: "blocked",
    title: "I advanced time and something stopped",
    summary: "Time Advance pauses when the simulation hits something important enough that you should look at it.",
    whatThisIs: "Time does not always run straight through. The clock can stop because an event, due item, blocked schedule, or other important simulation state needs attention.",
    whyYouMightBeStuck: [
      "A due payment, contract deadline, or schedule moment was reached.",
      "The simulation hit a blocked or completed state and paused for clarity.",
      "You expected passive time flow when the current situation actually needs a decision.",
    ],
    whatToDoNext: [
      "Open the Clock and Calendar and look at the agenda or warnings for the day.",
      "Check the flash message and the current workspace for what changed.",
      "Resolve the blocker or confirm the next planned step before advancing again.",
    ],
    whereToGo: [
      "Time Advance and Calendar for the day view and agenda.",
      "Dispatch if the stop happened around a planned schedule.",
      "Contracts, Aircraft, or Staff if the stop points to one of those systems.",
    ],
    relatedTopicIds: [
      "time-advance-and-calendar",
      "cash-flow-basics",
      "what-should-i-do-next",
    ],
  },
  {
    id: "i-am-losing-money-and-do-not-know-why",
    sectionId: "blocked",
    title: "I am losing money and do not know why",
    summary: "Cash pressure usually comes from time passing while aircraft, staffing, or work choices are not paying back enough.",
    whatThisIs: "FlightLine tracks the cost of keeping the company alive, not just the money coming in. Aircraft, staffing, and time all create pressure, so idle or blocked operations can drain cash quickly.",
    whyYouMightBeStuck: [
      "You added aircraft or staffing before the company had enough productive work.",
      "Time advanced while contracts were blocked or underused.",
      "You are looking only at cash balance and not at the obligations time is about to settle.",
    ],
    whatToDoNext: [
      "Check whether your current aircraft and staffing load is earning enough through completed work.",
      "Use Contracts and Dispatch to keep flyable work moving instead of advancing empty time.",
      "Reduce risky expansion until the company can support it.",
    ],
    whereToGo: [
      "Contracts for work that can actually pay the company.",
      "Aircraft and Staff for recurring load.",
      "Time Advance and Calendar for upcoming due events.",
    ],
    relatedTopicIds: [
      "cash-flow-basics",
      "what-should-i-do-next",
      "i-advanced-time-and-something-stopped",
    ],
  },
  {
    id: "contracts",
    sectionId: "concepts",
    title: "Contracts",
    summary: "Contracts are the work opportunities and company commitments that drive the current slice.",
    whatThisIs: "Contracts move through a few clear states. Available work is still optional, accepted work is now your responsibility, and closed work is finished or no longer active.",
    whyYouMightBeStuck: [
      "You may be taking work because it pays well without checking whether the company can support it.",
      "Accepted work can look finished when it still needs planning.",
      "Different contract states can blur together if you are moving quickly.",
    ],
    whatToDoNext: [
      "Use available work to find realistic opportunities.",
      "Treat accepted work as a planning input, not a finished action.",
      "Read deadlines, route fit, and company readiness before taking more work.",
    ],
    whereToGo: [
      "Contracts for the board and accepted list.",
      "Dispatch when accepted work is ready to become a schedule.",
      "Aircraft and Staff when a contract looks too heavy for the current company.",
    ],
    relatedTopicIds: [
      "how-to-go-from-available-work-to-a-flown-contract",
      "what-should-i-do-next",
      "aircraft-availability",
    ],
  },
  {
    id: "aircraft-availability",
    sectionId: "concepts",
    title: "Aircraft availability",
    summary: "Aircraft availability is the practical answer to one question: can this aircraft take useful work right now?",
    whatThisIs: "Availability is not just ownership. The aircraft must be in the right place, in a usable state, and free enough in the schedule to support the plan you want to build.",
    whyYouMightBeStuck: [
      "A fleet entry can look healthy until you notice location, readiness, or schedule conflicts.",
      "Maintenance and grounded states can quietly remove an aircraft from planning.",
      "One aircraft may be fine for one contract and impossible for another.",
    ],
    whatToDoNext: [
      "Read readiness, location, and current assignments before choosing a contract.",
      "Use Dispatch to test fit when the answer is not obvious.",
      "Prefer aircraft that solve the problem cleanly instead of forcing a weak plan.",
    ],
    whereToGo: [
      "Aircraft for readiness and location.",
      "Dispatch for timing and route fit.",
      "Contracts for workload choice.",
    ],
    relatedTopicIds: [
      "my-aircraft-is-unavailable",
      "contracts",
      "dispatch-and-validation",
    ],
  },
  {
    id: "staff-in-the-current-slice",
    sectionId: "concepts",
    title: "Staff in the current slice",
    summary: "Staff is the company support layer that keeps aircraft and work operationally believable in this slice.",
    whatThisIs: "The current slice mixes named pilots with pooled staffing coverage. You do not need to micromanage everyone, but you do need enough support for the company to keep moving.",
    whyYouMightBeStuck: [
      "The Staff workspace may look optional until a pilot or coverage limit blocks Dispatch.",
      "Named pilots and pooled coverage solve different problems.",
      "Contract hires and direct hires both help now, but they do not behave exactly the same.",
    ],
    whatToDoNext: [
      "Use Staff when Dispatch or readiness hints say the company is under-supported.",
      "Review named pilot readiness before assuming a pilot can take work now.",
      "Add coverage deliberately instead of treating Staff as a decorative list.",
    ],
    whereToGo: [
      "Staff for named hires and staffing coverage.",
      "Dispatch when you need to see how staffing changes affect a draft.",
      "Aircraft when the staffing limit is tied to a specific aircraft plan.",
    ],
    relatedTopicIds: [
      "i-do-not-have-enough-staffing-coverage",
      "dispatch-and-validation",
      "what-should-i-do-next",
    ],
  },
  {
    id: "dispatch-and-validation",
    sectionId: "concepts",
    title: "Dispatch and validation",
    summary: "Dispatch turns plans into something the simulation can trust, and validation explains why a plan does or does not hold up.",
    whatThisIs: "Validation is there to tell you the truth before time starts resolving the plan. It is not just a warning system. It is the slice's main explanation layer for why a schedule is ready or blocked.",
    whyYouMightBeStuck: [
      "You may read validation as noise instead of as the reason the plan is blocked.",
      "A schedule draft can exist and still be uncommittable.",
      "Different blockers can stack together and make the board feel more confusing than it is.",
    ],
    whatToDoNext: [
      "Read the validation rail first when Dispatch looks wrong.",
      "Use the selected leg detail to understand where the plan fails.",
      "Fix the real blocker before committing or advancing time.",
    ],
    whereToGo: [
      "Dispatch for the validation rail and leg detail.",
      "Aircraft for readiness blockers.",
      "Staff for coverage blockers.",
    ],
    relatedTopicIds: [
      "how-dispatch-works",
      "i-cannot-dispatch-this-contract",
      "aircraft-availability",
    ],
  },
  {
    id: "time-advance-and-calendar",
    sectionId: "concepts",
    title: "Time Advance and Calendar",
    summary: "Time Advance moves the simulation, and the Calendar helps you understand what the next days are carrying.",
    whatThisIs: "The clock is how work, due events, and scheduled operations actually resolve. The Calendar is there so you can see the shape of upcoming time before you push the simulation forward too far.",
    whyYouMightBeStuck: [
      "It is easy to treat the clock as a skip button instead of an operations tool.",
      "Important events can stack on the same day without being obvious from one workspace alone.",
      "Fast time without a clear plan can create avoidable blockers.",
    ],
    whatToDoNext: [
      "Look at the current day and agenda before long jumps.",
      "Advance in smaller steps when the company is busy or fragile.",
      "Use the calendar to spot due items before they surprise you.",
    ],
    whereToGo: [
      "Clock and Calendar for the current day and upcoming events.",
      "Dispatch when a schedule is the next thing on the clock.",
      "Contracts, Aircraft, and Staff when a due item points back to one of them.",
    ],
    relatedTopicIds: [
      "i-advanced-time-and-something-stopped",
      "cash-flow-basics",
      "what-should-i-do-next",
    ],
  },
  {
    id: "cash-flow-basics",
    sectionId: "concepts",
    title: "Cash flow basics",
    summary: "Cash changes because work pays out over time while aircraft, staffing, and due events keep charging the company.",
    whatThisIs: "Cash flow in the slice is about timing as much as totals. A company can look rich and still be under pressure if time is about to settle obligations or if the fleet is not producing enough completed work.",
    whyYouMightBeStuck: [
      "The cash number can feel disconnected from the decisions that caused it.",
      "Recurring load shows up more clearly as time moves forward.",
      "A quiet company can still be expensive if aircraft and staffing are sitting idle.",
    ],
    whatToDoNext: [
      "Compare your current workload against your recurring aircraft and staffing load.",
      "Keep work flowing through Dispatch instead of letting time pass empty.",
      "Grow the company when the current loop is stable, not when it is already strained.",
    ],
    whereToGo: [
      "Contracts for the work side of the ledger.",
      "Aircraft and Staff for recurring load.",
      "Time Advance and Calendar for when payments or events will settle.",
    ],
    relatedTopicIds: [
      "i-am-losing-money-and-do-not-know-why",
      "time-advance-and-calendar",
      "contracts",
    ],
  },
];

export const helpCenterHomeShortcutGroups: HelpCenterHomeShortcutGroup[] = [
  {
    title: "Do This Next",
    description: "Use these when you need the shortest path back into the loop.",
    topicIds: [
      "what-should-i-do-next",
      "how-the-flightline-loop-works",
      "how-to-go-from-available-work-to-a-flown-contract",
    ],
  },
  {
    title: "Common blockers",
    description: "These are the stuck states most likely to stop a save cold.",
    topicIds: [
      "i-cannot-dispatch-this-contract",
      "i-do-not-have-enough-staffing-coverage",
      "my-aircraft-is-unavailable",
      "i-advanced-time-and-something-stopped",
    ],
  },
  {
    title: "Key concepts",
    description: "Read these when the UI terms are familiar but still not fully clear.",
    topicIds: [
      "contracts",
      "aircraft-availability",
      "staff-in-the-current-slice",
      "dispatch-and-validation",
      "time-advance-and-calendar",
      "cash-flow-basics",
    ],
  },
];

export function getHelpCenterTopicsForSection(
  sectionId: Exclude<HelpCenterSectionId, "home">,
): HelpCenterTopic[] {
  return helpCenterTopics.filter((topic) => topic.sectionId === sectionId);
}

export function getHelpCenterTopic(topicId: string): HelpCenterTopic | undefined {
  return helpCenterTopics.find((topic) => topic.id === topicId);
}
