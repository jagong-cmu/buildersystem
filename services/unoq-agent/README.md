# UNO Q probe agent

`agent.py` runs on the Linux side of an Arduino UNO Q and bridges the stream
hub's probe queue to the MCU over USB serial. It polls jobs for one board,
executes each probe, and posts the result back to the hub.

## UNO Q Linux side

The App Lab Python environment can run the agent, or it can run as plain
Python in a virtual environment:

```bash
cd services/unoq-agent
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Flash `firmware/probe/probe.ino` to the MCU, then configure and run:

```bash
export HUB_HTTP=http://<hub-host>:8787
export BOARD_ID=uno_q
export SERIAL_PORT=/dev/ttyACM0
export SERIAL_BAUD=115200
python agent.py
```

`--hub`, `--board`, and `--port` override their corresponding environment
variables. `--once` handles the jobs currently visible and exits, which is
useful for smoke tests. `--mock` avoids hardware and returns plausible probe
values.

## Laptop with a plain Uno

Install `arduino-cli`, connect the Uno, and upload the firmware (adjust the
FQBN for the board in use):

```bash
arduino-cli compile --fqbn arduino:avr:uno firmware/probe
arduino-cli upload -p /dev/ttyACM0 --fqbn arduino:avr:uno firmware/probe
SERIAL_PORT=/dev/ttyACM0 HUB_HTTP=http://localhost:8787 python agent.py
```

On macOS, the serial port is typically `/dev/cu.usbmodem*`; set `SERIAL_PORT`
to the exact device path.

## Mock mode

```bash
python agent.py --mock --hub http://localhost:8787 --board uno_q
python agent.py --mock --once
```

The mock returns an A0 analog value in the night-light range, arbitrary values
for other analog pins, `1` for digital pull-up reads, and `1` for pulses.

Hardware testing has **not** been performed for this implementation. In
particular, the UNO Q serial device name, reset timing, pin mapping, and the
App Lab Linux↔MCU RPC alternative still need confirmation on an actual board.
