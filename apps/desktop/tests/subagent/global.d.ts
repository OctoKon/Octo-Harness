export {};

declare global {
  interface Window {
    __subagent: {
      scenario(
        name: "default" | "approval" | "mismatch" | "truncated" | "error",
      ): void;
      calls(): {
        applied: string[];
        discarded: string[];
        decisions: string[];
        diffRequests: number;
      };
    };
  }
}
