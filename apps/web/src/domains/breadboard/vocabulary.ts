import type { PartType } from "@/core/types";

export const RESISTOR_VALUES = [100, 220, 330, 470, 1000, 2200, 4700, 10000] as const;

export function resistorId(ohms: number): string {
  return `bb:resistor_${fmtOhms(ohms)}`;
}
export function fmtOhms(ohms: number): string {
  return ohms >= 1000 ? `${(ohms / 1000).toString().replace(".", "_")}k` : `${ohms}`;
}
export function ohmsLabel(ohms: number): string {
  return ohms >= 1000 ? `${ohms / 1000}kΩ` : `${ohms}Ω`;
}

const LED_COLORS: Record<string, number> = { red: 1.8, green: 2.1, yellow: 2.0, blue: 3.0 };

export const BREADBOARD_PARTS: PartType[] = [
  { id: "bb:uno", domain: "breadboard", name: "Arduino Uno / UNO Q", visionHint: "blue Arduino Uno-format board with black header rows" },
  { id: "bb:breadboard", domain: "breadboard", name: "Breadboard", visionHint: "white solderless breadboard with numbered rows" },
  { id: "bb:jumper", domain: "breadboard", name: "Jumper wire", visionHint: "short solid-core jumper wire with pin ends, any color" },
  ...RESISTOR_VALUES.map<PartType>((v) => ({
    id: resistorId(v),
    domain: "breadboard",
    name: `Resistor ${ohmsLabel(v)}`,
    visionHint: `axial resistor, color bands for ${ohmsLabel(v)}`,
    props: { ohms: v },
  })),
  ...Object.entries(LED_COLORS).map<PartType>(([color, vf]) => ({
    id: `bb:led_${color}`,
    domain: "breadboard",
    name: `LED (${color})`,
    visionHint: `5mm ${color} LED with two legs, long leg is anode`,
    props: { vf, color },
  })),
  { id: "bb:photoresistor", domain: "breadboard", name: "Photoresistor (LDR)", visionHint: "round flat disc with a wavy red trace and two legs", props: { darkOhms: 100000, lightOhms: 1000 } },
  { id: "bb:pushbutton", domain: "breadboard", name: "Pushbutton", visionHint: "small square tactile button with four legs" },
  { id: "bb:potentiometer", domain: "breadboard", name: "Potentiometer 10k", visionHint: "small blue trim pot with a knob and three legs", props: { ohms: 10000 } },
  { id: "bb:buzzer", domain: "breadboard", name: "Piezo buzzer", visionHint: "black round buzzer with two legs" },
];

export function bbPartName(id: string): string {
  return BREADBOARD_PARTS.find((p) => p.id === id)?.name ?? id;
}

/** Series resistor for an LED at 5 V, targeting ~15 mA. */
export function ledSeriesResistor(vf: number, targetMa = 15): number {
  return ((5 - vf) / targetMa) * 1000;
}
