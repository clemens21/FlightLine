# MSFS Aircraft Alignment

## Purpose

This document defines how FlightLine should align its aircraft roster to the current Microsoft Flight Simulator ecosystem.

The goal is not to duplicate every storefront SKU. The goal is to ensure that the aircraft families and variants FlightLine models are also meaningfully flyable in the latest Microsoft Flight Simulator title and its live addon ecosystem.

## Current Verified Platform State

As of March 14, 2026, the latest Microsoft Flight Simulator title is `Microsoft Flight Simulator 2024`.

Verified current first-party product state:

- the official Microsoft Flight Simulator store lists `70` aircraft in Standard, `80` in Deluxe, `95` in Premium Deluxe, and `125` in Aviator
- the official store states that Aviator includes the Premium Deluxe fleet plus `30` Microsoft-published Marketplace aircraft developed between `2021` and `2024`
- the current official MSFS 2024 ecosystem includes built-in aircraft, official paid Marketplace aircraft, third-party paid direct-download aircraft, and third-party freeware aircraft

## Verified Source Signals

### 1. First-Party Included Aircraft

Official current examples relevant to FlightLine's airline-management scope include:

- `Cessna 208 Grand Caravan EX`
- `De Havilland Canada DHC-6 Twin Otter`
- `Pilatus PC-12 NGX`
- `Cessna Citation CJ4`
- `Cessna 408 SkyCourier`
- `Pilatus PC-24`
- `Saab 340B`
- `ATR 42-600 / 72-600`

These matter because they give us a source-backed overlap between FlightLine starter families and aircraft already flyable in MSFS 2024.

### 2. Official Paid Marketplace Aircraft

The official Marketplace updates from January and February 2026 show current paid aircraft listings for MSFS 2024 such as:

- `Just Flight 146 Professional`
- `F28 Professional`
- `PMDG 737-900`
- `iniBuilds A350 Airliner`
- `lvfr Airbus A330-800 NEO`
- `A2A Aerostar 600`

This confirms that the official paid channel is active and broad enough to support FlightLine alignment beyond the built-in fleet.

### 3. Third-Party Paid Direct Downloads

Verified current third-party direct paid example:

- `Just Flight 146 Professional` is sold as a direct MSFS 2020/2024 download and includes passenger and cargo-capable variants

This matters because some commercially important airline families may be better represented through third-party direct channels than through built-in MSFS stock aircraft alone.

### 4. Third-Party Freeware

Verified current freeware examples:

- `FlyByWire A32NX` is officially compatible with MSFS 2024
- `Headwind Simulations A339X` is listed as a freeware add-on for Microsoft Flight Simulator

This matters because the MSFS freeware ecosystem covers serious transport aircraft that FlightLine should be able to represent even when they are not part of the default sim purchase.

## Design Conclusion

FlightLine should align to `MSFS 2024 flyable aircraft families`, not to `individual storefront SKUs`.

That is an inference from the current source set, not a statement made by any one source.

Why this is the correct level:

- storefront products change too often to serve as the canonical game roster
- many MSFS products are just different commercial packages around the same aircraft family
- FlightLine is a management sim, so family-level behavior matters more than vendor-level packaging
- this keeps the roster stable even as Marketplace and third-party stores rotate products

## Explicit Product Rule

Every MVP aircraft family FlightLine uses should have at least one confirmed MSFS 2024 availability path in one of these classes:

- `included_first_party`
- `marketplace_paid`
- `third_party_paid`
- `third_party_freeware`
- `mixed`

If a family does not currently have a confirmed MSFS 2024 path, it should not be part of the preferred MVP roster.

## Airline-Focused Scope Filter

Even though MSFS 2024 includes many aircraft types, FlightLine should filter aggressively for management relevance.

Preferred scope for now:

- fixed-wing passenger aircraft
- fixed-wing cargo aircraft
- combi aircraft
- business aviation aircraft that can support premium charter gameplay

Out of scope for the main FlightLine roster unless a later expansion says otherwise:

- helicopters
- gliders
- balloons and airships
- eVTOL aircraft
- military-only aircraft
- novelty or fictional aircraft
- warbirds and historic museum aircraft that do not support the airline-management fantasy

## Confirmed First-Pass Family Lanes

These are the strongest current overlap lanes between FlightLine and MSFS 2024.

### Startup Utility

Confirmed overlap examples:

- `Cessna 208 Grand Caravan EX`
- `Cessna 408 SkyCourier`
- `Pilatus PC-6 Porter`

### Premium Small Company Operations

Confirmed overlap examples:

- `Pilatus PC-12 NGX`
- `Cessna Citation CJ4`
- `Cessna Citation Longitude`
- `Pilatus PC-24`

### Rugged Remote Ops

Confirmed overlap examples:

- `De Havilland Canada DHC-6 Twin Otter`

### Regional Turboprop Airline Ops

Confirmed overlap examples:

- `Saab 340B`
- `ATR 42-600 / 72-600`

### Regional Jet And Airline Expansion

Confirmed overlap examples:

- `BAe 146 Professional`
- `F28 Professional`

### Narrowbody And Mainline Expansion

Confirmed overlap examples:

- `Airbus A320neo`
- `FlyByWire A32NX`
- `Boeing 737 MAX 8`
- `PMDG 737 NG family`

### Widebody Expansion

Confirmed overlap examples:

- `Airbus A330 family`
- `Headwind A339X`
- `iniBuilds A350 Airliner`

## Data Modeling Implication

The aircraft dataset should carry explicit MSFS alignment metadata.

Recommended fields per FlightLine aircraft model:

- `msfs2024_availability_class`
- `msfs2024_included_tier`
- `msfs2024_distribution_channels`
- `msfs2024_example_products`
- `msfs2024_pc_supported`
- `msfs2024_xbox_supported`
- `msfs2024_notes`
- `msfs2024_last_verified_on`

This should be metadata layered onto the FlightLine aircraft model, not the primary identity of the model.

## Non-Goal

FlightLine should not attempt to mirror every single aircraft listing that exists across:

- the in-game Marketplace
- Microsoft-published legacy aircraft bundles
- direct third-party stores
- freeware installers
- community mod repositories

That list is too unstable and too store-shaped to be a good game design primitive.

## Recommended Next Step

Turn the current aircraft modeling work into a real starter dataset that:

- uses only confirmed MSFS 2024-aligned families for the MVP shortlist
- stores family and variant data at the FlightLine level
- adds MSFS availability metadata as a crosswalk layer
- avoids vendor-specific duplication unless a variant materially changes gameplay

## Source Notes

Primary sources used for this strategy pass:

- official Microsoft Flight Simulator store and edition page
- official PlayStation product page for Microsoft Flight Simulator 2024
- official Microsoft Flight Simulator Marketplace update posts from January and February 2026
- official FlyByWire documentation and release notes
- official Headwind Simulations site
- official Just Flight product page for the 146 Professional

