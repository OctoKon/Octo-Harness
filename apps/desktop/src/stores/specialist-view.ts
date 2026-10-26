/** Typed local view model for specialist decision/forecast advice (TD-67). */
export type SpecialistKind = "decision" | "forecast";
export type SpecialistBindingState = "ready" | "unavailable";
export type CalibrationState =
  "calibrated" | "unmeasured" | "insufficient-history" | "unavailable";

export interface SpecialistModel {
  readonly name: string;
  readonly revision: string;
}

export interface SpecialistCalibration {
  readonly state: CalibrationState;
  readonly samples?: number;
  readonly requiredSamples?: number;
  readonly detail?: string;
  readonly confidence?: number;
}

export interface SpecialistAdvice {
  readonly headline: string;
  readonly detail: string;
  readonly abstained?: boolean;
}

export interface SpecialistInput {
  readonly kind: SpecialistKind;
  /** Fixture data must stay explicitly labelled; live data is never synthesized. */
  readonly fixture: boolean;
  readonly binding: {
    readonly state: SpecialistBindingState;
    readonly reason?: string;
  };
  readonly model: SpecialistModel;
  readonly calibration: SpecialistCalibration;
  readonly advice?: SpecialistAdvice;
}

export interface SpecialistView {
  readonly kind: SpecialistKind;
  readonly fixture: boolean;
  readonly model: SpecialistModel;
  readonly bindingState: SpecialistBindingState;
  readonly authority: "advisory";
  readonly bindingUnavailableReason: string | null;
  readonly advice: SpecialistAdvice | null;
  readonly calibration: {
    readonly state: CalibrationState;
    readonly label: string;
    readonly detail: string;
    readonly confidence: number | null;
  };
}

const CALIBRATION_LABEL: Readonly<Record<CalibrationState, string>> = {
  calibrated: "Calibrated",
  unmeasured: "Not measured",
  "insufficient-history": "Insufficient history",
  unavailable: "Calibration unavailable",
};

function calibrationDetail(c: SpecialistCalibration): string {
  const custom = c.detail?.trim();
  if (custom) return custom;
  switch (c.state) {
    case "calibrated":
      return "Calibration evidence is available.";
    case "unmeasured":
      return "No calibration evidence has been measured.";
    case "insufficient-history":
      return c.samples !== undefined &&
        c.requiredSamples !== undefined &&
        c.requiredSamples > 0
        ? `${c.samples} of ${c.requiredSamples} required samples.`
        : "Not enough history to calibrate.";
    case "unavailable":
      return "Calibration data is unavailable.";
  }
  return "Calibration state is unavailable.";
}

function measuredConfidence(c: SpecialistCalibration): number | null {
  if (c.state !== "calibrated") return null;
  const confidence = c.confidence;
  return typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
    ? confidence
    : null;
}

export function toSpecialistView(input: SpecialistInput): SpecialistView {
  const bindingUnavailable =
    input.binding.state === "unavailable"
      ? input.binding.reason?.trim() || "Specialist model is unavailable."
      : null;
  return {
    kind: input.kind,
    fixture: input.fixture,
    model: input.model,
    bindingState: input.binding.state,
    authority: "advisory",
    bindingUnavailableReason: bindingUnavailable,
    advice: bindingUnavailable === null ? (input.advice ?? null) : null,
    calibration: {
      state: input.calibration.state,
      label: CALIBRATION_LABEL[input.calibration.state],
      detail: calibrationDetail(input.calibration),
      confidence: measuredConfidence(input.calibration),
    },
  };
}
