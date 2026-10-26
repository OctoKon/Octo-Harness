// TD-16 — native CredentialResolver behind the provider-auth port. Holds only
// references; a secret exists in memory while its lease is active and is
// reachable only through `SecretLease.use` and the redactor.

import { execFile } from "node:child_process";
import {
  CredentialError,
  type CredentialRequest,
  type CredentialResolver,
  type CredentialSource,
  type Redactor,
  type SecretLease,
} from "./provider-auth.js";

/** A connection's credential reference and the only route it may be used for. */
export interface CredentialBinding {
  readonly providerConnectionId: string;
  readonly connectionRevision: string;
  readonly endpointRef: string;
  readonly egressPolicyRef: string;
  readonly source: CredentialSource;
}

/** Native-owned helper definition; imported configuration only names its ref. */
export interface HelperCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export interface HelperOutcome {
  readonly status:
    "succeeded" | "failed" | "timedOut" | "outputLimit" | "aborted";
  readonly exitCode: number | null;
}

/** C2 decision plus a durable intent, recorded by the caller before spawn. */
export interface HelperIntent {
  readonly intentId: string;
  /** Receives the observed outcome after the process has exited; never the output. */
  outcome(result: HelperOutcome): void | Promise<void>;
}

export interface CredentialResolverDeps {
  /** The process environment; the native owner passes `process.env`. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** OS credential store read (e.g. Windows Credential Manager); undefined = absent. */
  readonly readCredentialStore?: (
    target: string,
  ) => Promise<string | undefined>;
  readonly helpers?: Readonly<Record<string, HelperCommand>>;
  /** Returns null to deny. Absent = every helper is denied. */
  readonly admitHelper?: (
    request: CredentialRequest,
    commandRef: string,
  ) => Promise<HelperIntent | null>;
}

const SOURCE_FIELD = {
  env: "name",
  credentialStore: "target",
  helper: "commandRef",
} as const;

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v !== "";

const fail = (code: CredentialError["code"], message: string): never => {
  throw new CredentialError(code, message);
};

export class NativeCredentialResolver implements CredentialResolver {
  readonly #deps: CredentialResolverDeps;
  readonly #bindings = new Map<string, CredentialBinding>();
  readonly #active = new Set<{ secret: string }>();

  constructor(deps: CredentialResolverDeps) {
    this.#deps = deps;
  }

