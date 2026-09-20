import { describe, expect, it } from "vitest";
import type { Probe } from "@/core/types";
import { compareProbe, compareProbes } from "../verifiers";

const rangeProbe: Probe = { pin: "A0", mode: "analogRead", expect: { min: 100, max: 950 } };

describe("breadboard hardware verifiers", () => {
  it("verifies an in-range analog reading", () => {
    expect(compareProbe(rangeProbe, { pin: "A0", mode: "analogRead", value: 512 }).hint).toBe("A0 reads 512 (expected 100–950)");
    expect(compareProbe(rangeProbe, { pin: "A0", mode: "analogRead", value: 512 }).ok).toBe(true);
  });

  it("rejects below and above an analog range", () => {
    expect(compareProbe(rangeProbe, { pin: "A0", mode: "analogRead", value: 50 }).hint).toBe("A0 reads 50, expected 100–950");
    expect(compareProbe(rangeProbe, { pin: "A0", mode: "analogRead", value: 951 }).ok).toBe(false);
  });

  it("checks digital values", () => {
    const probe: Probe = { pin: "D2", mode: "digitalRead", expect: { value: 1 } };
    expect(compareProbe(probe, { pin: "D2", mode: "digitalRead", value: 1 }).ok).toBe(true);
    expect(compareProbe(probe, { pin: "D2", mode: "digitalRead", value: 0 }).ok).toBe(false);
  });

  it("checks pulse values", () => {
    const probe: Probe = { pin: "D9", mode: "pulse", expect: { value: 1 } };
    expect(compareProbe(probe, { pin: "D9", mode: "pulse", value: 1 }).ok).toBe(true);
  });

  it("reports missing readings", () => {
    const probe: Probe = { pin: "D9", mode: "pulse", expect: { value: 1 } };
    expect(compareProbe(probe).hint).toBe("no reading for D9 (pulse)");
  });

  it("lists only failing probes in a mismatch", () => {
    const result = compareProbes(
      [rangeProbe, { pin: "D9", mode: "pulse", expect: { value: 1 } }],
      [
        { pin: "A0", mode: "analogRead", value: 512 },
        { pin: "D9", mode: "pulse", value: 0 },
      ],
    );
    expect(result.status).toBe("mismatch");
    expect(result.hint).toBe("D9 reads 0, expected 1");
  });

  it("defaults one-sided ranges to the ADC bounds", () => {
    expect(compareProbe({ pin: "A0", mode: "analogRead", expect: { min: 500 } }, { pin: "A0", mode: "analogRead", value: 1023 }).ok).toBe(true);
    expect(compareProbe({ pin: "A0", mode: "analogRead", expect: { max: 500 } }, { pin: "A0", mode: "analogRead", value: 0 }).ok).toBe(true);
    expect(compareProbe({ pin: "A0", mode: "analogRead", expect: { min: 500 } }, { pin: "A0", mode: "analogRead", value: 499 }).hint).toBe("A0 reads 499, expected 500–1023");
    expect(compareProbe({ pin: "A0", mode: "analogRead", expect: { max: 500 } }, { pin: "A0", mode: "analogRead", value: 501 }).hint).toBe("A0 reads 501, expected 0–500");
  });
});
