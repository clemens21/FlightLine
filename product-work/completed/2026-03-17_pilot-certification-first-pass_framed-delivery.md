# Pilot Certification First Pass Framed Delivery

- Operating mode: `Framed Delivery`
- Change budget: large, single bounded stream with strong QA review
- Primary owner: Mara Sterling for framing; Eli Mercer only after the state model is frozen
- Required supporting roles:
  - Nadia Cross for save-truth, migration, and legality regression review
  - Zoe Bennett for certification-scope discipline and now-versus-later guardrails
  - Owen Hart only if migration or landing-order risk expands
- Temporary builder authorization: not yet authorized

## Handoff Contract

### 1. Objective

Replace the opaque pilot `qualificationGroup` model with an explicit named-pilot certification model that supports:
- player-visible certifications
- certification-based dispatch legality
- certification-targeted pilot training

without reopening pilot stats, personality, or a broader labor rewrite.

### 2. Current-slice reason for doing the work now

The Staff tab now hires named pilots and exposes pilot training, transfer, and roster management, but pilot capability is still hidden behind package-centric `qualificationGroup` strings. That makes the player-facing labor model harder to understand and blocks the requested "train this pilot from one cert to another" workflow.

### 3. In-scope work

- Add explicit named-pilot certification ownership to the save model.
- Define a first-pass certification family that matches the current slice:
  - first-pass cert vocabulary: `SEPL`, `SEPS`, `MEPL`, `MEPS`
  - current aircraft legality maps to the land path first, but the sea-path vocabulary should exist now so targeted certification training does not need another model rewrite later
  - `JET` may exist as deferred vocabulary, but should not drive first-pass gameplay unless current fleet content actually requires it
- Map current aircraft legality to certifications instead of package qualification strings.
- Show pilot certifications in `Pilot Roster`, `Hire Staff`, and Dispatch-facing staffing surfaces.
- Add targeted pilot training so the player can choose a certification upgrade path where valid.
- Make training completion update the pilot's certification truthfully.
- Keep Dispatch legality, precommit validation, commit-time assignment, and time advance aligned with pilot certification truth.
- Preserve pooled non-pilot staffing as-is.

### 4. Explicit non-goals

- No pilot performance stats in this pass.
- No on-time behavior modifiers, aircraft-health modifiers, or soft-skill simulation in this pass.
- No all-staff certification system for mechanics, flight attendants, or ops support.
- No hidden automatic cross-qualification rules.
- No generalized type-rating explosion or per-airframe endorsement system.
- No broader HR-sim features such as wages, morale, retention, or evaluation.

### 5. Affected systems or files

- `src/domain/staffing/types.ts`
- `src/application/queries/staffing-state.ts`
- `src/application/staffing/named-pilot-roster.ts`
- `src/application/dispatch/schedule-validation.ts`
- `src/application/commands/commit-aircraft-schedule.ts`
- `src/application/commands/save-schedule-draft.ts`
- `src/application/commands/advance-time.ts`
- `src/application/commands/start-named-pilot-training.ts`
- `src/application/queries/fleet-state.ts`
- `src/infrastructure/reference/aircraft-reference.ts`
- `src/ui/server.ts`
- `src/ui/dispatch-tab-model.ts`
- `src/ui/public/dispatch-tab-client.ts`
- migrations under `src/infrastructure/persistence/save-schema/` and `src/infrastructure/persistence/sqlite/migrations.ts`
- focused backend and UI regression coverage under `test/`

### 6. Assumptions and open questions

- Assumption: the current slice should not expose `JET` as a live cert unless the current aircraft catalog actually requires it.
- Assumption: certification truth must live on the named pilot, not only on the staffing package.
- Assumption: the current `recurrent` training command is too narrow and must become target-aware.
- Open question: should certification be modeled as a single highest cert tier, or as an owned-cert set?
  - preferred answer: owned-cert set, because future pilots may need to remain valid for smaller equipment after upgrade
- Open question: how should current package qualification strings map to the new cert model during migration?
- Open question: should first-pass training allow only bounded targeted upgrades such as `SEPL -> MEPL` and land/sea cross-training within the same owned-cert set model?

### 7. Required validation

- `npm run build`
- backend coverage for:
  - migration of existing named pilots and staffing packages into certification truth
  - certification-based dispatch legality
  - targeted certification training start and completion
  - save/load integrity for pilot certifications
- UI or UI-server coverage for:
  - pilot certification visibility in `Hire Staff`, `Pilot Roster`, and Dispatch
  - selecting a certification target when starting training
  - truthful blocker messaging when certification is missing
- regression coverage that travel, rest, and existing named-pilot availability states still behave correctly after the cert change

### 8. Stop conditions or escalation triggers

- The implementation tries to mutate package-level qualification to represent one pilot's cert progression.
- Training targets require a deeper type-rating or endorsement matrix than this slice can explain.
- `JET` becomes a live player-facing path without current aircraft content to justify it.
- Pilot stats or performance modifiers start getting pulled into the same stream.
- Migration cannot preserve existing saves truthfully.

### 9. Final disposition of deferred work

- Defer pilot stats and simulation modifiers until certification truth is stable.
- Defer deeper rating families, endorsements, and airline-style type ratings.
- Defer `JET` gameplay if the current slice still has no meaningful jet operations.
- Defer non-pilot certification systems entirely.
