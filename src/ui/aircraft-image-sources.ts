/*
 * Defines the open-license image source used to lazily cache local aircraft family photos.
 * The server resolves one representative image per aircraft family from Wikimedia-backed sources.
 */

export interface AircraftImageSourceDefinition {
  articleTitle?: string;
  commonsFileTitle?: string;
  searchQuery?: string;
}

export const aircraftImageSources = {
  caravan: { articleTitle: "Cessna 208 Caravan" },
  skycourier: { articleTitle: "Cessna 408 SkyCourier" },
  pc12: { articleTitle: "Pilatus PC-12" },
  citation_cj: { articleTitle: "Cessna Citation family" },
  citation_longitude: { articleTitle: "Cessna Citation Longitude" },
  pc24: { articleTitle: "Pilatus PC-24" },
  twin_otter: { articleTitle: "De Havilland Canada DHC-6 Twin Otter" },
  skyvan: { articleTitle: "Short SC.7 Skyvan" },
  ys11: { articleTitle: "NAMC YS-11" },
  saab340: { articleTitle: "Saab 340" },
  beech1900: { articleTitle: "Beechcraft 1900" },
  jetstream32: { articleTitle: "British Aerospace Jetstream" },
  emb120: { articleTitle: "Embraer EMB 120 Brasilia" },
  dash8: { articleTitle: "De Havilland Canada Dash 8" },
  atr: { articleTitle: "ATR 72" },
  crj: { articleTitle: "Bombardier CRJ700 series" },
  erj145: { articleTitle: "Embraer ERJ family" },
  ejet: { articleTitle: "Embraer E-Jet family" },
  f28: { articleTitle: "Fokker F28 Fellowship" },
  bae146: { commonsFileTitle: "File:British Aerospace 146-100 ‘G-JEAO’ (50120296542).jpg" },
  avro_rj: { commonsFileTitle: "File:Avro RJ85.jpg" },
  a310: { articleTitle: "Airbus A310" },
  a320_family: { articleTitle: "Airbus A320 family" },
  a220: { articleTitle: "Airbus A220" },
  b737: { articleTitle: "Boeing 737" },
  a330: { articleTitle: "Airbus A330" },
  a350: { articleTitle: "Airbus A350" },
  b747: { articleTitle: "Boeing 747" },
  b787: { articleTitle: "Boeing 787 Dreamliner" },
  b767: { articleTitle: "Boeing 767" },
  b777: { articleTitle: "Boeing 777" },
  a300: { articleTitle: "Airbus A300" },
} as const satisfies Record<string, AircraftImageSourceDefinition>;

export const aircraftModelImageSources = {
  cessna_208b_grand_caravan_ex_passenger: { searchQuery: "Cessna 208 B Grand Caravan EX Passenger" },
  cessna_208b_grand_caravan_ex_cargo: { searchQuery: "Cessna 208 B Grand Caravan EX Cargo" },
  cessna_408_skycourier_passenger: { searchQuery: "Cessna 408 SkyCourier Passenger" },
  cessna_408_skycourier_freighter: { searchQuery: "Cessna 408 SkyCourier Freighter" },
  pilatus_pc12_ngx: { searchQuery: "Pilatus PC-12 NGX" },
  cessna_citation_cj4: { searchQuery: "Cessna Citation CJ4" },
  cessna_citation_longitude: { searchQuery: "Cessna Citation Longitude" },
  pilatus_pc24: { searchQuery: "Pilatus PC-24" },
  dhc6_twin_otter_300: { searchQuery: "DHC-6 Twin Otter 300" },
  short_sc7_skyvan_3_100: { searchQuery: "Short SC.7 Skyvan 3-100" },
  namc_ys11_100: { searchQuery: "NAMC YS-11-100" },
  saab_340b: { searchQuery: "Saab 340B" },
  beechcraft_1900d: { searchQuery: "Beechcraft 1900D" },
  jetstream_32: { searchQuery: "Jetstream 32" },
  embraer_emb120_brasilia: { searchQuery: "Embraer EMB 120 Brasilia" },
  dash8_q400: { searchQuery: "Dash 8 Q400" },
  atr_42_600_combi: { searchQuery: "ATR 42-600 Combi" },
  atr_72_600_passenger: { searchQuery: "ATR 72-600 Passenger" },
  atr_72_600f: { searchQuery: "ATR 72-600F" },
  crj700: { searchQuery: "CRJ700" },
  embraer_erj145xr: { searchQuery: "Embraer ERJ 145XR" },
  embraer_e175: { searchQuery: "Embraer E175" },
  embraer_e190: { searchQuery: "Embraer E190" },
  fokker_f28_mk4000: { searchQuery: "Fokker F28 Mk4000" },
  bae_146_300: { searchQuery: "BAe 146-300" },
  bae_146_200_qt: { searchQuery: "BAe 146-200 QT" },
  avro_rj85: { searchQuery: "Avro RJ85" },
  avro_rj100_qt: { searchQuery: "Avro RJ100 QT" },
  airbus_a310_300: { searchQuery: "Airbus A310-300" },
  airbus_a320neo: { searchQuery: "Airbus A320neo" },
  airbus_a321lr: { searchQuery: "Airbus A321LR" },
  airbus_a220_300: { searchQuery: "Airbus A220-300" },
  boeing_737_max_8: { searchQuery: "Boeing 737 MAX 8" },
  boeing_737_800: { searchQuery: "Boeing 737-800" },
  boeing_737_900er: { searchQuery: "Boeing 737-900ER" },
  airbus_a330_300: { searchQuery: "Airbus A330-300" },
  airbus_a330_900neo: { searchQuery: "Airbus A330-900neo" },
  airbus_a350_900: { searchQuery: "Airbus A350-900" },
  boeing_747_8i: { searchQuery: "Boeing 747-8 Intercontinental" },
  boeing_747_8f: { searchQuery: "Boeing 747-8F" },
  boeing_787_10: { searchQuery: "Boeing 787-10" },
  boeing_767_300er: { searchQuery: "Boeing 767-300ER" },
  boeing_777_300er: { searchQuery: "Boeing 777-300ER" },
  airbus_a300_600f: { searchQuery: "Airbus A300-600F" },
} as const satisfies Record<string, AircraftImageSourceDefinition>;

export const aircraftImageFallbackPath = "/assets/aircraft-images/fallback.svg";

export function aircraftImageAssetPathForFamily(familyId: string): string {
  return `/assets/aircraft-images/${encodeURIComponent(familyId)}`;
}

export function aircraftImageAssetPathForModel(modelId: string): string {
  return `/assets/aircraft-images/model/${encodeURIComponent(modelId)}`;
}
