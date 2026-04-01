import type {
  ContractsViewAcceptedContract,
  ContractsViewAircraftCue,
  ContractsViewAirport,
  ContractsViewCompanyContract,
  ContractsViewOffer,
  ContractsViewPayload,
} from "./contracts-view-model.js";

export interface ContractsBoardFilters {
  departureSearchText: string;
  destinationSearchText: string;
  nearestAircraftSearchText: string;
  readyAircraft: boolean;
  noReadyAircraft: boolean;
  passengerPayloadMin: string;
  passengerPayloadMax: string;
  cargoPayloadMin: string;
  cargoPayloadMax: string;
  distanceMin: string;
  distanceMax: string;
  hoursRemainingMin: string;
  hoursRemainingMax: string;
  dueHoursMin: string;
  dueHoursMax: string;
  payoutMin: string;
  payoutMax: string;
}

export interface ContractsBoardAppliedTextFilters {
  departureSearchText: string;
  destinationSearchText: string;
  nearestAircraftSearchText: string;
}

export type ContractsBoardTab = "available" | "active" | "closed";
export type ContractsBoardScope = "all" | "my_contracts";
export type ContractsBoardSortField = "route" | "payload" | "nearestAircraft" | "distanceNm" | "hoursRemaining" | "dueUtc" | "payout";
export type ContractsBoardSortDirection = "asc" | "desc";
export type ContractsBoardCompanyContractLike = ContractsViewAcceptedContract | ContractsViewCompanyContract;

interface IndexedRouteBase<RouteType extends ContractsViewOffer | ContractsBoardCompanyContractLike> {
  route: RouteType;
  routeId: string;
  routeSortLabel: string;
  departureSearchHaystack: string;
  destinationSearchHaystack: string;
  nearestAircraftSearchHaystack: string;
  distanceNm: number;
  hoursRemaining: number;
  dueUtc: string;
  payloadAmount: number;
  passengerPayloadAmount: number;
  cargoPayloadAmount: number;
  hasReadyAircraft: boolean;
  nearestAircraftDistanceNm: number;
  nearestAircraftRegistration: string;
}

export interface ContractsBoardOfferRowView extends IndexedRouteBase<ContractsViewOffer> {}

export interface ContractsBoardCompanyContractRowView extends IndexedRouteBase<ContractsBoardCompanyContractLike> {}

interface ContractsBoardIndexedPayload {
  availableOffers: ContractsBoardOfferRowView[];
  activeContracts: ContractsBoardCompanyContractRowView[];
  closedContracts: ContractsBoardCompanyContractRowView[];
  availableCount: number;
  activeCount: number;
  closedCount: number;
}

export interface ContractsBoardViewState {
  availableCount: number;
  activeCount: number;
  riskyActiveCount: number;
  closedCount: number;
  visibleOffers: ContractsBoardOfferRowView[];
  visibleCompanyContracts: ContractsBoardCompanyContractRowView[];
  selectedOfferId: string | null;
  selectedCompanyContractId: string | null;
}

const activeContractStates = new Set(["accepted", "assigned", "active"]);
const closedContractStates = new Set(["completed", "late_completed", "failed", "cancelled"]);
const indexedPayloadCache = new WeakMap<ContractsViewPayload, ContractsBoardIndexedPayload>();

export function warmContractsBoardViewPayload(payload: ContractsViewPayload | null | undefined): void {
  if (!payload) {
    return;
  }

  getIndexedPayload(payload);
}

