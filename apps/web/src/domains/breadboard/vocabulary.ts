import type { PartType, Requirement } from "@/core/types";

/** Resistor values shipped in the ELEGOO UNO Super Starter Kit (12 of each, 120 total). */
export const RESISTOR_VALUES = [10, 100, 220, 330, 1000, 2000, 5100, 10000, 100000, 1000000] as const;

export function resistorId(ohms: number): string {
  return `bb:resistor_${fmtOhms(ohms)}`;
}
export function fmtOhms(ohms: number): string {
  if (ohms >= 1e6) return `${(ohms / 1e6).toString().replace(".", "_")}M`;
  return ohms >= 1000 ? `${(ohms / 1000).toString().replace(".", "_")}k` : `${ohms}`;
}
export function ohmsLabel(ohms: number): string {
  if (ohms >= 1e6) return `${ohms / 1e6}MΩ`;
  return ohms >= 1000 ? `${ohms / 1000}kΩ` : `${ohms}Ω`;
}

/** Colour band codes (digit, digit, multiplier) for the value a part id encodes. */
const BAND_COLORS = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "gray", "white"];
function bandHint(ohms: number): string {
  const s = Math.round(ohms).toString();
  const mult = Math.max(0, s.length - 2);
  return `${BAND_COLORS[Number(s[0])]}-${BAND_COLORS[Number(s[1] ?? "0")]}-${BAND_COLORS[mult]}`;
}

export const LED_COLORS: Record<string, number> = { red: 1.8, green: 2.1, yellow: 2.0, blue: 3.0, white: 3.0 };

const bb = (id: string, name: string, visionHint: string, props?: Record<string, string | number>): PartType => ({
  id: `bb:${id}`,
  domain: "breadboard",
  name,
  visionHint,
  ...(props ? { props } : {}),
});

export const BREADBOARD_PARTS: PartType[] = [
  bb("uno", "Arduino Uno (ELEGOO UNO R3)", "Uno-format microcontroller board: black or blue PCB, ~69×53 mm, two long black female header rows along the edges, silver USB-B and black barrel jack on one short edge, a large DIP or small SMD chip; ELEGOO prints 'ELEGOO UNO R3' in white on a black board"),
  bb("breadboard", "Breadboard (830 tie-points)", "white solderless breadboard, long rectangle with a centre channel, rows a–j and numbered columns, red/blue power-rail lines along both long edges"),
  bb("expansion_shield", "Prototype expansion shield", "blue Uno-shaped PCB with a tiny white mini breadboard glued on top and long male header pins underneath"),
  bb("jumper", "Jumper wire (male-male)", "breadboard jumper: solid-core wire, ~10–20 cm, with bare pin ends, any colour; often a fanned bundle of many colours"),
  bb("dupont_fm", "Dupont wire (female-male)", "ribbon of coloured wires with a black plastic female socket on one end and a bare pin on the other"),
  ...RESISTOR_VALUES.map((v) =>
    bb(`resistor_${fmtOhms(v)}`, `Resistor ${ohmsLabel(v)}`, `small tan/beige axial resistor with bands ${bandHint(v)} (then gold); ELEGOO ships them taped in strips of 10–12 with a yellow value label`, { ohms: v }),
  ),
  ...Object.entries(LED_COLORS).map(([color, vf]) =>
    bb(`led_${color}`, `LED (${color})`, `5 mm ${color} LED: ${color === "white" ? "clear/water-clear dome" : `${color} tinted dome`}, two straight legs, the longer leg is the anode (+)`, { vf, color }),
  ),
  bb("led_rgb", "RGB LED (4-pin)", "5 mm clear/diffused LED with FOUR legs in a row; the longest leg is the common cathode", { color: "rgb" }),
  bb("photoresistor", "Photoresistor (LDR)", "round flat disc ~5 mm with a wavy orange/red trace on a cream face and two thin legs", { darkOhms: 100000, lightOhms: 1000 }),
  bb("thermistor", "Thermistor (NTC 10k)", "tiny black bead or disc on two thin legs, no visible trace; smaller than the photoresistor", { ohms: 10000 }),
  bb("tilt_switch", "Tilt ball switch", "small black cylinder ~4×12 mm with two legs from one end, looks like a black capacitor"),
  bb("pushbutton", "Pushbutton (tactile)", "6 mm square tactile switch with a round black or coloured plunger and four bent legs"),
  bb("potentiometer", "Potentiometer 10k", "rotary potentiometer with a knurled black shaft/knob and three legs, ~15 mm body", { ohms: 10000 }),
  bb("buzzer_active", "Active buzzer", "black round cylinder ~12 mm with a hole on top, sealed bottom with a sticker or bare pins; the two legs are unequal length, '+' printed on top"),
  bb("buzzer_passive", "Passive buzzer", "black round cylinder ~12 mm with a hole on top and a visible green PCB on the underside; the two legs are equal length"),
  bb("diode_1n4007", "Diode 1N4007 (rectifier)", "black cylindrical axial diode with a single silver/grey band at one end and two long legs"),
  bb("transistor_pn2222", "NPN transistor PN2222", "small black half-cylinder TO-92 package with a flat face and three legs"),
  bb("ic_74hc595", "74HC595 shift register", "16-pin black DIP chip labelled 74HC595"),
  bb("ic_l293d", "L293D motor driver", "16-pin black DIP chip labelled L293D"),
  bb("seg7_1", "1-digit 7-segment display", "small black rectangle with one red digit and 10 pins (5 per long side)"),
  bb("seg7_4", "4-digit 7-segment display", "black rectangle with four red digits and 12 pins (6 per long side)"),
  bb("lcd1602", "LCD1602 module", "green PCB ~80×36 mm with a dark 16×2 character LCD glass and a 16-pin header along one long edge"),
  bb("relay_5v", "5 V relay", "bright blue rectangular block ~19×15 mm with '5V' printed and five stiff pins underneath"),
  bb("ir_receiver", "IR receiver module", "small black PCB with a black 3-leg IR receiver can (domed lens) and 3 pins"),
  bb("ir_remote", "IR remote control", "thin black remote with a 3×7 grid of round buttons and 'ELEGOO' printing"),
  bb("joystick", "Joystick module", "black PCB with a round black thumb-stick cap and a 5-pin header (GND VCC VRx VRy SW)"),
  bb("dht11", "DHT11 temperature & humidity module", "blue perforated plastic block on a small PCB with 3 pins"),
  bb("ultrasonic_hcsr04", "Ultrasonic sensor HC-SR04", "blue PCB with two silver cylindrical 'eyes' (transducers) and a 4-pin header (VCC Trig Echo GND)"),
  bb("servo_sg90", "Servo motor SG90", "small blue rectangular servo with a white plastic arm/horn and a 3-wire brown/red/orange lead"),
  bb("stepper_28byj48", "Stepper motor 28BYJ-48", "silver round motor ~28 mm with a 5-wire lead ending in a white JST connector"),
  bb("uln2003", "ULN2003 stepper driver", "small green PCB with a ULN2003 chip, four LEDs and a white 5-pin socket"),
  bb("dc_motor", "DC motor (3–6 V)", "small silver cylindrical motor ~24 mm with a thin shaft and two solder tabs"),
  bb("fan_blade", "Fan blade", "small yellow/white plastic propeller that presses onto the DC motor shaft"),
  bb("power_module", "Breadboard power supply module", "small PCB with a barrel jack, USB-A socket, a black slide switch and pins that plug into the breadboard power rails; 3.3 V / 5 V jumpers"),
  bb("battery_9v", "9 V battery with barrel connector", "rectangular 9 V battery, or a black snap-on clip with a barrel plug lead"),
  bb("usb_cable", "USB A–B cable", "blue or black USB cable with a square USB-B plug for the Uno"),
];

