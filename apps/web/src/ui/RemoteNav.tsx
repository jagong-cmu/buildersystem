"use client";
// Lets the hub drive navigation (`{type:"nav", path}`) so a recorded session or
// the glasses bridge can move the laptop from /scan to /builds to a guide.
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeControl } from "@/lib/hub";

export function isSafeNavPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !/[\s<>]/.test(path);
}

export function RemoteNav() {
  const router = useRouter();
  useEffect(
    () =>
      subscribeControl((msg) => {
        if (msg.type === "nav" && isSafeNavPath(msg.path)) router.push(msg.path);
      }),
    [router],
  );
  return null;
}