export function applyContractsBoardViewState(
  payload: ContractsViewPayload,
  options: {
    filters: ContractsBoardFilters;
    appliedTextFilters: ContractsBoardAppliedTextFilters;
    boardTab: ContractsBoardTab;
    boardScope: ContractsBoardScope;
    sortField: ContractsBoardSortField | null;
    sortDirection: ContractsBoardSortDirection;
    selectedOfferId: string | null;
    selectedCompanyContractId: string | null;
  },
): ContractsBoardViewState {
  const indexedPayload = getIndexedPayload(payload);
  const parsedFilters = parseFilters(options.filters);

  const visibleOffers = sortOfferViews(
    filterRouteViews(indexedPayload.availableOffers, parsedFilters, options.appliedTextFilters),
    options.sortField,
    options.sortDirection,
  );

  const riskyActiveContracts = filterRouteViews(
    indexedPayload.activeContracts.filter((entry) => entry.route.urgencyBand !== "stable"),
    parsedFilters,
    options.appliedTextFilters,
  );

  const companyContractSource = options.boardTab === "closed"
    ? indexedPayload.closedContracts
    : options.boardScope === "my_contracts"
      ? riskyActiveContracts
      : filterRouteViews(indexedPayload.activeContracts, parsedFilters, options.appliedTextFilters);

  const visibleCompanyContracts = sortCompanyContractViews(
    companyContractSource,
    options.boardTab,
    options.boardScope,
    options.sortField,
    options.sortDirection,
  );

  return {
    availableCount: indexedPayload.availableCount,
    activeCount: indexedPayload.activeCount,
    riskyActiveCount: riskyActiveContracts.length,
    closedCount: indexedPayload.closedCount,
    visibleOffers,
    visibleCompanyContracts,
    selectedOfferId: resolveSelectedOfferId(visibleOffers, options.selectedOfferId),
    selectedCompanyContractId: resolveSelectedCompanyContractId(visibleCompanyContracts, options.selectedCompanyContractId),
  };
}

function getIndexedPayload(payload: ContractsViewPayload): ContractsBoardIndexedPayload {
  const cached = indexedPayloadCache.get(payload);
  if (cached) {
    return cached;
  }

  const availableOffers = diversifyDefaultOfferOrder(payload.offers
    .filter((offer) => offer.offerStatus === "available")
    .map((offer) => buildOfferRowView(offer)));
  const activeContracts = payload.acceptedContracts
    .filter((contract) => activeContractStates.has(contract.contractState))
    .map((contract) => buildCompanyContractRowView(contract, payload.currentTimeUtc));
  const closedContracts = payload.companyContracts
    .filter((contract) => closedContractStates.has(contract.contractState))
    .map((contract) => buildCompanyContractRowView(contract, payload.currentTimeUtc));
  const indexed: ContractsBoardIndexedPayload = {
    availableOffers,
    activeContracts,
    closedContracts,
    availableCount: availableOffers.length,
    activeCount: activeContracts.length,
    closedCount: closedContracts.length,
  };

  indexedPayloadCache.set(payload, indexed);
  return indexed;
}

function diversifyDefaultOfferOrder(views: ContractsBoardOfferRowView[]): ContractsBoardOfferRowView[] {
  if (views.length <= 2) {
    return views;
  }

  const passengerBuckets = buildVolumeBuckets(views, "passenger");
  const cargoBuckets = buildVolumeBuckets(views, "cargo");
  const volumeCounts = {
    passenger: views.filter((entry) => entry.route.volumeType === "passenger").length,
    cargo: views.filter((entry) => entry.route.volumeType === "cargo").length,
  };
  const result: ContractsBoardOfferRowView[] = [];
  let preferredVolumeType: ContractsViewOffer["volumeType"] = volumeCounts.passenger >= volumeCounts.cargo
    ? "passenger"
    : "cargo";

  while (result.length < views.length) {
    const nextEntry = takeNextBucketOffer(
      preferredVolumeType === "passenger" ? passengerBuckets : cargoBuckets,
    ) ?? takeNextBucketOffer(
      preferredVolumeType === "passenger" ? cargoBuckets : passengerBuckets,
    );

    if (!nextEntry) {
      break;
    }

    result.push(nextEntry);
    volumeCounts[nextEntry.route.volumeType] = Math.max(0, volumeCounts[nextEntry.route.volumeType] - 1);
    const alternateVolumeType: ContractsViewOffer["volumeType"] = nextEntry.route.volumeType === "passenger"
      ? "cargo"
      : "passenger";
    preferredVolumeType = volumeCounts[alternateVolumeType] > 0
      ? alternateVolumeType
      : nextEntry.route.volumeType;
  }

  return result;
}

interface ContractsBoardVolumeBucket {
  offerViews: ContractsBoardOfferRowView[];
  nextIndex: number;
}

