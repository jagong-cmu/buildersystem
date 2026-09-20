import Link from "next/link";
import { getManuals } from "@/lib/manuals.server";
import { HubStatus } from "@/ui/HubStatus";

export default async function Home() {
  const manuals = await getManuals();
  const byDomain = manuals.reduce<Record<string, number>>((acc, m) => ((acc[m.domain] = (acc[m.domain] ?? 0) + 1), acc), {});
  return (
    <div className="max-w-4xl mx-auto px-5 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Turn whatever parts you have into whatever you need.</h1>
        <p className="muted mt-2">
          Scan the pile, pick a build from what&apos;s actually possible, follow a generated step-by-step guide that verifies as you go.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/scan" className="btn primary">
          Scan parts
        </Link>
        <Link href="/builds" className="btn">
          Possible builds
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="text-sm muted mb-2">Manual library</div>
          <ul className="text-sm space-y-1">
            {Object.entries(byDomain).map(([d, n]) => (
              <li key={d}>
                <span className="mono">{d}</span> — {n} manuals
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-4">
          <div className="text-sm muted mb-2">Observation sources</div>
          <HubStatus />
        </div>
      </div>
    </div>
  );
}
