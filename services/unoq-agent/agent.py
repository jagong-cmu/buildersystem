#!/usr/bin/env python3
"""UNO Q probe agent: bridge hub probe jobs to an Arduino-compatible MCU."""

from __future__ import annotations

import argparse
import logging
import os
import random
import time
from typing import Any, Protocol
from urllib.parse import quote

import requests

LOGGER = logging.getLogger("unoq-agent")


class Probe(Protocol):
    def read(self, pin: str, mode: str) -> int:
        ...


class MockProbe:
    def read(self, pin: str, mode: str) -> int:
        if mode == "analogRead":
            value = random.randint(400, 650) if pin.upper() == "A0" else random.randint(0, 1023)
        elif mode == "digitalRead":
            value = 1
        elif mode == "pulse":
            value = 1
        else:
            raise ValueError(f"unsupported probe mode: {mode}")
        LOGGER.info("mock %s %s -> %d", pin, mode, value)
        return value


class SerialProbe:
    def __init__(self, port: str, baud: int) -> None:
        import serial

        self.serial = serial.Serial(port, baudrate=baud, timeout=2)
        # TODO(on-device): confirm the reset delay for the UNO Q MCU serial path.
        time.sleep(2)
        self._drain()
        try:
            self._command("PING")
        except Exception:
            self.serial.close()
            raise

    def _drain(self) -> None:
        while self.serial.in_waiting:
            self.serial.readline()

    def _command(self, command: str, timeout: float = 2) -> int | None:
        self.serial.timeout = timeout
        self.serial.write(f"{command}\n".encode("ascii"))
        line = self.serial.readline().decode("utf-8", errors="replace").strip()
        if line == "PONG":
            return None
        if line.startswith("OK "):
            try:
                return int(line[3:].strip())
            except ValueError as exc:
                raise RuntimeError(f"invalid probe response: {line}") from exc
        if line.startswith("ERR "):
            raise RuntimeError(line[4:].strip())
        raise RuntimeError(f"unexpected probe response: {line or '<timeout>'}")

    def read(self, pin: str, mode: str) -> int:
        if mode == "pulse":
            ms = 200
            response = self._command(f"PROBE {pin} pulse {ms}", timeout=ms / 1000 + 2)
        elif mode in {"analogRead", "digitalRead"}:
            response = self._command(f"PROBE {pin} {mode}")
        else:
            raise ValueError(f"unsupported probe mode: {mode}")
        if response is None:
            raise RuntimeError(f"no value for {pin} {mode}")
        LOGGER.info("serial %s %s -> %d", pin, mode, response)
        return response

    def close(self) -> None:
        self.serial.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run UNO Q probe jobs from a stream hub.")
    parser.add_argument("--mock", action="store_true", help="use a deterministic protocol-free mock probe")
    parser.add_argument("--once", action="store_true", help="process currently pending jobs once, then exit")
    parser.add_argument("--hub", default=os.environ.get("HUB_HTTP", "http://localhost:8787"))
    parser.add_argument("--board", default=os.environ.get("BOARD_ID", "uno_q"))
    parser.add_argument("--port", default=os.environ.get("SERIAL_PORT", "/dev/ttyACM0"))
    parser.add_argument("--baud", type=int, default=int(os.environ.get("SERIAL_BAUD", "115200")))
    parser.add_argument("--poll-ms", type=int, default=int(os.environ.get("POLL_MS", "500")))
    return parser.parse_args()


def fetch_jobs(session: requests.Session, hub: str, board: str) -> list[dict[str, Any]]:
    response = session.get(f"{hub}/probe/jobs?board={quote(board)}", timeout=5)
    response.raise_for_status()
    jobs = response.json()
    if not isinstance(jobs, list):
        raise RuntimeError("hub returned a non-list job response")
    return jobs


def post_result(session: requests.Session, hub: str, job_id: str, results: list[dict[str, Any]]) -> bool:
    for attempt in range(3):
        try:
            response = session.post(
                f"{hub}/probe/results",
                json={"jobId": job_id, "results": results},
                timeout=5,
            )
            response.raise_for_status()
            return True
        except requests.RequestException as exc:
            LOGGER.warning("posting result for %s failed (attempt %d/3): %s", job_id, attempt + 1, exc)
            if attempt < 2:
                time.sleep(0.25 * (attempt + 1))
    return False


def handle_job(
    session: requests.Session,
    hub: str,
    job: dict[str, Any],
    probe: Probe,
    handled: set[str],
    result_cache: dict[str, list[dict[str, Any]]],
) -> None:
    job_id = str(job.get("id", ""))
    if not job_id:
        LOGGER.warning("ignoring job without an id")
        return
    if job_id in handled and job_id not in result_cache:
        return
    results = result_cache.get(job_id)
    if results is None:
        try:
            results = [
                {"pin": str(item["pin"]), "mode": str(item["mode"]), "value": probe.read(str(item["pin"]), str(item["mode"]))}
                for item in job.get("probes", [])
            ]
        except Exception:
            LOGGER.exception("probe execution failed for %s; it will be retried", job_id)
            return
        result_cache[job_id] = results
    handled.add(job_id)
    post_result(session, hub, job_id, results)


def run(args: argparse.Namespace) -> None:
    hub = args.hub.rstrip("/")
    session = requests.Session()
    probe: Probe
    serial_probe: SerialProbe | None = None
    if args.mock:
        probe = MockProbe()
    else:
        # TODO(on-device): confirm the UNO Q serial device name and whether App Lab's RPC bridge is preferred.
        serial_probe = SerialProbe(args.port, args.baud)
        probe = serial_probe

    handled: set[str] = set()
    result_cache: dict[str, list[dict[str, Any]]] = {}
    try:
        while True:
            try:
                jobs = fetch_jobs(session, hub, args.board)
                for job in jobs:
                    handle_job(session, hub, job, probe, handled, result_cache)
            except requests.RequestException as exc:
                LOGGER.warning("hub request failed: %s", exc)
            except Exception:
                LOGGER.exception("poll failed")
            if args.once:
                return
            time.sleep(max(args.poll_ms, 1) / 1000)
    finally:
        if serial_probe is not None:
            serial_probe.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        run(parse_args())
    except KeyboardInterrupt:
        LOGGER.info("stopped")


if __name__ == "__main__":
    main()