interface ContractsBoardVolumeBuckets {
  buckets: ContractsBoardVolumeBucket[];
  nextBucketIndex: number;
}

function buildVolumeBuckets(
  views: ContractsBoardOfferRowView[],
  volumeType: ContractsViewOffer["volumeType"],
): ContractsBoardVolumeBuckets {
  const bucketMap = new Map<string, ContractsBoardOfferRowView[]>();

  for (const view of views) {
    if (view.route.volumeType !== volumeType) {
      continue;
    }

    const originKey = view.route.origin.code;
    const bucket = bucketMap.get(originKey);
    if (bucket) {
      bucket.push(view);
    } else {
      bucketMap.set(originKey, [view]);
    }
  }

  const buckets = [...bucketMap.entries()]
    .map(([originCode, offerViews]) => ({
      originCode,
      offerViews,
      nextIndex: 0,
      topPayoutAmount: offerViews[0]?.route.payoutAmount ?? 0,
    }))
    .sort((left, right) =>
      right.topPayoutAmount - left.topPayoutAmount
      || left.originCode.localeCompare(right.originCode))
    .map((entry) => ({
      offerViews: entry.offerViews,
      nextIndex: entry.nextIndex,
    }));

  return {
    buckets,
    nextBucketIndex: 0,
  };
}

function takeNextBucketOffer(volumeBuckets: ContractsBoardVolumeBuckets): ContractsBoardOfferRowView | null {
  const { buckets } = volumeBuckets;
  if (buckets.length === 0) {
    return null;
  }

  for (let attempt = 0; attempt < buckets.length; attempt += 1) {
    const bucketIndex = (volumeBuckets.nextBucketIndex + attempt) % buckets.length;
    const bucket = buckets[bucketIndex];
    if (!bucket) {
      continue;
    }
    const nextOffer = bucket.offerViews[bucket.nextIndex];
    if (!nextOffer) {
      continue;
    }

    bucket.nextIndex += 1;
    volumeBuckets.nextBucketIndex = (bucketIndex + 1) % buckets.length;
    return nextOffer;
  }

  return null;
}

function buildOfferRowView(offer: ContractsViewOffer): ContractsBoardOfferRowView {
  return {
    route: offer,
    routeId: offer.contractOfferId,
    routeSortLabel: buildRouteSortLabel(offer.origin, offer.destination),
    departureSearchHaystack: buildAirportSearchHaystack(offer.origin),
    destinationSearchHaystack: buildAirportSearchHaystack(offer.destination),
    nearestAircraftSearchHaystack: buildAircraftSearchHaystack(offer.nearestRelevantAircraft),
    distanceNm: haversineDistanceNm(offer.origin.latitudeDeg, offer.origin.longitudeDeg, offer.destination.latitudeDeg, offer.destination.longitudeDeg),
    hoursRemaining: offer.timeRemainingHours,
    dueUtc: offer.latestCompletionUtc,
    payloadAmount: routePayloadAmount(offer),
    passengerPayloadAmount: offer.passengerCount ?? 0,
    cargoPayloadAmount: offer.cargoWeightLb ?? 0,
    hasReadyAircraft: Boolean(offer.nearestRelevantAircraft),
    nearestAircraftDistanceNm: offer.nearestRelevantAircraft?.distanceNm ?? Number.POSITIVE_INFINITY,
    nearestAircraftRegistration: offer.nearestRelevantAircraft?.registration ?? "",
  };
}

