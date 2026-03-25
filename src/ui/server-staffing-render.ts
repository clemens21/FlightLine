// @ts-nocheck
import { availableCertificationTrainingTargets, formatPilotCertificationList } from "../domain/staffing/pilot-certifications.js";
import { resolveCandidatePortraitSeed, resolveEmployeePortraitSeed, resolveStaffPortraitAssetId } from "./staff-portrait-cache.js";

let assetVersion;
let escapeHtml;
let formatDate;
let formatMoney;
let formatNumber;
let renderBadge;
let renderCompactAirportDisplay;
let describeAirport;
let renderHiddenContext;
let pilotCertificationDisplayOrder;
let staffingPresets;
let staffingQualificationLaneOrder;

export function createStaffingRenderers(deps) {
    ({
        assetVersion,
        escapeHtml,
        formatDate,
        formatMoney,
        formatNumber,
        renderBadge,
        renderCompactAirportDisplay,
        describeAirport,
        renderHiddenContext,
        pilotCertificationDisplayOrder,
        staffingPresets,
        staffingQualificationLaneOrder,
    } = deps);

    return { renderStaffing };
}

function renderNamedPilotStatusBadges(pilot) {
    const badges = [renderBadge(pilot.availabilityState)];
    if (pilot.packageStatus !== "active" && pilot.packageStatus !== pilot.availabilityState) {
        badges.push(renderBadge(pilot.packageStatus));
    }
    return badges.join("");
}
function humanize(value) {
    return value.replaceAll("_", " ");
}
function formatEmploymentModelLabel(value) {
    const label = value.replaceAll("_", " ");
    return label.charAt(0).toUpperCase() + label.slice(1);
}
function formatStaffingAvailabilityLabel(candidateState, startsAtUtc) {
    return candidateState === "available_soon" && startsAtUtc
        ? `Starts ${formatDate(startsAtUtc)}`
        : "Available now";
}
function formatContractEndLabel(endsAtUtc) {
    return endsAtUtc ? `Ends ${formatDate(endsAtUtc)}` : "No fixed end date";
}
function formatPilotHours(hours) {
    return `${formatNumber(hours ?? 0)}h`;
}
function normalizePilotStatScore(statValue) {
    if (typeof statValue === "number" && Number.isFinite(statValue)) {
        return Math.max(0, Math.min(10, Math.round(statValue)));
    }
    if (typeof statValue === "string") {
        switch (statValue) {
            case "developing":
                return 2;
            case "solid":
                return 5;
            case "strong":
                return 7;
            case "exceptional":
                return 9;
            default:
                return 0;
        }
    }
    return 0;
}
function renderPilotStatRating(statValue, options = {}) {
    const score = normalizePilotStatScore(statValue);
    const starFills = Array.from({ length: 5 }, (_, index) => {
        const threshold = index * 2;
        if (score >= threshold + 2) {
            return 100;
        }
        if (score === threshold + 1) {
            return 50;
        }
        return 0;
    });
    const compactClass = options.compact ? " compact" : "";
    const metricAttribute = options.metric ? ` data-pilot-stat-rating="${escapeHtml(options.metric)}"` : "";
    const ariaLabel = options.label
        ? `${options.label} ${score}/10`
        : `${score}/10`;
    return `<span class="pilot-stat-rating${compactClass}"${metricAttribute} data-pilot-stat-score="${escapeHtml(String(score))}" aria-label="${escapeHtml(ariaLabel)}"><span class="pilot-stat-stars" aria-hidden="true">${starFills.map((fill) => `<span class="pilot-stat-star" data-pilot-stat-star-fill="${escapeHtml(String(fill))}" style="--pilot-stat-fill:${escapeHtml(String(fill))}%"></span>`).join("")}</span><span class="pilot-stat-score">${escapeHtml(`${score}/10`)}</span></span>`;
}

