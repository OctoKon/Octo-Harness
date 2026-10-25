---
name: root-cause-debugging
description: Investigate a reproducible hard failure, repeated failed fix, or unexplained regression. Use after ordinary inspection cannot identify the cause; do not use for routine implementation or a first-pass error.
---

# Root-cause debugging

Use this only when a failure persists, recurs, or has competing plausible causes.

1. State the observed failure: command or user path, actual result, expected result, revision and relevant environment. Reproduce it once. If it does not reproduce, record that limit and gather the smallest additional observation needed.
2. Read the complete relevant error and trace the input, state and caller path to the failing boundary. Compare one working and one failing case when possible. Do not change code yet.
3. Write one falsifiable cause hypothesis and the observation that would disprove it. Add temporary, bounded instrumentation only when existing evidence cannot distinguish hypotheses; remove it afterward unless it is needed for the product.
4. Make the smallest change at the shared cause. Preserve validation and error handling. Do not stack speculative fixes or suppress the symptom.
5. Re-run the reproducer and the narrow behavior check. If the hypothesis fails, revert or isolate that experiment, record what it disproved, and return to step 2 with a new hypothesis.

Report the trigger, confirmed cause or remaining uncertainty, changed boundary, and observed checks. Do not call a workaround a root-cause fix.