function buildCompanyContractRowView(
  contract: ContractsBoardCompanyContractLike,
  currentTimeUtc: string,
): ContractsBoardCompanyContractRowView {
  return {
    route: contract,
    routeId: contract.companyContractId,
    routeSortLabel: buildRouteSortLabel(contract.origin, contract.destination),
    departureSearchHaystack: buildAirportSearchHaystack(contract.origin),
    destinationSearchHaystack: buildAirportSearchHaystack(contract.destination),
    nearestAircraftSearchHaystack: buildAircraftSearchHaystack(contract.nearestRelevantAircraft),
    distanceNm: haversineDistanceNm(contract.origin.latitudeDeg, contract.origin.longitudeDeg, contract.destination.latitudeDeg, contract.destination.longitudeDeg),
    hoursRemaining: Math.max(0, (Date.parse(contract.deadlineUtc) - Date.parse(currentTimeUtc)) / 3_600_000),
    dueUtc: contract.deadlineUtc,
    payloadAmount: routePayloadAmount(contract),
    passengerPayloadAmount: contract.passengerCount ?? 0,
    cargoPayloadAmount: contract.cargoWeightLb ?? 0,
    hasReadyAircraft: Boolean(contract.nearestRelevantAircraft),
    nearestAircraftDistanceNm: contract.nearestRelevantAircraft?.distanceNm ?? Number.POSITIVE_INFINITY,
    nearestAircraftRegistration: contract.nearestRelevantAircraft?.registration ?? "",
  };
}

function resolveSelectedOfferId(
  visibleOffers: ContractsBoardOfferRowView[],
  requestedOfferId: string | null,
): string | null {
  if (visibleOffers.some((entry) => entry.route.contractOfferId === requestedOfferId)) {
    return requestedOfferId;
  }

  return visibleOffers[0]?.route.contractOfferId ?? null;
}

function resolveSelectedCompanyContractId(
  visibleCompanyContracts: ContractsBoardCompanyContractRowView[],
  requestedCompanyContractId: string | null,
): string | null {
  if (visibleCompanyContracts.some((entry) => entry.route.companyContractId === requestedCompanyContractId)) {
    return requestedCompanyContractId;
  }

  return visibleCompanyContracts[0]?.route.companyContractId ?? null;
}

function parseFilters(filters: ContractsBoardFilters): {
  departureSearchText: string;
  destinationSearchText: string;
  nearestAircraftSearchText: string;
  readyAircraft: boolean;
  noReadyAircraft: boolean;
  passengerPayloadMin: number;
  passengerPayloadMax: number;
  cargoPayloadMin: number;
  cargoPayloadMax: number;
  distanceMin: number;
  distanceMax: number;
  hoursRemainingMin: number;
  hoursRemainingMax: number;
  dueHoursMin: number;
  dueHoursMax: number;
  payoutMin: number;
  payoutMax: number;
} {
  return {
    departureSearchText: normalizeSearchText(filters.departureSearchText),
    destinationSearchText: normalizeSearchText(filters.destinationSearchText),
    nearestAircraftSearchText: normalizeSearchText(filters.nearestAircraftSearchText),
    readyAircraft: filters.readyAircraft,
    noReadyAircraft: filters.noReadyAircraft,
    passengerPayloadMin: parseRangeValue(filters.passengerPayloadMin),
    passengerPayloadMax: parseRangeValue(filters.passengerPayloadMax),
    cargoPayloadMin: parseRangeValue(filters.cargoPayloadMin),
    cargoPayloadMax: parseRangeValue(filters.cargoPayloadMax),
    distanceMin: parseRangeValue(filters.distanceMin),
    distanceMax: parseRangeValue(filters.distanceMax),
    hoursRemainingMin: parseRangeValue(filters.hoursRemainingMin),
    hoursRemainingMax: parseRangeValue(filters.hoursRemainingMax),
    dueHoursMin: parseRangeValue(filters.dueHoursMin),
    dueHoursMax: parseRangeValue(filters.dueHoursMax),
    payoutMin: parseRangeValue(filters.payoutMin),
    payoutMax: parseRangeValue(filters.payoutMax),
  };
}

function filterRouteViews<
  RouteView extends ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