export function bbPartName(id: string): string {
  return BREADBOARD_PARTS.find((p) => p.id === id)?.name ?? id;
}

/** Ohms encoded in a resistor/thermistor/potentiometer part id, or 0. */
export function partOhms(id: string): number {
  const props = BREADBOARD_PARTS.find((p) => p.id === id)?.props;
  return typeof props?.ohms === "number" ? props.ohms : 0;
}

/** Series resistor for an LED at 5 V, targeting ~15 mA. */
export function ledSeriesResistor(vf: number, targetMa = 15): number {
  return ((5 - vf) / targetMa) * 1000;
}

/**
 * Contents of the ELEGOO UNO R3 Super Starter Kit as printed on the box lid.
 * Manuals in manuals/breadboard must be buildable from this alone (see tests).
 */
export const ELEGOO_SUPER_STARTER_KIT: Requirement[] = [
  { partType: "bb:uno", qty: 1 },
  { partType: "bb:breadboard", qty: 1 },
  { partType: "bb:expansion_shield", qty: 1 },
  { partType: "bb:jumper", qty: 65 },
  { partType: "bb:dupont_fm", qty: 10 },
  ...RESISTOR_VALUES.map((v) => ({ partType: resistorId(v), qty: 12 })),
  { partType: "bb:led_red", qty: 5 },
  { partType: "bb:led_green", qty: 5 },
  { partType: "bb:led_yellow", qty: 5 },
  { partType: "bb:led_blue", qty: 5 },
  { partType: "bb:led_white", qty: 5 },
  { partType: "bb:led_rgb", qty: 2 },
  { partType: "bb:photoresistor", qty: 2 },
  { partType: "bb:thermistor", qty: 1 },
  { partType: "bb:tilt_switch", qty: 1 },
  { partType: "bb:pushbutton", qty: 5 },
  { partType: "bb:potentiometer", qty: 1 },
  { partType: "bb:buzzer_active", qty: 1 },
  { partType: "bb:buzzer_passive", qty: 1 },
  { partType: "bb:diode_1n4007", qty: 2 },
  { partType: "bb:transistor_pn2222", qty: 2 },
  { partType: "bb:ic_74hc595", qty: 1 },
  { partType: "bb:ic_l293d", qty: 1 },
  { partType: "bb:seg7_1", qty: 1 },
  { partType: "bb:seg7_4", qty: 1 },
  { partType: "bb:lcd1602", qty: 1 },
  { partType: "bb:relay_5v", qty: 1 },
  { partType: "bb:ir_receiver", qty: 1 },
  { partType: "bb:ir_remote", qty: 1 },
  { partType: "bb:joystick", qty: 1 },
  { partType: "bb:dht11", qty: 1 },
  { partType: "bb:ultrasonic_hcsr04", qty: 1 },
  { partType: "bb:servo_sg90", qty: 1 },
  { partType: "bb:stepper_28byj48", qty: 1 },
  { partType: "bb:uln2003", qty: 1 },
  { partType: "bb:dc_motor", qty: 1 },
  { partType: "bb:fan_blade", qty: 1 },
  { partType: "bb:power_module", qty: 1 },
  { partType: "bb:battery_9v", qty: 1 },
  { partType: "bb:usb_cable", qty: 1 },
];
