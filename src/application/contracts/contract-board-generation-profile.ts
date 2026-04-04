export const contractBoardGenerationProfileVersion = "contracts:v5";

export function buildContractBoardGenerationContextPrefix(): string {
  return `${contractBoardGenerationProfileVersion}:`;
}

export function isCurrentContractBoardGenerationContextHash(generationContextHash: string): boolean {
  return generationContextHash.startsWith(buildContractBoardGenerationContextPrefix());
}