>(
  views: RouteView[],
  filters: ReturnType<typeof parseFilters>,
  appliedTextFilters: ContractsBoardAppliedTextFilters,
): RouteView[] {
  const departureSearchText = normalizeSearchText(appliedTextFilters.departureSearchText) || filters.departureSearchText;
  const destinationSearchText = normalizeSearchText(appliedTextFilters.destinationSearchText) || filters.destinationSearchText;
  const nearestAircraftSearchText = normalizeSearchText(appliedTextFilters.nearestAircraftSearchText) || filters.nearestAircraftSearchText;

  return views.filter((view) => {
    if (departureSearchText && !view.departureSearchHaystack.includes(departureSearchText)) {
      return false;
    }

    if (destinationSearchText && !view.destinationSearchHaystack.includes(destinationSearchText)) {
      return false;
    }

    if (nearestAircraftSearchText && !view.nearestAircraftSearchHaystack.includes(nearestAircraftSearchText)) {
      return false;
    }

    if (!matchesNearestAircraftFilter(view.hasReadyAircraft, filters.readyAircraft, filters.noReadyAircraft)) {
      return false;
    }

    if (!matchesPayloadFilters(view, filters.passengerPayloadMin, filters.passengerPayloadMax, filters.cargoPayloadMin, filters.cargoPayloadMax)) {
      return false;
    }

    if (!matchesNumericRange(view.distanceNm, filters.distanceMin, filters.distanceMax)) {
      return false;
    }

    if (!matchesNumericRange(view.hoursRemaining, filters.hoursRemainingMin, filters.hoursRemainingMax)) {
      return false;
    }

    if (!matchesNumericRange(view.hoursRemaining, filters.dueHoursMin, filters.dueHoursMax)) {
      return false;
    }

    if (!matchesNumericRange(view.route.payoutAmount, filters.payoutMin, filters.payoutMax)) {
      return false;
    }

    return true;
  });
}

function sortOfferViews(
  views: ContractsBoardOfferRowView[],
  sortField: ContractsBoardSortField | null,
  sortDirection: ContractsBoardSortDirection,
): ContractsBoardOfferRowView[] {
  if (!sortField) {
    return views;
  }

  return [...views].sort((left, right) => compareRouteViews(left, right, sortField, sortDirection));
}

function sortCompanyContractViews(
  views: ContractsBoardCompanyContractRowView[],
  boardTab: ContractsBoardTab,
  boardScope: ContractsBoardScope,
  sortField: ContractsBoardSortField | null,
  sortDirection: ContractsBoardSortDirection,
): ContractsBoardCompanyContractRowView[] {
  if (boardTab === "active" && boardScope === "my_contracts") {
    return [...views].sort(compareMyContracts);
  }

  if (!sortField) {
    return views;
  }

  return [...views].sort((left, right) => compareRouteViews(left, right, sortField, sortDirection));
}

