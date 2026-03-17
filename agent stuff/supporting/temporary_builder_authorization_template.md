# Temporary Builder Authorization Template

## Purpose

Use this template when Mara Sterling authorizes a temporary additional Implementation Engineer session for parallel build work.

This is not a new standing role.
It is a bounded temporary implementation stream.

If this template is not filled out, the temporary builder should not start.

## Authorization Record

- Authorization status:
- Authorized by: Mara Sterling, Technical Lead
- Date:
- Temporary builder session label:
- Related initiative or task:

## Why Additional Build Capacity Is Justified

- Why one standing Implementation Engineer is not enough for this work:
- Why sequencing the work would be worse:
- Why the integration cost is acceptable:

## Change Budget

Choose one:

- `small patch`
- `scoped feature`
- `cross-system change`

## Objective

- Objective:
- Why this work belongs now:

## Scope Boundary

- In-scope work:
- Explicit non-goals:
- Explicit no-touch areas:

## Ownership Boundary

- Owned files:
- Owned subsystem:
- Adjacent systems that must not be changed without reframing:

## Frozen Interfaces And Contracts

- Shared interfaces frozen for this stream:
- Schemas or event contracts frozen for this stream:
- Assumptions the builder may rely on:

If any frozen interface changes, the builder should stop and return to Mara for reframing.

## Validation And Review

- Validation required:
- QA review required: yes or no
- Integration review required: yes or no
- Landing path:

## Expiry

- Stop condition:
- Expiry date or milestone:
- Handoff destination when complete:

## Temporary Builder Startup Prompt

Paste this into the temporary builder session after filling in the fields above:

Read and follow Z:\projects\FlightLine\AGENTS.md.

You are a temporary additional Implementation Engineer session authorized by Mara Sterling for one bounded FlightLine workstream.

You are not a standing role. You own only the authorized stream below.

Authorization record:
- Objective: [fill in]
- Change budget: [fill in]
- In-scope work: [fill in]
- Explicit non-goals: [fill in]
- Owned files or subsystem: [fill in]
- Frozen interfaces and contracts: [fill in]
- No-touch areas: [fill in]
- Validation required: [fill in]
- Review and landing path: [fill in]
- Stop condition: [fill in]

Your constraints:
- do not exceed the authorized scope
- do not edit files outside the owned boundary
- do not change frozen interfaces without stopping
- if the authorization is insufficient or unsafe, say so before building
- end with the required closeout template from AGENTS.md

## Final Guidance

This template exists to keep temporary scale from becoming unbounded chaos.

Parallel implementation is an earned exception, not the default mode.