  /** Store a reference. Validates shape; never reads a source or runs a helper. */
  register(binding: CredentialBinding): void {
    const { source } = binding;
    const field =
      SOURCE_FIELD[source.kind as keyof typeof SOURCE_FIELD] ??
      fail("CREDENTIAL_UNAVAILABLE", "unknown credential source kind");
    if (
      !nonEmpty(binding.providerConnectionId) ||
      !nonEmpty(binding.connectionRevision) ||
      !nonEmpty(binding.endpointRef) ||
      !nonEmpty(binding.egressPolicyRef) ||
      !nonEmpty((source as Record<string, unknown>)[field])
    )
      fail("CREDENTIAL_UNAVAILABLE", "malformed credential reference");
    this.#bindings.set(binding.providerConnectionId, {
      ...binding,
      source: { ...source },
    });
  }

  /** Replace every active secret in `text`. */
  readonly redact: Redactor = (text) => {
    let out = text;
    for (const { secret } of this.#active)
      out = out.split(secret).join("[REDACTED]");
    return out;
  };

  async resolve(request: CredentialRequest): Promise<SecretLease> {
    const { signal } = request;
    const revoked = () =>
      fail("CREDENTIAL_REVOKED", `action ${request.actionId} canceled`);
    if (signal?.aborted) revoked();
    const binding =
      this.#bindings.get(request.providerConnectionId) ??
      fail("CREDENTIAL_UNAVAILABLE", "no credential reference for connection");
    if (binding.connectionRevision !== request.connectionRevision)
      fail("CREDENTIAL_STALE_REVISION", "connection revision changed");
    if (
      binding.endpointRef !== request.endpointRef ||
      binding.egressPolicyRef !== request.egressPolicyRef
    )
      fail(
        "CREDENTIAL_DENIED_ENDPOINT",
        "endpoint or egress policy not bound to this connection",
      );

    const secret = await this.#read(binding.source, request);
    // Late result after cancellation is dropped here: never leased, never kept.
    if (signal?.aborted) revoked();
    if (!nonEmpty(secret))
      fail("CREDENTIAL_UNAVAILABLE", "credential source returned nothing");
    return this.#lease(secret as string, signal);
  }

  async #read(
    source: CredentialSource,
    request: CredentialRequest,
  ): Promise<string | undefined> {
    if (source.kind === "env") return this.#deps.env[source.name];
    if (source.kind === "credentialStore") {
      const read =
        this.#deps.readCredentialStore ??
        fail("CREDENTIAL_UNAVAILABLE", "no OS credential store reader");
      return read(source.target);
    }
    const command =
      this.#deps.helpers?.[source.commandRef] ??
      fail("CREDENTIAL_UNAVAILABLE", "unknown helper command reference");
    const admit =
      this.#deps.admitHelper ??
      fail("CREDENTIAL_HELPER_NOT_ADMITTED", "helper requires a C2 decision");
    let intent: HelperIntent | null;
    try {
      intent = await admit(request, source.commandRef);
    } catch (cause) {
      throw new CredentialError(
        "CREDENTIAL_HELPER_NOT_ADMITTED",
        "helper decision or durable intent failed",
        { cause },
      );
    }
    if (!intent) fail("CREDENTIAL_HELPER_NOT_ADMITTED", "helper denied");
    const { outcome, stdout } = request.signal?.aborted
      ? { outcome: { status: "aborted", exitCode: null } as const, stdout: "" }
      : await runHelper(command, request.signal);
    await (intent as HelperIntent).outcome(outcome);
    if (outcome.status === "aborted") return undefined;
    if (outcome.status !== "succeeded")
      fail("CREDENTIAL_UNAVAILABLE", `helper ${outcome.status}`);
    return stdout.replace(/\r?\n$/, "");
  }

  #lease(value: string, signal: AbortSignal | undefined): SecretLease {
    const entry = { secret: value };
    const active = this.#active;
    active.add(entry);
    let live = true;
    const revoke = () => {
      live = false;
      entry.secret = "";
      active.delete(entry);
      signal?.removeEventListener("abort", revoke);
    };
    signal?.addEventListener("abort", revoke, { once: true });
    return Object.freeze({
      use: async <T>(consume: (secret: string) => T | Promise<T>) => {
        if (!live) fail("CREDENTIAL_REVOKED", "lease revoked");
        return consume(entry.secret);
      },
      revoke,
      toString: () => "[SecretLease]",
      toJSON: () => "[SecretLease]",
    });
  }
}

const runHelper = (
  command: HelperCommand,
  signal: AbortSignal | undefined,
): Promise<{ outcome: HelperOutcome; stdout: string }> =>
  new Promise((done) => {
    execFile(
      command.file,
      [...command.args],
      {
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: command.timeoutMs ?? 10_000,
        maxBuffer: command.maxOutputBytes ?? 64 * 1024,
        ...(signal ? { signal } : {}),
      },
      // execFile reports only after the child exited; kill on timeout/abort/limit is built in.
      (e, stdout) => {
        const exitCode = !e ? 0 : typeof e.code === "number" ? e.code : null;
        const status: HelperOutcome["status"] = !e
          ? "succeeded"
          : e.name === "AbortError"
            ? "aborted"
            : e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? "outputLimit"
              : e.killed
                ? "timedOut"
                : "failed";
        done({
          outcome: { status, exitCode: status === "aborted" ? null : exitCode },
          stdout: e ? "" : stdout,
        });
      },
    );
  });