function compareRouteViews(
  left: ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
  right: ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
  sortField: ContractsBoardSortField,
  sortDirection: ContractsBoardSortDirection,
): number {
  switch (sortField) {
    case "route":
      return compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "payload":
      return compareNumber(left.payloadAmount, right.payloadAmount, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "nearestAircraft":
      return compareNearestAircraft(left, right, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "distanceNm":
      return compareNumber(left.distanceNm, right.distanceNm, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "hoursRemaining":
      return compareNumber(left.hoursRemaining, right.hoursRemaining, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "dueUtc":
      return compareText(left.dueUtc, right.dueUtc, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    case "payout":
      return compareNumber(left.route.payoutAmount, right.route.payoutAmount, sortDirection)
        || compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
    default:
      return compareText(left.routeSortLabel, right.routeSortLabel, sortDirection);
  }
}

function compareMyContracts(
  left: ContractsBoardCompanyContractRowView,
  right: ContractsBoardCompanyContractRowView,
): number {
  const urgencyWeight = (urgencyBand: ContractsBoardCompanyContractLike["urgencyBand"]): number => {
    if (urgencyBand === "overdue") {
      return 0;
    }

    if (urgencyBand === "at_risk") {
      return 1;
    }

    return 2;
  };

  const urgencyDelta = urgencyWeight(left.route.urgencyBand) - urgencyWeight(right.route.urgencyBand);
  if (urgencyDelta !== 0) {
    return urgencyDelta;
  }

  const hoursDelta = left.hoursRemaining - right.hoursRemaining;
  if (hoursDelta !== 0) {
    return hoursDelta;
  }

  return left.routeSortLabel.localeCompare(right.routeSortLabel);
}

function compareNearestAircraft(
  left: ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
  right: ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
  sortDirection: ContractsBoardSortDirection,
): number {
  const leftHasCue = left.hasReadyAircraft ? 1 : 0;
  const rightHasCue = right.hasReadyAircraft ? 1 : 0;
  const availabilityDelta = rightHasCue - leftHasCue;
  if (availabilityDelta !== 0) {
    return availabilityDelta;
  }

  return compareNumber(left.nearestAircraftDistanceNm, right.nearestAircraftDistanceNm, sortDirection)
    || compareText(left.nearestAircraftRegistration, right.nearestAircraftRegistration, sortDirection);
}

function matchesNearestAircraftFilter(
  hasReadyAircraft: boolean,
  readyAircraft: boolean,
  noReadyAircraft: boolean,
): boolean {
  if (!readyAircraft && !noReadyAircraft) {
    return true;
  }

  if (hasReadyAircraft && readyAircraft) {
    return true;
  }

  return !hasReadyAircraft && noReadyAircraft;
}

function matchesPayloadFilters(
  view: ContractsBoardOfferRowView | ContractsBoardCompanyContractRowView,
  passengerPayloadMin: number,
  passengerPayloadMax: number,
  cargoPayloadMin: number,
  cargoPayloadMax: number,
): boolean {
  const passengerRangeActive = hasActiveNumericRange(passengerPayloadMin, passengerPayloadMax);
  const cargoRangeActive = hasActiveNumericRange(cargoPayloadMin, cargoPayloadMax);

  if (view.route.volumeType === "passenger") {
    if (!passengerRangeActive && cargoRangeActive) {
      return false;
    }

    return !passengerRangeActive || matchesNumericRange(view.passengerPayloadAmount, passengerPayloadMin, passengerPayloadMax);
  }

  if (!cargoRangeActive && passengerRangeActive) {
    return false;
  }

  return !cargoRangeActive || matchesNumericRange(view.cargoPayloadAmount, cargoPayloadMin, cargoPayloadMax);
}

function hasActiveNumericRange(minValue: number, maxValue: number): boolean {
  return !Number.isNaN(minValue) || !Number.isNaN(maxValue);
}

function matchesNumericRange(value: number, minValue: number, maxValue: number): boolean {
  if (!Number.isNaN(minValue) && value < minValue) {
    return false;
  }

  if (!Number.isNaN(maxValue) && value > maxValue) {
    return false;
  }

  return true;
}

function compareNumber(left: number, right: number, sortDirection: ContractsBoardSortDirection): number {
  const delta = sortDirection === "asc" ? left - right : right - left;
  if (delta < 0) {
    return -1;
  }
  if (delta > 0) {
    return 1;
  }
  return 0;
}

function compareText(left: string, right: string, sortDirection: ContractsBoardSortDirection): number {
  return sortDirection === "asc"
    ? left.localeCompare(right)
    : right.localeCompare(left);
}

function buildRouteSortLabel(origin: ContractsViewAirport, destination: ContractsViewAirport): string {
  return [
    origin.code,
    origin.name,
    destination.code,
    destination.name,
  ].join(" -> ");
}

function routePayloadAmount(route: Pick<ContractsViewOffer, "volumeType" | "passengerCount" | "cargoWeightLb">): number {
  return route.volumeType === "cargo"
    ? route.cargoWeightLb ?? 0
    : route.passengerCount ?? 0;
}

function buildAirportSearchHaystack(airport: ContractsViewAirport): string {
  return [airport.code, airport.name, airport.municipality]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function buildAircraftSearchHaystack(cue: ContractsViewAircraftCue | null): string {
  return cue?.registration.toLowerCase() ?? "";
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function parseRangeValue(value: string): number {
  return Number.parseInt(value, 10);
}

function haversineDistanceNm(
  originLatitudeDeg: number,
  originLongitudeDeg: number,
  destinationLatitudeDeg: number,
  destinationLongitudeDeg: number,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = toRadians(destinationLatitudeDeg - originLatitudeDeg);
  const deltaLongitude = toRadians(destinationLongitudeDeg - originLongitudeDeg);
  const latitudeOne = toRadians(originLatitudeDeg);
  const latitudeTwo = toRadians(destinationLatitudeDeg);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusNm * c;
}
