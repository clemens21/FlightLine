# Pilot Hiring Market First Pass Framed Delivery

- Operating mode: `Framed Delivery`
- Change budget: medium, single bounded stream
- Primary owner: Eli Mercer
- Required supporting roles:
  - Nadia Cross for migration, save-truth, and UI-versus-state review
  - Owen Hart only if landing order or migration-readiness risk expands beyond one bounded stream
- Temporary builder authorization: authorized now for one bounded implementation stream only

## Handoff Contract

### 1. Objective

Replace the preset-driven pilot staffing activation surface with a pilots-only `Hire Staff` market that shows individual prospective pilots and their pre-hire states, while preserving the current capability-based staffing model underneath and leaving non-pilot labor pooled.

### 2. Current-slice reason for doing the work now

The current Staff tab still presents pilot acquisition as preset buttons under `Activate Staffing`, which is now the wrong abstraction after named pilots, training, transfer, and roster management were added. The player-facing acquisition surface needs to catch up so hiring pilots looks like hiring people, not buying anonymous capacity, without reopening a full all-role labor rewrite.

### 3. In-scope work

- Rename the pilot acquisition surface from `Activate Staffing` to `Hire Staff`.
- Replace the preset pilot buttons with a pilots-only candidate market that shows individual prospective pilots.
- Keep candidate state minimal and pre-hire only:
  - `Available now`
  - `Available soon`
- Keep post-hire operational states in `Pilot Roster`, not in the market.
- Implement a stable pilot-candidate market model rather than generating random names directly in the UI:
  - use the existing offer-window pattern as the preferred architecture
  - add a staffing-market read model and refresh path for pilot candidates
- Add a dedicated pilot-hire command rather than pretending a preset activation is a market action.
- Hiring a pilot candidate should create the backing pilot staffing package and named pilot record in one truthful flow.
- Preserve current named-pilot management flows after hire:
  - roster visibility
  - dispatch legality
  - training
  - transfer and return-home
- Keep non-pilot acquisition available as pooled capability purchase in the same Staff workspace, but as a secondary support-coverage surface rather than part of the pilot candidate market.
- Reuse existing staffing package and named-pilot reconciliation paths where they still fit cleanly.

### 4. Explicit non-goals

- No individual flight-attendant market.
- No individual mechanic market.
- No individual ops-support market.
- No full employee-simulation layer.
- No morale, personality, retention, or labor-relations mechanics.
- No wage negotiation, interviews, or applicant pipeline minigame.
- No hidden travel or training logic changes beyond what is required to keep hired pilots truthful.
- No removal of pooled non-pilot staffing packages in this pass.
- No UI-only fake market that changes labels without adding real candidate state.

### 5. Affected systems or files

- `src/ui/server.ts`
- `src/application/backend-service.ts`
- `src/application/commands/types.ts`
- likely a new pilot-hire command under `src/application/commands/`
- likely a new staffing-market query under `src/application/queries/`
- likely a staffing-market reconciler under `src/application/staffing/`
- `src/application/queries/staffing-state.ts`
- `src/application/commands/activate-staffing-package.ts`
- save-schema and migrations under `src/infrastructure/persistence/save-schema/` and `src/infrastructure/persistence/sqlite/migrations.ts`
- focused backend and browser coverage under `test/`

### 6. Assumptions and open questions

- Assumption: the first pass should stay pilots-only even inside `Hire Staff`; non-pilot labor remains pooled.
- Assumption: candidate offers should be persisted and windowed like other markets so the UI does not invent unstable people per render.
- Assumption: a hired candidate should leave the market and appear in `Pilot Roster`; the market should not become a second roster.
- Assumption: one hired candidate maps to one pilot staffing package with one coverage unit in the first pass.
- Open question: should first-pass pilot candidates include both `direct_hire` and `contract_pool`, or start with `direct_hire` only if contractor semantics create too much ambiguity?
- Open question: how much bottleneck-aware curation is necessary in the first pass versus a thinner qualification-driven candidate set?
- Open question: should staffing-market refresh happen on company bootstrap and time advance the same way aircraft market does, or only on explicit refresh plus bootstrap?

### 7. Required validation

- `npm run build`
- backend coverage for:
  - staffing-market generation or refresh
  - hiring a pilot candidate
  - offer closure after hire
  - save/load integrity for market offers and hired pilots
- browser or UI-server coverage for:
  - `Hire Staff` rendering with pilot candidates
  - candidate state visibility
  - successful hire moving a candidate into `Pilot Roster`
  - non-pilot pooled staffing acquisition still available
- regression coverage that existing named-pilot dispatch, training, transfer, and return-home flows still work after hire
- explicit verification that the market never shows a candidate as hireable if the backend would reject the hire

### 8. Stop conditions or escalation triggers

- The implementation starts drifting into an all-role staffing market.
- Candidate state requires a broader employee lifecycle than `Available now` and `Available soon` to stay truthful.
- The market cannot stay stable without a more general offer-window or staffing-offer abstraction than this stream can safely add.
- One-candidate-per-pilot materially breaks current staffing cost or coverage assumptions.
- Save-schema or migration work starts colliding with other active streams.
- The UI starts duplicating or contradicting roster truth instead of handing off cleanly from market to roster.

### 9. Final disposition of deferred work

- Defer individual flight attendants, mechanics, and ops support.
- Defer richer candidate traits and proficiency ladders.
- Defer wage negotiation in the first pass, but keep it on the intended follow-on list for the pilot employment model.
- Defer deeper staffing-market bottleneck curation if a thin qualification-driven pilot market is enough for the first pass.
- Defer any broader labor-market redesign until the pilots-only path proves clear and stable.

## Intended follow-on backlog after first pass

These are intentionally deferred out of the first-pass stream, but they are not throwaway ideas. Keep them on the near-future pilot-employment backlog once `Direct hire` versus `Contract hire` exists cleanly:

- contract renewal
- convert contractor to direct hire
- wage negotiation
