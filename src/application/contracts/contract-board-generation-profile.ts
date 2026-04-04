export const contractBoardGenerationProfileVersion = "contracts:v6";

export function buildContractBoardGenerationContextPrefix(): string {
  return `${contractBoardGenerationProfileVersion}:`;
}

export function isCurrentContractBoardGenerationContextHash(generationContextHash: string): boolean {
  return generationContextHash.startsWith(buildContractBoardGenerationContextPrefix());
}