function renderStaffingHireIcon(kind) {
    if (kind === "search") {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4a6 6 0 1 0 3.73 10.7l4.28 4.28 1.41-1.41-4.28-4.28A6 6 0 0 0 10 4Zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"></path></svg>`;
}

function renderStaffingHireIconButton(columnKey, kind, label) {
    return `<button type="button" class="staffing-hire-icon-button" data-staffing-hire-popover-toggle="${escapeHtml(columnKey)}" aria-label="${escapeHtml(label)}">${renderStaffingHireIcon(kind)}</button>`;
}

function renderStaffingHireSearchControl(columnKey, field, placeholder, ariaLabel) {
    return `<div class="staffing-hire-popover staffing-hire-popover--search" data-staffing-hire-popover="${escapeHtml(columnKey)}" data-staffing-hire-control-type="search" hidden><input type="search" class="staffing-hire-inline-search" placeholder="${escapeHtml(placeholder)}" data-staffing-hire-field="${escapeHtml(field)}" value="" aria-label="${escapeHtml(ariaLabel)}" /></div>`;
}

function renderStaffingHireCompactField(label, controlMarkup) {
    return `<label class="staffing-hire-popover-field staffing-hire-popover-field--compact"><span class="eyebrow">${escapeHtml(label)}</span>${controlMarkup}</label>`;
}

function renderStaffingHireRangeFields(minField, maxField, options = {}) {
    const minimum = options.minimum ?? 0;
    const maximum = options.maximum ?? "";
    const step = options.step ?? 1;
    const minPlaceholder = options.minPlaceholder ?? "Min";
    const maxPlaceholder = options.maxPlaceholder ?? "Max";
    return `<div class="staffing-hire-range-fields"><label class="staffing-hire-range-field"><span class="eyebrow">Min</span><input type="number" min="${escapeHtml(String(minimum))}"${maximum !== "" ? ` max="${escapeHtml(String(maximum))}"` : ""} step="${escapeHtml(String(step))}" inputmode="numeric" placeholder="${escapeHtml(minPlaceholder)}" data-staffing-hire-field="${escapeHtml(minField)}" value="" /></label><label class="staffing-hire-range-field"><span class="eyebrow">Max</span><input type="number" min="${escapeHtml(String(minimum))}"${maximum !== "" ? ` max="${escapeHtml(String(maximum))}"` : ""} step="${escapeHtml(String(step))}" inputmode="numeric" placeholder="${escapeHtml(maxPlaceholder)}" data-staffing-hire-field="${escapeHtml(maxField)}" value="" /></label></div>`;
}

function renderStaffingHireCheckboxFieldset(field, values) {
    return `<div class="staffing-hire-checkbox-list">${values.map((value) => `<label class="staffing-hire-checkbox-option"><input type="checkbox" data-staffing-hire-field="${escapeHtml(field)}" value="${escapeHtml(value)}" /><span>${escapeHtml(value)}</span></label>`).join("")}</div>`;
}

function renderStaffingHireFilterControl(columnKey, bodyMarkup) {
    return `<div class="staffing-hire-popover staffing-hire-popover--filter" data-staffing-hire-popover="${escapeHtml(columnKey)}" data-staffing-hire-control-type="filter" hidden><div class="staffing-hire-popover-body">${bodyMarkup}</div></div>`;
}

function renderStaffingHireSortButton(columnKey, label, sortKey) {
    return `<button type="button" class="staffing-hire-sort-button" data-staffing-hire-sort-button="${escapeHtml(sortKey)}">${escapeHtml(label)}</button>`;
}

function renderStaffingHireHeaderCell(columnKey, label, sortKey, popoverMarkup, iconKinds = []) {
    const iconButtons = iconKinds.map((kind) => renderStaffingHireIconButton(columnKey, kind, `${label} ${kind === "search" ? "search" : "filter"}`)).join("");
    return `<th class="staffing-hire-column" data-staffing-hire-column="${escapeHtml(columnKey)}"><div class="staffing-hire-column-head">${renderStaffingHireSortButton(columnKey, label, sortKey)}<span class="staffing-hire-column-actions">${iconButtons}</span></div>${popoverMarkup ?? ""}</th>`;
}

function candidateDetailId(offer) {
    return offer?.candidateProfileId ?? offer?.staffingOfferId ?? "";
}
function describePilotHirePrice(offer) {
    if (!offer) {
        return "Unavailable";
    }
    return offer.employmentModel === "contract_hire"
        ? `${formatMoney(offer.fixedCostAmount)} + ${formatMoney(offer.variableCostRate ?? 0)}/hr`
        : `${formatMoney(offer.fixedCostAmount)}/mo`;
}
function resolveCandidateGroupPortraitSeed(candidate) {
    return resolveCandidatePortraitSeed(candidate?.directOffer ?? candidate?.contractOffer ?? {
        staffingOfferId: candidate?.candidateId ?? "pilot-candidate",
        displayName: candidate?.displayName ?? "Pilot candidate",
        candidateProfileId: candidate?.candidateId ?? "pilot-candidate",
    });
}
function buildPilotCandidateGroups(staffingMarket) {
    const pilotOffers = (staffingMarket?.offers ?? []).filter((offer) => offer.laborCategory === "pilot" && offer.candidateState === "available_now");
    const groups = new Map();
    for (const offer of pilotOffers) {
        const candidateId = candidateDetailId(offer);
        const existingGroup = groups.get(candidateId) ?? {
            candidateId,
            displayName: offer.displayName ?? "Unnamed candidate",
            qualificationGroup: offer.qualificationGroup,
            certifications: offer.certifications ?? [],
            currentAirportId: offer.currentAirportId,
            candidateProfile: offer.candidateProfile,
            directOffer: null,
            contractOffer: null,
        };
        existingGroup.displayName = existingGroup.displayName || offer.displayName || "Unnamed candidate";
        existingGroup.qualificationGroup = existingGroup.qualificationGroup || offer.qualificationGroup;
        existingGroup.certifications = existingGroup.certifications?.length ? existingGroup.certifications : (offer.certifications ?? []);
        existingGroup.currentAirportId = existingGroup.currentAirportId ?? offer.currentAirportId;
        existingGroup.candidateProfile = existingGroup.candidateProfile ?? offer.candidateProfile;
        if (offer.employmentModel === "direct_hire") {
            existingGroup.directOffer = offer;
        }
        else if (offer.employmentModel === "contract_hire") {
            existingGroup.contractOffer = offer;
        }
        groups.set(candidateId, existingGroup);
    }
    return [...groups.values()].sort((left, right) => {
        const leftProfile = left.candidateProfile;
        const rightProfile = right.candidateProfile;
        const leftHours = leftProfile?.primaryQualificationFamilyHours ?? 0;
        const rightHours = rightProfile?.primaryQualificationFamilyHours ?? 0;
        if (leftHours !== rightHours) {
            return rightHours - leftHours;
        }
        const leftDirectCost = left.directOffer?.fixedCostAmount ?? Number.MAX_SAFE_INTEGER;
        const rightDirectCost = right.directOffer?.fixedCostAmount ?? Number.MAX_SAFE_INTEGER;
        if (leftDirectCost !== rightDirectCost) {
            return leftDirectCost - rightDirectCost;
        }
        return left.displayName.localeCompare(right.displayName);
    });
}
function qualificationLaneRank(qualificationGroup) {
    const rank = staffingQualificationLaneOrder.indexOf(qualificationGroup);
    return rank >= 0 ? rank : staffingQualificationLaneOrder.length;
}
function qualificationFamilyKey(qualificationGroup) {
    if (qualificationGroup.includes("turboprop")) {
        return "turboprop";
    }
    if (qualificationGroup.includes("regional_jet")) {
        return "regional_jet";
    }
    if (qualificationGroup.includes("widebody") || qualificationGroup.includes("airline")) {
        return "airline";
    }
    if (qualificationGroup.includes("jet")) {
        return "jet";
    }
    return qualificationGroup.split("_").slice(0, 2).join("_");
}
function marketFitBucketForCandidate(candidate, fleetAircraft) {
    const exactGroups = new Set(fleetAircraft.map((aircraft) => aircraft.pilotQualificationGroup));
    if (exactGroups.has(candidate.qualificationGroup)) {
        return "core";
    }
    const candidateFamily = qualificationFamilyKey(candidate.qualificationGroup);
    const ownedFamilies = new Set(fleetAircraft.map((aircraft) => qualificationFamilyKey(aircraft.pilotQualificationGroup)));
    if (ownedFamilies.has(candidateFamily)) {
        return "adjacent";
    }
    const candidateRank = qualificationLaneRank(candidate.qualificationGroup);
    for (const aircraft of fleetAircraft) {
        const rankDelta = Math.abs(qualificationLaneRank(aircraft.pilotQualificationGroup) - candidateRank);
        if (rankDelta <= 1) {
            return "adjacent";
        }
    }
    return "broader";
}
function staffingMarketAvailabilityPath(candidate) {
    const hasDirect = Boolean(candidate.directOffer);
    const hasContract = Boolean(candidate.contractOffer);
    if (hasDirect && hasContract) {
        return "both";
    }
    if (hasDirect) {
        return "direct";
    }
    if (hasContract) {
        return "contract";
    }
    return "none";
}
function staffingMarketFitLabel(fitBucket) {
    switch (fitBucket) {
        case "core":
            return "Core fit";
        case "adjacent":
            return "Adjacent fit";
        default:
            return "Broader fit";
    }
}
function buildPilotCandidateMarketViews(source) {
    const candidateGroups = buildPilotCandidateGroups(source.staffingMarket);
    const fleetAircraft = source.fleetState?.aircraft ?? [];
    const coverageSummaries = source.staffingState?.coverageSummaries ?? [];
    const ownedAircraftCounts = new Map();
    const familyAircraftCounts = new Map();
    for (const aircraft of fleetAircraft) {
        ownedAircraftCounts.set(aircraft.pilotQualificationGroup, (ownedAircraftCounts.get(aircraft.pilotQualificationGroup) ?? 0) + 1);
        const familyKey = qualificationFamilyKey(aircraft.pilotQualificationGroup);
        familyAircraftCounts.set(familyKey, (familyAircraftCounts.get(familyKey) ?? 0) + 1);
    }
    return candidateGroups
        .map((candidate) => {
        const fitBucket = marketFitBucketForCandidate(candidate, fleetAircraft);
        const availabilityPath = staffingMarketAvailabilityPath(candidate);
        const candidateProfile = candidate.candidateProfile;
        const exactAircraftCount = ownedAircraftCounts.get(candidate.qualificationGroup) ?? 0;
        const familyAircraftCount = familyAircraftCounts.get(qualificationFamilyKey(candidate.qualificationGroup)) ?? 0;
        const qualificationGroup = candidate?.qualificationGroup ?? "";
        const coverageSummary = coverageSummaries.find((summary) => summary.laborCategory === "pilot" && summary.qualificationGroup === qualificationGroup);
        const coverageGap = coverageSummary
            ? Math.max((coverageSummary.activeCoverageUnits + coverageSummary.pendingCoverageUnits) - 1, 0)
            : 0;
        const relevanceScore = exactAircraftCount * 1000
            + familyAircraftCount * 120
            + (fitBucket === "core" ? 250 : fitBucket === "adjacent" ? 120 : 0)
            + (availabilityPath === "both" ? 40 : 0)
            + Math.max(0, coverageGap) * 25
            + Math.round((candidateProfile?.primaryQualificationFamilyHours ?? 0) / 50)
            - Math.round((candidate?.directOffer?.fixedCostAmount ?? candidate?.contractOffer?.fixedCostAmount ?? 0) / 2500);
        const searchIndex = [
            candidate?.displayName ?? "",
            qualificationGroup,
            candidateProfile?.qualificationLane ?? "",
            candidate?.certifications?.join(" ") ?? "",
            candidate?.currentAirportId ?? "",
            fitBucket,
            availabilityPath,
            describeCandidateStartingPrice(candidate?.directOffer),
            describeCandidateStartingPrice(candidate?.contractOffer),
        ].join(" ").toLowerCase();
        return {
            ...candidate,
            availabilityPath,
            fitBucket,
            fitLabel: staffingMarketFitLabel(fitBucket),
            relevanceScore,
            searchIndex,
            ownedAircraftCount: exactAircraftCount,
            familyAircraftCount,
        };
    })
        .sort((left, right) => right.relevanceScore - left.relevanceScore
        || right.ownedAircraftCount - left.ownedAircraftCount
        || right.familyAircraftCount - left.familyAircraftCount
        || left.displayName.localeCompare(right.displayName));
}
function describeCandidateStartingPrice(offer) {
    if (!offer) {
        return "Pricing unavailable";
    }
    return describePilotHirePrice(offer);
}
function hashStableValue(value) {
    let hash = 0;
    for (const character of value) {
        hash = Math.imul(31, hash) + character.charCodeAt(0) | 0;
    }
    return Math.abs(hash);
}
function renderStaffPortrait(seed, surface, options = {}) {
    const normalizedSeed = typeof seed === "string" && seed.trim().length > 0 ? seed.trim() : "staff-portrait";
    const sizeClass = options.size === "detail" ? " detail" : "";
    const portraitSrc = resolveStaffPortraitSrc(normalizedSeed);
    const safePortraitId = resolveStaffPortraitAssetId(normalizedSeed);
    const detailPortraitAttribute = options.detailView
        ? ` data-staffing-detail-portrait="${escapeHtml(options.detailView)}"`
        : "";
    return `<span class="staff-portrait-frame${sizeClass}" data-staff-portrait-frame="${escapeHtml(surface)}" data-staff-portrait-slot="${escapeHtml(safePortraitId)}"><img class="staff-portrait-image" src="${escapeHtml(portraitSrc)}" alt="" aria-hidden="true" data-staff-portrait-surface="${escapeHtml(surface)}" data-staff-portrait-key="${escapeHtml(normalizedSeed)}" data-staff-portrait-slot="${escapeHtml(safePortraitId)}"${detailPortraitAttribute} /></span>`;
}
function resolveStaffPortraitSrc(seed) {
    const normalizedSeed = typeof seed === "string" && seed.trim().length > 0 ? seed.trim() : "staff-portrait";
    const portraitId = resolveStaffPortraitAssetId(normalizedSeed);
    return `/assets/staff-portraits/${portraitId}.svg?seed=${encodeURIComponent(normalizedSeed)}&v=${assetVersion}`;
}

function renderSupportCoverageActions(saveId, tabId, options = {}) {
    const actionPath = options.api ? `/api/save/${encodeURIComponent(saveId)}/actions/add-staffing` : "/actions/add-staffing";
    const supportPresets = Object.entries(staffingPresets).filter(([, preset]) => preset.laborCategory !== "pilot");
    if (supportPresets.length === 0) {
        return `<div class="muted">No pooled support packages are configured yet.</div>`;
    }
    return `<div class="actions"><div class="action-group tight">${supportPresets.map(([presetKey, preset]) => `<form method="post" action="${actionPath}" class="inline" ${options.api ? "data-api-form" : ""}>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="presetKey" value="${escapeHtml(presetKey)}" /><button type="submit" data-pending-label="Adding coverage..." data-support-coverage-start="${escapeHtml(presetKey)}">${escapeHtml(preset.label)}</button></form>`).join("")}</div></div>`;
}
function renderPilotHiringMarket(saveId, tabId, source, options = {}) {
    const staffingMarket = source.staffingMarket;
    const candidateViews = buildPilotCandidateMarketViews(source);
    if (candidateViews.length === 0) {
        return `<div class="empty-state" data-staffing-market-empty><strong>No pilots are available to hire right now.</strong><div class="muted">This market only shows named pilots who are available now.</div></div>`;
    }
    const selectedCandidateId = candidateViews.some((candidate) => candidate.candidateId === options.selectedCandidateId)
        ? options.selectedCandidateId
        : candidateViews[0]?.candidateId ?? "";
    const defaultSortKey = "relevance";
    const contractSortOptions = [
        ["upfront", "Upfront fee"],
        ["hourly", "Hourly rate"],
    ];
    const candidateRows = candidateViews.map((candidate) => {
        if (!candidate) {
            return "";
        }
        const isSelected = candidate.candidateId === selectedCandidateId;
        const portraitSeed = resolveCandidateGroupPortraitSeed(candidate);
        const directLabel = candidate.directOffer ? describePilotHirePrice(candidate.directOffer) : "Not offered";
        const contractLabel = candidate.contractOffer ? describePilotHirePrice(candidate.contractOffer) : "Not offered";
        const candidateCertifications = candidate.certifications ?? [];
        const baseAirport = candidate.currentAirportId ? describeAirport(candidate.currentAirportId) : null;
        const baseSearch = baseAirport ? `${baseAirport.code} ${baseAirport.primaryLabel}` : candidate.currentAirportId ?? "";
        const operationalReliability = normalizePilotStatScore(candidate.candidateProfile?.statProfile?.operationalReliability);
        const stressTolerance = normalizePilotStatScore(candidate.candidateProfile?.statProfile?.stressTolerance);
        const procedureDiscipline = normalizePilotStatScore(candidate.candidateProfile?.statProfile?.procedureDiscipline);
        const trainingAptitude = normalizePilotStatScore(candidate.candidateProfile?.statProfile?.trainingAptitude);
        return `<tr class="aircraft-row ${isSelected ? "selected" : ""}" data-pilot-candidate-row="${escapeHtml(candidate.candidateId)}" data-staffing-row-select="hire" data-staffing-detail-id="${escapeHtml(candidate.candidateId)}" data-staffing-candidate-name="${escapeHtml(candidate.displayName)}" data-staffing-candidate-base="${escapeHtml(candidate.currentAirportId ?? "")}" data-staffing-candidate-base-search="${escapeHtml(baseSearch)}" data-staffing-candidate-search="${escapeHtml(candidate.searchIndex)}" data-staffing-candidate-fit="${escapeHtml(candidate.fitBucket)}" data-staffing-candidate-relevance="${escapeHtml(String(candidate.relevanceScore))}" data-staffing-candidate-hours="${escapeHtml(String(candidate.candidateProfile?.totalCareerHours ?? 0))}" data-staffing-candidate-cert-count="${escapeHtml(String(candidateCertifications.length))}" data-staffing-candidate-certifications="${escapeHtml(candidateCertifications.join("|"))}" data-staffing-candidate-operational-reliability="${escapeHtml(String(operationalReliability))}" data-staffing-candidate-stress-tolerance="${escapeHtml(String(stressTolerance))}" data-staffing-candidate-procedure-discipline="${escapeHtml(String(procedureDiscipline))}" data-staffing-candidate-training-aptitude="${escapeHtml(String(trainingAptitude))}" data-staffing-candidate-direct-availability="${candidate.directOffer ? "offered" : "not_offered"}" data-staffing-candidate-contract-availability="${candidate.contractOffer ? "offered" : "not_offered"}" data-staffing-candidate-direct-cost="${escapeHtml(String(candidate.directOffer?.fixedCostAmount ?? ""))}" data-staffing-candidate-contract-cost="${escapeHtml(String(candidate.contractOffer?.fixedCostAmount ?? ""))}" data-staffing-candidate-contract-hourly-rate="${escapeHtml(String(candidate.contractOffer?.variableCostRate ?? ""))}" aria-selected="${isSelected ? "true" : "false"}" tabindex="0"><td><div class="staff-identity">${renderStaffPortrait(portraitSeed, "hire-row")}<strong>${escapeHtml(candidate.displayName)}</strong></div></td><td>${candidate.currentAirportId ? renderCompactAirportDisplay(candidate.currentAirportId) : `<span class="muted">Unassigned</span>`}</td><td class="staffing-certifications-cell">${escapeHtml(formatPilotCertificationList(candidateCertifications))}</td><td>${escapeHtml(formatPilotHours(candidate.candidateProfile?.totalCareerHours ?? 0))}</td><td>${renderPilotStatRating(candidate.candidateProfile?.statProfile?.operationalReliability, { compact: true, label: "Operational reliability", metric: "operationalReliability" })}</td><td>${renderPilotStatRating(candidate.candidateProfile?.statProfile?.stressTolerance, { compact: true, label: "Stress tolerance", metric: "stressTolerance" })}</td><td>${renderPilotStatRating(candidate.candidateProfile?.statProfile?.procedureDiscipline, { compact: true, label: "Procedure discipline", metric: "procedureDiscipline" })}</td><td>${renderPilotStatRating(candidate.candidateProfile?.statProfile?.trainingAptitude, { compact: true, label: "Training aptitude", metric: "trainingAptitude" })}</td><td>${candidate.directOffer ? escapeHtml(directLabel) : `<span class="muted">Not offered</span>`}</td><td>${candidate.contractOffer ? escapeHtml(contractLabel) : `<span class="muted">Not offered</span>`}</td></tr>`;
    }).join("");
    const emptyState = `<div class="empty-state compact" data-staffing-market-empty hidden><strong>No pilots match the current filters.</strong><div class="muted">Adjust the column search or filters to broaden the market.</div></div>`;
    const pilotPopover = renderStaffingHireSearchControl("pilot", "pilotSearch", "Search pilot names", "Search pilot names");
    const basePopover = renderStaffingHireSearchControl("base", "baseSearch", "Search base code or airport", "Search bases");
    const certificationPopover = renderStaffingHireFilterControl("certifications", renderStaffingHireCompactField("Certifications", renderStaffingHireCheckboxFieldset("certificationFilter", pilotCertificationDisplayOrder)));
    const hoursPopover = renderStaffingHireFilterControl("hours", renderStaffingHireCompactField("Total hours", renderStaffingHireRangeFields("hoursMin", "hoursMax", {
        minimum: 0,
        maximum: "",
        step: 1,
        minPlaceholder: "0",
        maxPlaceholder: "Any",
    })));
    const reliabilityPopover = renderStaffingHireFilterControl("reliability", renderStaffingHireCompactField("Reliability", renderStaffingHireRangeFields("reliabilityMin", "reliabilityMax", {
        minimum: 0,
        maximum: 10,
        step: 1,
        minPlaceholder: "0",
        maxPlaceholder: "10",
    })));
    const stressPopover = renderStaffingHireFilterControl("stress", renderStaffingHireCompactField("Stress", renderStaffingHireRangeFields("stressMin", "stressMax", {
        minimum: 0,
        maximum: 10,
        step: 1,
        minPlaceholder: "0",
        maxPlaceholder: "10",
    })));
    const procedurePopover = renderStaffingHireFilterControl("procedure", renderStaffingHireCompactField("Procedure", renderStaffingHireRangeFields("procedureMin", "procedureMax", {
        minimum: 0,
        maximum: 10,
        step: 1,
        minPlaceholder: "0",
        maxPlaceholder: "10",
    })));
    const trainingPopover = renderStaffingHireFilterControl("training", renderStaffingHireCompactField("Training", renderStaffingHireRangeFields("trainingMin", "trainingMax", {
        minimum: 0,
        maximum: 10,
        step: 1,
        minPlaceholder: "0",
        maxPlaceholder: "10",
    })));
    const directHirePopover = renderStaffingHireFilterControl("direct_hire", renderStaffingHireCompactField("Direct monthly", renderStaffingHireRangeFields("directCostMin", "directCostMax", {
        minimum: 0,
        maximum: "",
        step: 250,
        minPlaceholder: "Any",
        maxPlaceholder: "Any",
    })));
    const contractHirePopover = renderStaffingHireFilterControl("contract_hire", `${renderStaffingHireCompactField("Contract hourly", renderStaffingHireRangeFields("contractHourlyMin", "contractHourlyMax", {
        minimum: 0,
        maximum: "",
        step: 5,
        minPlaceholder: "Any",
        maxPlaceholder: "Any",
    }))}${renderStaffingHireCompactField("Sort by", `<select data-staffing-hire-field="contractSortBasis">${contractSortOptions.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === "upfront" ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`)}`);
    const headerRow = [
        renderStaffingHireHeaderCell("pilot", "Pilot", "name", pilotPopover, ["search"]),
        renderStaffingHireHeaderCell("base", "Base", "base", basePopover, ["search"]),
        renderStaffingHireHeaderCell("certifications", "Certification(s)", "certifications", certificationPopover, ["filter"]),
        renderStaffingHireHeaderCell("hours", "Total hours", "hours", hoursPopover, ["filter"]),
        renderStaffingHireHeaderCell("reliability", "Reliability", "operationalReliability", reliabilityPopover, ["filter"]),
        renderStaffingHireHeaderCell("stress", "Stress", "stressTolerance", stressPopover, ["filter"]),
        renderStaffingHireHeaderCell("procedure", "Procedure", "procedureDiscipline", procedurePopover, ["filter"]),
        renderStaffingHireHeaderCell("training", "Training", "trainingAptitude", trainingPopover, ["filter"]),
        renderStaffingHireHeaderCell("direct_hire", "Direct hire", "direct_cost", directHirePopover, ["filter"]),
        renderStaffingHireHeaderCell("contract_hire", "Contract hire", "contract_cost", contractHirePopover, ["filter"]),
    ].join("");
    const columnGroup = `<colgroup><col style="width:240px" /><col style="width:180px" /><col style="width:210px" /><col style="width:130px" /><col style="width:150px" /><col style="width:150px" /><col style="width:150px" /><col style="width:150px" /><col style="width:170px" /><col style="width:210px" /></colgroup>`;
    return `<div class="staffing-hire-market-shell" data-staffing-hire-market-shell data-staffing-default-sort-key="${escapeHtml(defaultSortKey)}" data-staffing-default-sort-direction="desc" data-staffing-default-search=""><div class="staffing-hire-market-list table-wrap" data-pilot-candidate-market data-staffing-scroll-region="hire:list" data-pilot-candidate-market-table><table>${columnGroup}<thead><tr>${headerRow}</tr></thead><tbody>${candidateRows}</tbody></table></div>${emptyState}</div>`;
}
function renderStaffingFactRow(label, value, detail = "") {
    return `<div class="aircraft-fact-row"><div class="eyebrow">${escapeHtml(label)}</div><div class="aircraft-fact-copy"><strong>${escapeHtml(value)}</strong>${detail ? `<span class="muted">${escapeHtml(detail)}</span>` : ""}</div></div>`;
}
function renderStaffingFactMarkupRow(label, valueMarkup, detail = "") {
    return `<div class="aircraft-fact-row"><div class="eyebrow">${escapeHtml(label)}</div><div class="aircraft-fact-copy"><div class="staffing-fact-value">${valueMarkup}</div>${detail ? `<span class="muted">${escapeHtml(detail)}</span>` : ""}</div></div>`;
}
function renderStaffingFactListRow(label, entries) {
    if (entries.length === 0) {
        return "";
    }
    return `<div class="aircraft-fact-row"><div class="eyebrow">${escapeHtml(label)}</div><div class="aircraft-fact-copy"><ul class="aircraft-fact-list">${entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul></div></div>`;
}
function summarizePilotAvailabilityMix(activeMatchingPilots) {
    const statusBuckets = [
        { key: "available", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "ready").length },
        { key: "planned", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "reserved").length },
        { key: "flying", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "flying").length },
        { key: "training", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "training").length },
        { key: "traveling", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "traveling").length },
        { key: "resting", count: activeMatchingPilots.filter((pilot) => pilot.availabilityState === "resting").length },
    ];
    const visibleBuckets = statusBuckets.filter((bucket, index) => bucket.count > 0 || index === 0);
    return visibleBuckets.map((bucket) => `${formatNumber(bucket.count)} ${bucket.key}`).join(" | ");
}
function renderHireCoverageRows(coverage, qualificationGroup, namedPilots, staffingState, options = {}) {
    const laneSummary = findPilotCoverageSummary(coverage, qualificationGroup);
    const matchingPilots = namedPilots.filter((pilot) => pilot.qualificationGroup === qualificationGroup);
    const activeMatchingPilots = matchingPilots.filter((pilot) => pilot.packageStatus === "active");
    const availabilityMix = summarizePilotAvailabilityMix(activeMatchingPilots);
    const compact = options.compact === true;
    const detail = (value) => compact ? "" : value;
    return `${renderStaffingFactRow("Qualified pilots", laneSummary ? `${formatNumber(laneSummary.activeCoverageUnits)} active | ${formatNumber(laneSummary.pendingCoverageUnits)} pending` : "No pilot coverage", detail("This hire adds one named pilot who can cover this aircraft type."))}${renderStaffingFactRow("Current pilot status", availabilityMix, detail(`${formatNumber(activeMatchingPilots.length)} active named pilots currently cover this aircraft type.`))}${renderStaffingFactRow("Current monthly payroll", formatMoney(staffingState?.totalMonthlyFixedCostAmount ?? 0), detail("Current monthly staffing load across active recurring labor only."))}`;
}
function renderHireComparisonCard(saveId, tabId, candidate, offer, context) {
    void candidate;
    if (!offer) {
        return `<section class="summary-item staffing-comparison-card"><div class="eyebrow">Unavailable</div><strong>Not listed</strong><span class="muted">This hiring path is not available in the current market window.</span></section>`;
    }
    const recurringLine = offer.employmentModel === "direct_hire"
        ? "Recurring salary | No activation charge"
        : `Engagement fee ${formatMoney(offer.fixedCostAmount)} | ${formatMoney(offer.variableCostRate ?? 0)}/completed flight hour`;
    const contractTermLine = offer.employmentModel === "contract_hire"
        ? formatContractEndLabel(offer.endsAtUtc)
        : "No fixed contract end";
    const trainingLine = offer.employmentModel === "contract_hire"
        ? "Training blocked"
        : "Training allowed";
    const headline = offer.employmentModel === "contract_hire"
        ? formatMoney(offer.fixedCostAmount)
        : `${formatMoney(offer.fixedCostAmount)}/mo`;
    const actionMarkup = renderHireChoiceAction(saveId, tabId, offer, context, { showPriceLabel: false });
    return `<section class="summary-item staffing-comparison-card" data-staffing-hire-offer-path="${escapeHtml(offer.employmentModel)}"><div class="staffing-comparison-copy"><div class="eyebrow">${escapeHtml(formatEmploymentModelLabel(offer.employmentModel))}</div><strong>${escapeHtml(headline)}</strong><div class="meta-stack"><span>${escapeHtml(recurringLine)}</span><span class="muted">${escapeHtml(contractTermLine)}</span><span class="muted">${escapeHtml(trainingLine)}</span></div></div>${actionMarkup ? `<div class="staffing-comparison-action">${actionMarkup}</div>` : ""}</section>`;
}
function renderHireChoiceAction(saveId, tabId, offer, context, options = {}) {
    if (!offer) {
        return "";
    }
    const actionPath = context.api
        ? `/api/save/${encodeURIComponent(saveId)}/actions/hire-pilot-candidate`
        : "/actions/hire-pilot-candidate";
    const showPriceLabel = options.showPriceLabel !== false;
    const priceLabel = offer.employmentModel === "contract_hire"
        ? `${formatMoney(offer.fixedCostAmount)} + ${formatMoney(offer.variableCostRate ?? 0)}/hr`
        : `${formatMoney(offer.fixedCostAmount)}/mo`;
    const buttonLabel = offer.employmentModel === "contract_hire"
        ? "Hire on contract"
        : "Hire direct";
    return `<form method="post" action="${actionPath}" class="market-confirm-form staffing-hire-choice-form${showPriceLabel ? "" : " staffing-hire-choice-form--embedded"}" ${context.api ? "data-api-form" : ""}>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="staffingOfferId" value="${escapeHtml(offer.staffingOfferId)}" /><button type="submit" data-pending-label="Hiring..." data-pilot-candidate-hire="${escapeHtml(offer.staffingOfferId)}">${escapeHtml(buttonLabel)}</button>${showPriceLabel ? `<span class="muted">${escapeHtml(priceLabel)}</span>` : ""}</form>`;
}
function certificationTierRank(certificationCode) {
    switch (certificationCode) {
        case "JUMBO":
            return 4;
        case "JET":
            return 3;
        case "MEPL":
        case "MEPS":
            return 2;
        case "SEPL":
        case "SEPS":
        default:
            return 1;
    }
}
function describePilotStatMeaning(statLabel) {
    switch (statLabel) {
        case "stress tolerance":
            return "which means this pilot should hold up better when schedules get tight or operations start slipping.";
        case "operational reliability":
            return "which means this pilot should be a steadier choice when you need dependable day-to-day coverage.";
        case "procedure discipline":
            return "which means this pilot should be more consistent about following operational process cleanly.";
        case "training aptitude":
            return "which means this pilot should pick up recurrent and certification training faster than a weaker profile.";
        default:
            return "which gives this pilot a stronger visible operating profile than a flat-average candidate.";
    }
}
function resolveVisibleCertificationHours(profile, certifications = []) {
    const certificationHoursByCode = new Map((profile?.certificationHours ?? []).map((entry) => [
        entry.certificationCode,
        Math.max(0, Math.round(entry.hours ?? 0)),
    ]));
    const ownedCertifications = new Set(certifications ?? []);
    return pilotCertificationDisplayOrder.map((certificationCode) => ({
        certificationCode,
        hours: certificationHoursByCode.get(certificationCode) ?? 0,
        owned: ownedCertifications.has(certificationCode),
    }));
}
function renderCandidateCertificationList(certifications) {
    const orderedOwnedCertifications = pilotCertificationDisplayOrder.filter((certificationCode) => (certifications ?? []).includes(certificationCode));
    if (orderedOwnedCertifications.length === 0) {
        return "No certifications listed";
    }
    return orderedOwnedCertifications.join(", ");
}
function renderCandidateCertificationHoursTable(profile, certifications) {
    const certificationHours = resolveVisibleCertificationHours(profile, certifications);
    const certificationHoursByCode = new Map(certificationHours.map((entry) => [entry.certificationCode, entry]));
    const certificationRows = [
        pilotCertificationDisplayOrder.slice(0, 3),
        pilotCertificationDisplayOrder.slice(3, 6),
    ];
    return `<div class="staffing-cert-hours-card" data-staffing-cert-hours><div class="eyebrow">Certification hours</div><table class="staffing-cert-hours-table"><tbody>${certificationRows.map((row) => `<tr>${row.map((certificationCode) => {
        const entry = certificationHoursByCode.get(certificationCode);
        const mutedClass = entry && (entry.owned || entry.hours > 0) ? "" : " is-muted";
        return `<th scope="row" class="${mutedClass.trim()}">${escapeHtml(certificationCode)}</th><td class="${mutedClass.trim()}">${escapeHtml(formatPilotHours(entry?.hours ?? 0))}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function renderCandidateOperationalProfileGrid(profile) {
    if (!profile) {
        return `<div class="empty-state compact"><strong>Operational profile unavailable.</strong><div class="muted">Visible reliability and training signals are not available for this candidate.</div></div>`;
    }
    const statCards = [
        { label: "Operational reliability", metric: "operationalReliability", value: profile.statProfile.operationalReliability },
        { label: "Stress tolerance", metric: "stressTolerance", value: profile.statProfile.stressTolerance },
        { label: "Procedure discipline", metric: "procedureDiscipline", value: profile.statProfile.procedureDiscipline },
        { label: "Training aptitude", metric: "trainingAptitude", value: profile.statProfile.trainingAptitude },
    ];
    return `<div class="staffing-stat-grid">${statCards.map((stat) => `<section class="summary-item compact staffing-stat-card" data-staffing-stat-card="${escapeHtml(stat.metric)}"><div class="eyebrow">${escapeHtml(stat.label)}</div>${renderPilotStatRating(stat.value, { label: stat.label, metric: stat.metric, compact: true })}</section>`).join("")}</div>`;
}
function resolveCandidateStrengthsAndWeaknesses(candidate) {
    const profile = candidate.candidateProfile;
    if (!profile) {
        return ["Visible candidate profile data is incomplete for this market entry."];
    }
    const certificationCount = (candidate.certifications ?? []).length;
    const statEntries = [
        { label: "operational reliability", score: normalizePilotStatScore(profile.statProfile.operationalReliability) },
        { label: "stress tolerance", score: normalizePilotStatScore(profile.statProfile.stressTolerance) },
        { label: "procedure discipline", score: normalizePilotStatScore(profile.statProfile.procedureDiscipline) },
        { label: "training aptitude", score: normalizePilotStatScore(profile.statProfile.trainingAptitude) },
    ].sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
    const highestStatScore = statEntries[0]?.score ?? 0;
    const strongestStats = statEntries.filter((entry) => entry.score === highestStatScore).slice(0, 2);
    const primaryStrongestStat = strongestStats[0];
    const secondaryStrongestStat = strongestStats[1];
    const weakestStat = [...statEntries].sort((left, right) => left.score - right.score || left.label.localeCompare(right.label))[0];
    const certificationHours = resolveVisibleCertificationHours(profile, candidate.certifications ?? [])
        .filter((entry) => entry.hours > 0)
        .sort((left, right) => right.hours - left.hours || certificationTierRank(right.certificationCode) - certificationTierRank(left.certificationCode));
    const strongestExperienceLine = certificationHours.length > 0
        ? `Strength: best logged experience is ${certificationHours.slice(0, 2).map((entry) => `${entry.certificationCode} ${formatPilotHours(entry.hours)}`).join(" and ")} across ${formatPilotHours(profile.totalCareerHours)} total career time.`
        : `Strength: ${formatPilotHours(profile.totalCareerHours)} total career time is visible even though the certification-hour breakout is still sparse.`;
    const highTierTime = certificationHours.find((entry) => entry.certificationCode === "JUMBO" || entry.certificationCode === "JET");
    const weaknessLine = weakestStat && weakestStat.score <= 4
        ? `Weakness: ${humanize(weakestStat.label)} is only ${weakestStat.score}/10, so this pilot may be less dependable there than their strongest visible profile signal.`
        : certificationCount <= 1
            ? `Weakness: this candidate only carries ${certificationCount} active certification${certificationCount === 1 ? "" : "s"}, so retraining may be needed as your fleet broadens.`
            : highTierTime
                ? `Weakness: ${highTierTime.certificationCode} time and ${certificationCount} active certifications push this candidate into a more expensive market band.`
                : `Weakness: there is no standout high-tier certification time yet, so this profile is broader than elite.`;
    return [
        primaryStrongestStat
            ? `Strength: ${humanize(primaryStrongestStat.label)} is ${primaryStrongestStat.score}/10, ${describePilotStatMeaning(primaryStrongestStat.label)}${secondaryStrongestStat ? ` Also strong in ${humanize(secondaryStrongestStat.label)} ${secondaryStrongestStat.score}/10.` : ""}`
            : "Strength: no standout operational profile signal is visible yet.",
        strongestExperienceLine,
        weaknessLine,
    ];
}
function preferredNamedPilotId(namedPilots) {
    return namedPilots.find((pilot) => pilot.packageStatus === "active" && pilot.availabilityState === "ready")?.namedPilotId
        ?? namedPilots.find((pilot) => pilot.packageStatus === "active")?.namedPilotId
        ?? namedPilots[0]?.namedPilotId
        ?? "";
}
function preferredPilotCandidateId(candidateGroups) {
    return candidateGroups[0]?.candidateId ?? "";
}
function buildTransferDestinationCatalog(companyContext, aircraft) {
    if (!companyContext) {
        return [];
    }
    return [...new Set([
        companyContext.homeBaseAirportId,
        ...aircraft
            .map((entry) => entry.currentAirportId)
            .filter((airportId) => Boolean(airportId)),
    ])]
        .map((airportId) => {
        const airport = describeAirport(airportId);
        return {
            airportId,
            label: `${airport.code} | ${airport.primaryLabel}${airportId === companyContext.homeBaseAirportId ? " | Home" : ""}`,
        };
    })
        .sort((left, right) => {
        if (left.airportId === companyContext.homeBaseAirportId) {
            return -1;
        }
        if (right.airportId === companyContext.homeBaseAirportId) {
            return 1;
        }
        return left.label.localeCompare(right.label);
    });
}
function buildPilotContextParts(pilot, aircraftById) {
    const contextParts = [];
    const assignedAircraft = pilot.assignedAircraftId ? aircraftById.get(pilot.assignedAircraftId) : undefined;
    if (pilot.packageStatus === "pending") {
        contextParts.push(`Starts ${formatDate(pilot.startsAtUtc)}`);
        contextParts.push("Not active yet");
    }
    else if (pilot.packageStatus === "expired") {
        contextParts.push(pilot.endsAtUtc ? `Expired ${formatDate(pilot.endsAtUtc)}` : "Expired");
        contextParts.push("No longer in active coverage");
    }
    else if (pilot.packageStatus === "cancelled") {
        contextParts.push("Cancelled");
        contextParts.push("No longer in active coverage");
    }
    else if (pilot.availabilityState === "reserved" || pilot.availabilityState === "flying") {
        contextParts.push(assignedAircraft ? assignedAircraft.registration : pilot.assignedAircraftId ? `Aircraft ${pilot.assignedAircraftId}` : "Assigned");
        contextParts.push(pilot.assignmentToUtc ? `until ${formatDate(pilot.assignmentToUtc)}` : undefined);
    }
    else if (pilot.availabilityState === "traveling") {
        contextParts.push(pilot.travelDestinationAirportId ? `Traveling to ${pilot.travelDestinationAirportId}` : "Traveling");
        contextParts.push(pilot.travelUntilUtc ? `until ${formatDate(pilot.travelUntilUtc)}` : undefined);
    }
    else if (pilot.availabilityState === "training") {
        contextParts.push(pilot.trainingTargetCertificationCode
            ? `${pilot.trainingTargetCertificationCode} training until ${formatDate(pilot.trainingUntilUtc)}`
            : pilot.trainingUntilUtc ? `Training until ${formatDate(pilot.trainingUntilUtc)}` : "In training");
    }
    else if (pilot.availabilityState === "resting") {
        contextParts.push(pilot.restingUntilUtc ? `Ready ${formatDate(pilot.restingUntilUtc)}` : "Post-flight rest");
    }
    else {
        contextParts.push(pilot.currentAirportId ? `At ${pilot.currentAirportId}` : "Ready for dispatch");
    }
    return contextParts.filter((entry) => Boolean(entry));
}
function findPilotCoverageSummary(coverage, qualificationGroup) {
    return coverage.find((summary) => summary.laborCategory === "pilot" && summary.qualificationGroup === qualificationGroup) ?? null;
}
function summarizeSupportCoverage(coverage) {
    return coverage
        .filter((summary) => summary.laborCategory !== "pilot")
        .reduce((aggregate, summary) => ({
        activeCoverageUnits: aggregate.activeCoverageUnits + summary.activeCoverageUnits,
        pendingCoverageUnits: aggregate.pendingCoverageUnits + summary.pendingCoverageUnits,
        lanes: aggregate.lanes + 1,
    }), { activeCoverageUnits: 0, pendingCoverageUnits: 0, lanes: 0 });
}
function renderStaffingCoverageRows(coverage, qualificationGroup, namedPilots, staffingState, options = {}) {
    const laneSummary = findPilotCoverageSummary(coverage, qualificationGroup);
    const matchingPilots = namedPilots.filter((pilot) => pilot.qualificationGroup === qualificationGroup);
    const activeMatchingPilots = matchingPilots.filter((pilot) => pilot.packageStatus === "active");
    const readyMatchingPilots = activeMatchingPilots.filter((pilot) => pilot.availabilityState === "ready");
    const supportCoverage = summarizeSupportCoverage(coverage);
    const impactDetail = options.impactDetail ?? `${matchingPilots.length} named pilot${matchingPilots.length === 1 ? "" : "s"} currently map to this lane.`;
    const compact = options.compact === true;
    const coverageDetail = (detail) => compact ? "" : detail;
    return `${renderStaffingFactRow("Pilot lane", laneSummary ? `${formatNumber(laneSummary.activeCoverageUnits)} active | ${formatNumber(laneSummary.pendingCoverageUnits)} pending` : "No pilot coverage", coverageDetail(`${humanize(qualificationGroup)} | ${impactDetail}`))}${renderStaffingFactRow("Roster readiness", `${formatNumber(readyMatchingPilots.length)} ready | ${formatNumber(Math.max(activeMatchingPilots.length - readyMatchingPilots.length, 0))} committed`, coverageDetail(`${formatNumber(activeMatchingPilots.length)} active named pilots are currently tied to this certification lane.`))}${renderStaffingFactRow("Support coverage", supportCoverage.lanes > 0 ? `${formatNumber(supportCoverage.activeCoverageUnits)} active | ${formatNumber(supportCoverage.pendingCoverageUnits)} pending` : "No pooled support", coverageDetail(supportCoverage.lanes > 0 ? `${formatNumber(supportCoverage.lanes)} pooled support lane${supportCoverage.lanes === 1 ? "" : "s"} are currently active or pending.` : "Flight attendants and other support roles can still be added as pooled coverage."))}${renderStaffingFactRow("Labor fixed cost", formatMoney(staffingState?.totalMonthlyFixedCostAmount ?? 0), coverageDetail("Current monthly fixed staffing load across active coverage only."))}`;
}
function renderStaffingCoverageCard(coverage, qualificationGroup, namedPilots, staffingState, options = {}) {
    return `<section class="aircraft-facts-card"><div class="eyebrow">Coverage posture</div><div class="aircraft-facts-list">${renderStaffingCoverageRows(coverage, qualificationGroup, namedPilots, staffingState, options)}</div></section>`;
}
function describePilotLaborRecordEntry(entry) {
    const amountLabel = entry.amount !== undefined ? formatMoney(entry.amount) : null;
    const hoursLabel = entry.hours !== undefined ? `${entry.hours.toFixed(2)} completed flight hour${entry.hours === 1 ? "" : "s"}` : null;
    return `<div class="summary-item compact" data-pilot-labor-entry="${escapeHtml(entry.recordType)}"><div class="meta-stack"><strong>${escapeHtml(entry.title)}</strong><span class="muted">${escapeHtml(formatDate(entry.occurredAtUtc))}</span><span class="muted">${escapeHtml(entry.detail)}</span>${hoursLabel ? `<span class="muted">${escapeHtml(hoursLabel)}</span>` : ""}</div>${amountLabel ? `<strong>${escapeHtml(amountLabel)}</strong>` : ""}</div>`;
}
function renderPilotLaborRecordCard(history) {
    if (!history || history.entries.length === 0) {
        return `<section class="aircraft-facts-card" data-pilot-labor-record><div class="eyebrow">Labor record</div><div class="empty-state compact"><strong>No labor record yet.</strong><div class="muted">This pilot has not generated visible labor events or charges yet.</div></div></section>`;
    }
    return `<section class="aircraft-facts-card" data-pilot-labor-record><div class="eyebrow">Labor record</div><div class="summary-list">${history.entries.map((entry) => describePilotLaborRecordEntry(entry)).join("")}</div></section>`;
}
function renderNamedPilotActions(saveId, tabId, pilot, homeBaseAirportId, transferDestinationCatalog) {
    const canConvertPilot = pilot.packageStatus === "active"
        && pilot.employmentModel === "contract_hire"
        && pilot.availabilityState !== "reserved"
        && pilot.availabilityState !== "flying";
    const convertAction = canConvertPilot
        ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/convert-pilot-to-direct-hire" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="namedPilotId" value="${escapeHtml(pilot.namedPilotId)}" /><button type="submit" data-pending-label="Converting..." data-pilot-convert-direct="${escapeHtml(pilot.namedPilotId)}">Convert to direct hire</button></form>`
        : "";
    const convertNote = canConvertPilot
        ? `<span class="muted">No upfront charge. Salary applies going forward and contract-hour billing stops.</span>`
        : "";
    const convertBlockedNote = pilot.packageStatus === "active"
        && pilot.employmentModel === "contract_hire"
        && (pilot.availabilityState === "reserved" || pilot.availabilityState === "flying")
        ? `<span class="muted" data-pilot-convert-blocked="${escapeHtml(pilot.namedPilotId)}">${escapeHtml(pilot.availabilityState === "reserved"
            ? "Conversion is unavailable while this pilot is reserved for committed contract work."
            : "Conversion is unavailable while this pilot is flying committed contract work.")}</span>`
        : "";
    const canDismissPilot = pilot.packageStatus === "active"
        && (pilot.availabilityState === "ready" || pilot.availabilityState === "resting");
    const dismissAction = canDismissPilot
        ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/dismiss-pilot" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="namedPilotId" value="${escapeHtml(pilot.namedPilotId)}" /><button type="submit" data-pending-label="Dismissing..." data-pilot-dismiss="${escapeHtml(pilot.namedPilotId)}">Dismiss pilot</button></form>`
        : "";
    const dismissBlockedNote = pilot.packageStatus === "active"
        && (pilot.availabilityState === "reserved"
            || pilot.availabilityState === "flying"
            || pilot.availabilityState === "training"
            || pilot.availabilityState === "traveling")
        ? `<span class="muted" data-pilot-dismiss-blocked="${escapeHtml(pilot.namedPilotId)}">${escapeHtml(pilot.availabilityState === "reserved"
            ? "Dismissal is unavailable while this pilot is reserved for scheduled work."
            : pilot.availabilityState === "flying"
                ? "Dismissal is unavailable while this pilot is in flight."
                : pilot.availabilityState === "training"
                    ? "Dismissal is unavailable while this pilot is in training."
                    : "Dismissal is unavailable while this pilot is traveling.")}</span>`
        : "";
    const homeReturnAction = pilot.packageStatus === "active"
        && pilot.availabilityState === "ready"
        && pilot.currentAirportId
        && homeBaseAirportId
        && pilot.currentAirportId !== homeBaseAirportId
        ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/start-pilot-transfer" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="namedPilotId" value="${escapeHtml(pilot.namedPilotId)}" /><input type="hidden" name="destinationAirportId" value="${escapeHtml(homeBaseAirportId)}" /><button type="submit" data-pending-label="Starting return..." data-pilot-home-return-start="${escapeHtml(pilot.namedPilotId)}">Return home</button></form>`
        : "";
    const transferDestinations = transferDestinationCatalog.filter((destination) => destination.airportId !== pilot.currentAirportId && (!homeReturnAction || destination.airportId !== homeBaseAirportId));
    const trainingTargets = pilot.employmentModel === "contract_hire"
        ? []
        : availableCertificationTrainingTargets(pilot.certifications ?? []);
    const trainingAction = pilot.packageStatus === "active" && pilot.availabilityState === "ready"
        ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/start-pilot-training" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="namedPilotId" value="${escapeHtml(pilot.namedPilotId)}" /><select name="targetCertificationCode" aria-label="Training target" data-pilot-training-target="${escapeHtml(pilot.namedPilotId)}"><option value="">Recurrent</option>${trainingTargets.map((target) => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`).join("")}</select><button type="submit" data-pending-label="Starting training..." data-pilot-training-start="${escapeHtml(pilot.namedPilotId)}">Start training</button></form>`
        : "";
    const contractTrainingNote = pilot.packageStatus === "active"
        && pilot.availabilityState === "ready"
        && pilot.employmentModel === "contract_hire"
        ? `<span class="muted">Certification training is not available for contract hires in this first pass.</span>`
        : "";
    const transferAction = pilot.packageStatus === "active" && pilot.availabilityState === "ready" && transferDestinations.length > 0
        ? `<form method="post" action="/api/save/${encodeURIComponent(saveId)}/actions/start-pilot-transfer" class="inline" data-api-form>${renderHiddenContext(saveId, tabId)}<input type="hidden" name="namedPilotId" value="${escapeHtml(pilot.namedPilotId)}" /><select name="destinationAirportId" aria-label="Transfer destination" data-pilot-transfer-destination="${escapeHtml(pilot.namedPilotId)}">${transferDestinations.map((destination) => `<option value="${escapeHtml(destination.airportId)}">${escapeHtml(destination.label)}</option>`).join("")}</select><button type="submit" data-pending-label="Starting transfer..." data-pilot-transfer-start="${escapeHtml(pilot.namedPilotId)}">Transfer</button></form>`
        : "";
    const readyTransferNote = pilot.packageStatus === "active" && pilot.availabilityState === "ready" && !homeReturnAction && !transferAction
        ? `<span class="muted">No transfer route is available from the current airport.</span>`
        : "";
    const unavailableLabel = pilot.availabilityState === "training"
        ? "Training is already active for this pilot."
        : pilot.availabilityState === "traveling"
            ? "This pilot is already repositioning."
            : pilot.availabilityState === "resting"
                ? "This pilot is still in post-flight rest."
                : pilot.packageStatus === "pending"
                    ? "This hire has not started active duty yet."
                    : pilot.packageStatus === "cancelled"
                        ? "This pilot has already been dismissed from active coverage."
                    : "No immediate action is available right now.";
    const actions = [convertAction, convertNote, convertBlockedNote, dismissAction, dismissBlockedNote, trainingAction, contractTrainingNote, homeReturnAction, transferAction, readyTransferNote].filter((entry) => Boolean(entry));
    return actions.length > 0
        ? `<div class="meta-stack">${actions.join("")}</div>`
        : `<div class="muted">${escapeHtml(unavailableLabel)}</div>`;
}
function renderNamedPilotDetail(saveId, tabId, pilot, context) {
    if (!pilot) {
        return `<div class="aircraft-detail-stack"><section class="aircraft-facts-card"><div class="eyebrow">Employee detail</div><div class="empty-state compact"><strong>No employee selected.</strong><div class="muted">Select a pilot from the roster to review certifications, current availability, and employee actions.</div></div></section></div>`;
    }
    const aircraftById = context.aircraftById;
    const statusContext = buildPilotContextParts(pilot, aircraftById);
    const assignedAircraft = pilot.assignedAircraftId ? aircraftById.get(pilot.assignedAircraftId) : undefined;
    const currentAirport = pilot.currentAirportId ? describeAirport(pilot.currentAirportId) : null;
    const homeBaseAirport = context.homeBaseAirportId ? describeAirport(context.homeBaseAirportId) : null;
    const statusBadges = renderNamedPilotStatusBadges(pilot);
    const actionBody = renderNamedPilotActions(saveId, tabId, pilot, context.homeBaseAirportId, context.transferDestinationCatalog);
    const laborHistory = context.pilotLaborHistoryByPilotId?.get(pilot.namedPilotId) ?? null;
    const portraitSeed = resolveEmployeePortraitSeed(pilot);
    const employeeNotes = [
        pilot.packageStatus === "pending" ? `Starts active duty ${formatDate(pilot.startsAtUtc)}.` : undefined,
        pilot.employmentModel === "contract_hire" && pilot.endsAtUtc ? `Contract ends ${formatDate(pilot.endsAtUtc)}.` : undefined,
    ].filter((entry) => Boolean(entry));
    return `<div class="aircraft-detail-stack" data-staffing-selected-detail="employees"><section class="aircraft-facts-card"><div class="staff-identity-card">${renderStaffPortrait(portraitSeed, "employees-detail", { size: "detail" })}<div class="meta-stack"><div class="eyebrow">Employee brief</div><strong data-staffing-selected-employee>${escapeHtml(pilot.displayName)}</strong><span class="muted">${escapeHtml(formatEmploymentModelLabel(pilot.employmentModel))} | ${escapeHtml(formatPilotCertificationList(pilot.certifications ?? []))}</span>${statusBadges ? `<div class="pill-row">${statusBadges}</div>` : ""}</div></div></section><section class="aircraft-facts-card"><div class="eyebrow">Operational brief</div><div class="aircraft-facts-list">${renderStaffingFactRow("Certifications", formatPilotCertificationList(pilot.certifications ?? []), `${humanize(pilot.qualificationGroup)} lane`) + renderStaffingFactRow("Employment", formatEmploymentModelLabel(pilot.employmentModel), pilot.employmentModel === "contract_hire"
        ? (pilot.endsAtUtc ? `Contract end ${formatDate(pilot.endsAtUtc)}.` : "Fixed-term named pilot hire.")
        : "Open-ended named pilot hire.") + renderStaffingFactRow("Status", humanize(pilot.availabilityState), statusContext.join(" | ") || (pilot.packageStatus === "active" ? "Available for new work." : "Not currently active for operations.")) + renderStaffingFactRow("Current base", currentAirport ? `${currentAirport.code} | ${currentAirport.primaryLabel}` : "Unassigned", homeBaseAirport ? `Home ${homeBaseAirport.code} | ${homeBaseAirport.primaryLabel}` : "No company home base is set.") + renderStaffingFactRow("Assignment", assignedAircraft ? assignedAircraft.registration : "No committed aircraft", assignedAircraft ? `Currently tied to ${assignedAircraft.registration} for operational coverage.` : "No current aircraft commitment is holding this pilot.") + renderStaffingFactListRow("Notes", employeeNotes)}</div></section>${renderPilotLaborRecordCard(laborHistory)}${renderStaffingCoverageCard(context.coverage, pilot.qualificationGroup, context.namedPilots, context.staffingState)}<section class="aircraft-facts-card"><div class="eyebrow">Employee actions</div>${actionBody}</section></div>`;
}
function renderHireCandidateDetail(saveId, tabId, candidate, context) {
    if (!candidate) {
        return `<div class="aircraft-detail-stack"><section class="aircraft-facts-card"><div class="eyebrow">Hiring detail</div><div class="empty-state compact"><strong>No pilot candidate is selected.</strong><div class="muted">This market only shows named pilots who are available now.</div></div></section></div>`;
    }
    const profile = candidate.candidateProfile;
    const directOffer = candidate.directOffer;
    const contractOffer = candidate.contractOffer;
    const primaryOffer = directOffer ?? contractOffer;
    const currentAirport = candidate.currentAirportId ? describeAirport(candidate.currentAirportId) : null;
    const availabilityLabel = formatStaffingAvailabilityLabel(primaryOffer?.candidateState ?? "available_now", primaryOffer?.startsAtUtc);
    const whyHireLines = resolveCandidateStrengthsAndWeaknesses(candidate);
    const comparisonCards = [directOffer, contractOffer]
        .filter((offer) => Boolean(offer))
        .map((offer) => renderHireComparisonCard(saveId, tabId, candidate, offer, context))
        .join("");
    const pilotSnapshotRows = renderStaffingFactRow("Base", currentAirport ? `${currentAirport.code} | ${currentAirport.primaryLabel}` : "Unassigned base")
        + renderStaffingFactRow("Availability", availabilityLabel)
        + renderStaffingFactRow("Total career hours", formatPilotHours(profile?.totalCareerHours ?? 0));
    const snapshotMarkup = `<div class="staffing-snapshot-grid"><div class="staffing-snapshot-brief"><div class="aircraft-facts-list staffing-compact-facts">${pilotSnapshotRows}${renderStaffingFactRow("Certifications", renderCandidateCertificationList(candidate.certifications ?? []))}</div></div>${renderCandidateCertificationHoursTable(profile, candidate.certifications ?? [])}</div>`;
    const whyHireMarkup = `<ul class="staffing-detail-note-list" data-staffing-strengths-weaknesses>${whyHireLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
    return `<div class="aircraft-detail-stack staffing-hire-detail-grid" data-staffing-selected-detail="hire"><section class="aircraft-facts-card staffing-detail-section staffing-detail-section--snapshot"><div class="eyebrow">Pilot snapshot</div>${snapshotMarkup}</section><section class="aircraft-facts-card staffing-detail-section staffing-detail-section--comparison"><div class="eyebrow">Direct versus contract</div><div class="summary-list staffing-comparison-grid">${comparisonCards}</div></section><section class="aircraft-facts-card staffing-detail-section staffing-detail-section--profile"><div class="eyebrow">Operational profile</div>${renderCandidateOperationalProfileGrid(profile)}</section><section class="aircraft-facts-card staffing-detail-section staffing-detail-section--why-hire"><div class="eyebrow">Strengths and weaknesses</div>${whyHireMarkup}</section><section class="aircraft-facts-card staffing-detail-section staffing-detail-section--coverage"><div class="eyebrow">Coverage impact</div><div class="aircraft-facts-list staffing-coverage-strip">${renderHireCoverageRows(context.coverage, candidate.qualificationGroup, context.namedPilots, context.staffingState, { compact: true })}</div></section></div>`;
}
function renderPilotRosterTable(namedPilots, selectedPilotId, aircraftById) {
    return `<div class="aircraft-table-wrap table-wrap" data-staffing-roster data-staffing-scroll-region="employees:list"><table><thead><tr><th>Pilot</th><th>Certifications</th><th>Status</th><th>Context</th></tr></thead><tbody>${namedPilots.map((pilot) => {
        const isSelected = pilot.namedPilotId === selectedPilotId;
        const portraitSeed = resolveEmployeePortraitSeed(pilot);
        return `<tr class="aircraft-row ${isSelected ? "selected" : ""}" data-staffing-pilot-row="${escapeHtml(pilot.namedPilotId)}" data-staffing-row-select="employees" data-staffing-detail-id="${escapeHtml(pilot.namedPilotId)}" aria-selected="${isSelected ? "true" : "false"}" tabindex="0"><td><div class="staff-identity">${renderStaffPortrait(portraitSeed, "employees-row")}<div class="meta-stack"><strong>${escapeHtml(pilot.displayName)}</strong><span class="muted">${escapeHtml(formatEmploymentModelLabel(pilot.employmentModel))}</span></div></div></td><td><div class="meta-stack"><span>${escapeHtml(formatPilotCertificationList(pilot.certifications ?? []))}</span><span class="muted">${escapeHtml(humanize(pilot.qualificationGroup))}</span></div></td><td><div class="pill-row">${renderNamedPilotStatusBadges(pilot)}</div></td><td>${escapeHtml(buildPilotContextParts(pilot, aircraftById).join(" | "))}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}
function renderStaffingDetailTemplate(view, detailId, title, body, options = {}) {
    const portraitSrcAttribute = options.portraitSrc
        ? ` data-staffing-detail-portrait-src="${escapeHtml(options.portraitSrc)}"`
        : "";
    return `<template data-staffing-detail-template="${escapeHtml(view)}" data-staffing-detail-id="${escapeHtml(detailId)}" data-staffing-detail-title="${escapeHtml(title)}"${portraitSrcAttribute}>${body}</template>`;
}

function renderStaffing(saveId, tabId, source) {
    const staffingState = source.staffingState;
    const staffingMarket = source.staffingMarket;
    const coverage = staffingState?.coverageSummaries ?? [];
    const packages = staffingState?.staffingPackages ?? [];
    const namedPilots = staffingState?.namedPilots ?? [];
    const pilotPackages = packages.filter((pkg) => pkg.laborCategory === "pilot");
    const availablePilotCandidates = buildPilotCandidateMarketViews(source);
    const availablePilotOfferCount = availablePilotCandidates.length;
    const hasPendingPilotCoverage = pilotPackages.some((pkg) => pkg.status === "pending");
    const defaultWorkspaceTab = namedPilots.length > 0 ? "employees" : "hire";
    const fleetAircraft = source.fleetState?.aircraft ?? [];
    const aircraftById = new Map(fleetAircraft.map((aircraft) => [aircraft.aircraftId, aircraft]));
    const homeBaseAirportId = source.companyContext?.homeBaseAirportId;
    const transferDestinationCatalog = buildTransferDestinationCatalog(source.companyContext, fleetAircraft);
    const pilotLaborHistoryByPilotId = source.pilotLaborHistoryByPilotId ?? new Map();
    const defaultEmployeeId = preferredNamedPilotId(namedPilots);
    const defaultHireId = preferredPilotCandidateId(availablePilotCandidates);
    const pilotDetailContext = {
        aircraftById,
        coverage,
        namedPilots,
        staffingState,
        homeBaseAirportId,
        transferDestinationCatalog,
        pilotLaborHistoryByPilotId,
    };
    const hireDetailContext = {
        api: true,
        coverage,
        namedPilots,
        staffingState,
    };
    const selectedPilot = namedPilots.find((pilot) => pilot.namedPilotId === defaultEmployeeId) ?? null;
    const selectedCandidate = availablePilotCandidates.find((candidate) => candidate.candidateId === defaultHireId) ?? null;
    const rosterBody = namedPilots.length === 0
        ? `<div class="empty-state" data-staffing-roster-empty><strong>No pilot roster yet.</strong><div class="muted">${hasPendingPilotCoverage
            ? "Hired pilots with future starts will appear here as they move toward active duty."
            : "Hire an individual pilot candidate to create the first named roster entry."} Training, transfer, and return-home actions will appear here once the roster is live.</div></div>`
        : renderPilotRosterTable(namedPilots, defaultEmployeeId, aircraftById);
    const hireStaffBody = renderPilotHiringMarket(saveId, tabId, source, { api: true, selectedCandidateId: defaultHireId });
    const employeeDetailTitle = selectedPilot?.displayName ?? "Employee Detail";
    const employeeDetailBody = renderNamedPilotDetail(saveId, tabId, selectedPilot, pilotDetailContext);
    const employeeTemplates = namedPilots.map((pilot) => renderStaffingDetailTemplate("employees", pilot.namedPilotId, pilot.displayName, renderNamedPilotDetail(saveId, tabId, pilot, pilotDetailContext))).join("");
    const hireDetailTitle = selectedCandidate?.displayName ?? "Hiring Detail";
    const hireDetailPortraitSeed = selectedCandidate ? resolveCandidateGroupPortraitSeed(selectedCandidate) : "staff-portrait";
    const hireDetailPortraitSrc = resolveStaffPortraitSrc(hireDetailPortraitSeed);
    const hireDetailBody = renderHireCandidateDetail(saveId, tabId, selectedCandidate, hireDetailContext);
    const hireTemplates = availablePilotCandidates.map((candidate) => {
        const portraitSeed = resolveCandidateGroupPortraitSeed(candidate);
        return renderStaffingDetailTemplate("hire", candidate.candidateId, candidate.displayName ?? "Pilot candidate", renderHireCandidateDetail(saveId, tabId, candidate, hireDetailContext), { portraitSrc: resolveStaffPortraitSrc(portraitSeed) });
    }).join("");
    const employeesWorkspace = `<section class="aircraft-workspace-body" data-staffing-workspace-panel="employees"${defaultWorkspaceTab === "employees" ? "" : " hidden"}><div class="aircraft-workbench"><section class="panel aircraft-fleet-panel"><div class="panel-head"><h3>Pilot Roster</h3></div><div class="panel-body aircraft-fleet-body"><div class="meta-stack"><strong>Employees</strong><span class="muted">Select a pilot to review certifications, availability, and employee actions.</span></div>${rosterBody}</div></section><section class="panel aircraft-detail-panel" data-staffing-detail-panel="employees"><div class="panel-head"><h3 data-staffing-detail-title="employees">${escapeHtml(employeeDetailTitle)}</h3></div><div class="panel-body aircraft-detail-body" data-staffing-detail-body="employees" data-staffing-scroll-region="employees:detail">${employeeDetailBody}</div><div hidden data-staffing-detail-bank="employees">${employeeTemplates}</div></section></div></section>`;
    const hireWorkspace = `<section class="aircraft-workspace-body staffing-hire-workspace" data-staffing-workspace-panel="hire"${defaultWorkspaceTab === "hire" ? "" : " hidden"}><div class="staffing-hire-stage" data-staffing-hire-stage><section class="panel staffing-hire-table-panel"><div class="panel-head"><div class="meta-stack"><h3>Hire Staff</h3><span class="muted">Choose a direct or contract pilot hire. This market now broadens the candidate pool and keeps every listed pilot immediately hireable.</span></div></div><div class="panel-body staffing-hire-table-body">${hireStaffBody}</div></section><div class="staffing-hire-overlay" data-staffing-hire-overlay data-staffing-detail-panel="hire" hidden><button type="button" class="staffing-hire-overlay-backdrop" data-staffing-detail-close="hire" aria-label="Close hiring detail"></button><section class="panel staffing-hire-overlay-card"><div class="panel-head"><div class="staffing-detail-headline">${renderStaffPortrait(hireDetailPortraitSeed, "hire-detail", { size: "detail", detailView: "hire" })}<h3 data-staffing-detail-title="hire">${escapeHtml(hireDetailTitle)}</h3></div><button type="button" class="ghost-button" data-staffing-detail-close="hire">Close</button></div><div class="panel-body aircraft-detail-body" data-staffing-detail-body="hire" data-staffing-scroll-region="hire:detail">${hireDetailBody}</div><div hidden data-staffing-detail-bank="hire">${hireTemplates}</div></section></div></div></section>`;
    return `<div class="staffing-tab-host staffing-workspace-host" data-staffing-tab-host data-staffing-save-id="${escapeHtml(saveId)}" data-staffing-default-view="${escapeHtml(defaultWorkspaceTab)}" data-staffing-default-employee-id="${escapeHtml(defaultEmployeeId)}" data-staffing-default-hire-id="${escapeHtml(defaultHireId)}"><section class="panel staffing-workspace-panel"><div class="panel-head"><h3>Staff Workspace</h3><div class="contracts-board-tabs" role="tablist" aria-label="Staff workspace"><button type="button" class="contracts-board-tab ${defaultWorkspaceTab === "employees" ? "current" : ""}" data-staffing-workspace-tab="employees" role="tab" aria-selected="${defaultWorkspaceTab === "employees" ? "true" : "false"}">Employees<span class="contracts-board-tab-count">${escapeHtml(String(namedPilots.length))}</span></button><button type="button" class="contracts-board-tab ${defaultWorkspaceTab === "hire" ? "current" : ""}" data-staffing-workspace-tab="hire" role="tab" aria-selected="${defaultWorkspaceTab === "hire" ? "true" : "false"}">Hire<span class="contracts-board-tab-count">${escapeHtml(String(availablePilotOfferCount))}</span></button></div></div><div class="panel-body staffing-workspace-shell">${employeesWorkspace}${hireWorkspace}</div></section></div>`;
}
