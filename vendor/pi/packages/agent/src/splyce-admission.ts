import { assertSplyceReady } from "./splyce-readiness.ts";

/** Host bindings are object identities, never model arguments or tool annotations. */
export interface SplyceToolAdmission {
	check(toolCallId: string, toolName: string, signal: AbortSignal | undefined): void;
	execute<T extends { isError: boolean }>(
		toolCallId: string,
		toolName: string,
		args: unknown,
		invoke: (admittedArgs: unknown) => Promise<T>,
		signal: AbortSignal | undefined,
	): Promise<T>;
}

const admissions = new WeakMap<object, SplyceToolAdmission>();

export function bindSplyceToolAdmission(tool: object, admission: SplyceToolAdmission): () => void {
	if (admissions.has(tool)) throw new Error("SPLYCE_ADMISSION_ALREADY_BOUND");
	admissions.set(tool, admission);
	return () => admissions.delete(tool);
}

export function requireSplyceToolAdmission(tool: object | undefined): SplyceToolAdmission {
	const admission = tool && admissions.get(tool);
	if (!admission) assertSplyceReady();
	return admission!;
}
