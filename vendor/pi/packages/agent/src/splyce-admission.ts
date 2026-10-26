import { assertSplyceReady } from "./splyce-readiness.ts";

/** Host bindings are object identities, never model arguments or tool annotations. */
export interface SplyceToolAdmission {
	check(toolCallId: string, toolName: string, signal: AbortSignal | undefined, phase?: "prepare"): void;
	prepare(
		toolCallId: string,
		toolName: string,
		validatedArgs: unknown,
		parentToolCallId: string | undefined,
		signal: AbortSignal | undefined,
	): Promise<void>;
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
	if (typeof admission!.prepare !== "function") throw new Error("SPLYCE_ADMISSION_PREPARE_REQUIRED");
	return admission!;
}
