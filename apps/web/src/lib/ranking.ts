export function hasEligibleRanking(items: ReadonlyArray<{ rank: number | null }>): boolean {
  return items.some((item) => item.rank !== null);
}
