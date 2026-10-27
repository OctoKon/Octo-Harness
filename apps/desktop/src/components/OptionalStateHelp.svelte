<script lang="ts" module>
  /** Fixed optional-feature states this help covers. No other state is invented. */
  export const OPTIONAL_STATES = [
    "unsupported",
    "off",
    "missing",
    "cancelled",
  ] as const;
  export type OptionalState = (typeof OPTIONAL_STATES)[number];

  export interface OptionalStateCopy {
    readonly label: string;
    readonly detail: string;
  }

  /**
   * Inert copy only: each state says what is true and what does not happen.
   * Nothing here promises a ready feature or an implicit install.
   */
  export const OPTIONAL_STATE_COPY: Readonly<
    Record<OptionalState, OptionalStateCopy>
  > = Object.freeze({
    unsupported: {
      label: "Not supported on this computer",
      detail:
        "This build leaves the optional feature out. Nothing is installed, downloaded or switched on for you.",
    },
    off: {
      label: "Switched off",
      detail:
        "The optional feature is present but off. It stays off, and nothing runs, until you switch it on.",
    },
    missing: {
      label: "Not installed",
      detail:
        "The optional part is not on this computer. You can add it from Setup if you want it; skipping is fine.",
    },
    cancelled: {
      label: "Setup cancelled",
      detail:
        "Nothing was added. The optional part stays as it was until you start setup again.",
    },
  });

  const FALLBACK: OptionalStateCopy = Object.freeze({
    label: "Unavailable",
    detail:
      "This optional feature cannot be described here. Nothing is installed or running.",
  });

  /** Unknown input never inherits a supported claim. */
  export function optionalStateCopy(state: unknown): OptionalStateCopy {
    return typeof state === "string" &&
      Object.hasOwn(OPTIONAL_STATE_COPY, state)
      ? OPTIONAL_STATE_COPY[state as OptionalState]
      : FALLBACK;
  }

  const GLYPH: Readonly<Record<OptionalState, string>> = Object.freeze({
    unsupported: "⊘",
    off: "○",
    missing: "◇",
    cancelled: "↺",
  });

  export function optionalStateGlyph(state: unknown): string {
    return typeof state === "string" && Object.hasOwn(GLYPH, state)
      ? GLYPH[state as OptionalState]
      : "⊘";
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  // Presentation only: the parent owns any control, so help can never act alone.
  let {
    state,
    feature,
    action,
  }: {
    state: OptionalState;
    feature?: string;
    action?: Snippet;
  } = $props();

  const copy = $derived(optionalStateCopy(state));
  const glyph = $derived(optionalStateGlyph(state));
</script>

<section
  class="optional-state"
  role="group"
  aria-label={`Optional feature, ${copy.label}`}
  data-testid="optional-state-help"
  data-state={state}
>
  <p class="state">
    <span aria-hidden="true">{glyph}</span>
    <span>{copy.label}</span>
  </p>
  <h3>{copy.label}</h3>
  <p class="detail">{copy.detail}</p>
  {#if feature}<p class="feature">Optional feature: {feature}</p>{/if}
  {#if action}<div class="action">{@render action()}</div>{/if}
</section>

<style>
  .optional-state {
    border: 1px solid currentColor;
    padding: 12px;
    overflow-wrap: anywhere;
  }
  .optional-state > * {
    margin: 0 0 6px;
  }
  .optional-state > :last-child {
    margin-bottom: 0;
  }
  .state {
    font-weight: 600;
  }
  h3 {
    font-size: 1rem;
    font-weight: 600;
  }
  .detail {
    max-width: 60ch;
  }
</style>
