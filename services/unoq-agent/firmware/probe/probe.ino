// Generic probe firmware for the UNO Q / Arduino-compatible MCU.
// On UNO Q, the pin mapping and Serial versus the App Lab bridge need on-device confirmation.

const size_t BUFFER_SIZE = 80;
char buffer[BUFFER_SIZE];
size_t bufferLength = 0;

bool decimalPin(const char *text, int &pin) {
  if (!text || !*text) return false;
  int value = 0;
  for (const char *p = text; *p; ++p) {
    if (*p < '0' || *p > '9') return false;
    value = value * 10 + (*p - '0');
  }
  pin = value;
  return true;
}

bool analogPin(const char *text, int &pin) {
  if (text[0] == 'A' && decimalPin(text + 1, pin)) return pin >= 0 && pin <= 5;
  return decimalPin(text, pin) && pin >= 0 && pin <= 5;
}

bool digitalPin(const char *text, int &pin) {
  if (text[0] == 'D' && decimalPin(text + 1, pin)) return pin >= 2 && pin <= 13;
  return decimalPin(text, pin) && pin >= 2 && pin <= 13;
}

void error(const char *reason) {
  Serial.print("ERR ");
  Serial.println(reason);
}

void handleCommand(char *line) {
  char *command = strtok(line, " ");
  if (!command) return;
  if (!strcmp(command, "PING")) {
    Serial.println("PONG");
    return;
  }
  if (strcmp(command, "PROBE")) {
    error("unknown command");
    return;
  }

  char *pinText = strtok(nullptr, " ");
  char *mode = strtok(nullptr, " ");
  if (!pinText || !mode) {
    error("usage: PROBE <pin> <mode> [ms]");
    return;
  }

  int pin = -1;
  if (!strcmp(mode, "analogRead")) {
    if (!analogPin(pinText, pin)) {
      error("invalid analog pin");
      return;
    }
    Serial.print("OK ");
    Serial.println(analogRead(A0 + pin));
    return;
  }

  if (!strcmp(mode, "digitalRead")) {
    if (!digitalPin(pinText, pin)) {
      error("invalid digital pin");
      return;
    }
    pinMode(pin, INPUT_PULLUP);
    Serial.print("OK ");
    Serial.println(digitalRead(pin) ? 1 : 0);
    return;
  }

  if (!strcmp(mode, "pulse")) {
    if (!digitalPin(pinText, pin)) {
      error("invalid pulse pin");
      return;
    }
    unsigned long duration = 200;
    char *durationText = strtok(nullptr, " ");
    if (durationText) {
      int parsed = 0;
      if (!decimalPin(durationText, parsed) || parsed < 1 || parsed > 60000) {
        error("invalid pulse duration");
        return;
      }
      duration = (unsigned long)parsed;
    }
    pinMode(pin, OUTPUT);
    digitalWrite(pin, HIGH);
    delay(duration);
    digitalWrite(pin, LOW);
    Serial.println("OK 1");
    return;
  }

  error("unknown probe mode");
}

void setup() {
  Serial.begin(115200);
  Serial.println("READY");
}

void loop() {
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      buffer[bufferLength] = '\0';
      handleCommand(buffer);
      bufferLength = 0;
    } else if (bufferLength < BUFFER_SIZE - 1) {
      buffer[bufferLength++] = ch;
    } else {
      bufferLength = 0;
      error("line too long");
    }
  }
}
