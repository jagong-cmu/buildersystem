import { PhoneSource } from "@/ui/PhoneSource";

// Open this on a phone (same Wi-Fi as the laptop): it streams the camera to the hub
// on the same protocol the glasses bridge uses (PRD §7.3).
export default function PhoneSourcePage() {
  return <PhoneSource />;
}
