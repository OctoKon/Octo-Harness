/** TD-07: admission stays unavailable until the authoritative policy/store is wired. */
export const assertSplyceReady = (): void => {
	throw Object.assign(new Error("SPLYCE_UNAVAILABLE"), { code: "SPLYCE_UNAVAILABLE" as const });
};
