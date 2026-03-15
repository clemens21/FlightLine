# Implementation Index

## Purpose

This folder holds implementation-facing design documents.

Unlike `strategy/`, which defines product intent and simulation rules, this folder defines how FlightLine should be structured in backend code and persistence.

## Read Order

1. [Doc Boundary Review](/Z:/projects/FlightLine/implementation/doc-boundary-review.md)
2. [Backend Domain Model](/Z:/projects/FlightLine/implementation/backend-domain-model.md)
3. [Backend Command Model](/Z:/projects/FlightLine/implementation/backend-command-model.md)
4. [Save Schema Blueprint](/Z:/projects/FlightLine/implementation/save-schema-blueprint.md)

## Inputs From Strategy

These implementation docs are grounded in:

- [Game State Model](/Z:/projects/FlightLine/strategy/game-state-model.md)
- [Contract Generator V1](/Z:/projects/FlightLine/strategy/contract-generator-v1.md)
- [Dispatch Validation And Time Advance](/Z:/projects/FlightLine/strategy/dispatch-validation-and-time-advance.md)

## Current Goal

The goal of this folder is to get FlightLine from strategy into backend and persistence structures that can actually be scaffolded, implemented, and surfaced in the local operations UI without re-deciding the model every time.
