# Staffing Market Model

## Purpose

This document defines how FlightLine should generate staffing offers as capability packages instead of random people.

The staffing market should solve bottlenecks, not create list clutter.

## Design Standard

A good staffing market should satisfy these rules:

- it should respond to actual company bottlenecks
- it should show direct-hire, contract, and service options when the tradeoff matters
- it should make labor strategy visible through capability and cost, not HR flavor
- it should let early companies stay flexible without making outsourcing free
- it should scale into a real fixed-versus-variable cost decision as the company grows

## Required Inputs

The staffing generator should consume:

- current fleet and aircraft families
- current aircraft count by role
- current qualification coverage
- currently blocked schedules and contracts
- maintenance backlog pressure
- passenger versus cargo operating mix
- current base or operating region
- company cash and risk tolerance later
- current staffing model mix
- refresh window seed

## Bottleneck Detection

Before generating offers, the system should classify current bottlenecks.

Recommended bottleneck categories:

- pilot shortage
- pilot qualification gap
- cabin-service shortage
- mechanic throughput shortage
- operations support shortage
- future-acquisition readiness gap

The visible staffing offers should be generated from these bottlenecks first.

## Offer Families

### 1. Direct Pilot Package

Purpose:

- adds stable qualified flying capacity

Good for:

- repeated use of the same aircraft family
- scaling a standardized fleet

Tradeoff:

- higher fixed cost, lower marginal cost

### 2. Contract Pilot Pool

Purpose:

- adds flexible flying capacity with lower commitment

Good for:

- early companies
- uncertain utilization
- temporary expansion

Tradeoff:

- lower fixed cost, higher marginal cost

### 3. Cabin Crew Package

Purpose:

- unlocks or expands passenger operations

Good for:

- adding passenger aircraft
- moving into better passenger contracts

Tradeoff:

- mostly relevant for passenger growth, less useful for cargo-focused companies

### 4. Mechanic Service Agreement

Purpose:

- increases maintenance throughput without internal staffing depth

Good for:

- early and mid game
- geographically scattered operations

Tradeoff:

- higher service cost and lower control than in-house capability later

### 5. In-House Maintenance Package

Purpose:

- lowers long-run maintenance burden for growing fleets

Good for:

- stable base operations
- fleet scale and standardization

Tradeoff:

- meaningful fixed overhead

### 6. Operations Support Tier

Purpose:

- increases company scheduling and operational handling capacity

Good for:

- fleets that are growing faster than the management layer should support for free

Tradeoff:

- overhead cost without a direct one-flight revenue linkage

## Offer Structure

Every staffing offer should specify:

- capability added
- qualification or family coverage added
- fixed monthly cost
- variable cost if any
- activation delay
- duration or commitment band
- region or base relevance if applicable
- what bottleneck it addresses

## Generation Flow

### Step 1: Score Current Gaps

Compute gap severity for:

- current blocked operations
- near-term accepted work
- planned aircraft acquisitions
- maintenance backlog risk

### Step 2: Create Candidate Packages

Generate candidate offers from the highest-severity gaps first.

Examples:

- if a new passenger aircraft was acquired, surface cabin and pilot coverage packages
- if maintenance delay is rising, surface mechanic service and in-house mechanic options
- if a contract is blocked by qualification, surface the exact qualification package needed

### Step 3: Attach Commercial Structure

Each offer should then be resolved into one of these structures:

- direct hire package
- contract pool
- service agreement

The same capability should often be available in more than one structure so the player chooses the cost profile, not just the capability.

### Step 4: Curate Visible Set

Do not show everything.

Recommended MVP visible set:

- one immediate fix for the biggest bottleneck
- one lower-commitment option
- one longer-term efficiency option
- one future-readiness option if a pending acquisition or contract suggests it

## Pricing Model

Suggested pricing components:

- base role cost by labor category
- qualification premium by aircraft family or service level
- flexibility premium for contract pools
- region premium later
- urgency premium when the offer solves an active block quickly

## Activation Timing

Activation should create light planning friction.

Recommended MVP ranges:

- contract pools: same day or next day
- direct hire packages: short delay
- service agreements: short delay but usually predictable
- in-house maintenance package: longer setup delay than contract mechanic coverage

## Curation Rules

The staffing market should avoid these failure modes:

- irrelevant offers unrelated to current company needs
- five offers that all solve the same problem with tiny price differences
- no low-commitment option for early companies
- no long-run efficiency option for scaling companies

## Player-Facing Explanation Metadata

Each staffing offer should answer:

- what does this unlock immediately?
- what does this reduce or unblock?
- what fixed cost does this add?
- what variable cost does it avoid or increase?
- why is this better or worse than the other visible staffing option?

## Output Model

A generated staffing offer should include:

- offer id
- staffing category
- commercial structure
- qualification coverage added
- fixed cost
- variable cost effect
- activation delay
- duration or commitment band
- target bottleneck type
- explanation metadata
- refresh window seed

## MVP Implementation Sequence

1. implement staffing bottleneck detector
2. define package templates by labor category
3. define pricing model for direct, contract, and service structures
4. implement visible-offer curation rules
5. add explanation metadata and blocked-operation references

## Success Test

The staffing market is working when the player can look at two staffing offers and explain:

- which blocked problem each one solves
- which one protects cash better
- which one is better for stable long-run growth
- which one is only a temporary bridge
