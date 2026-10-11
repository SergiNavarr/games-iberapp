import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BENCH_IDS } from "@/components/harness/bench-games";
import { ConformanceBench } from "@/components/harness/ConformanceBench";

// HARNESS (T4): /conformance/<gameId>?seed=<n>&testHooks=1&reducedMotion=0|1 is a fixed contract with the judge's tests.
export const metadata: Metadata = { title: "Banco de conformidad · Minijuegos" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ConformancePage({ params, searchParams }: PageProps<"/conformance/[gameId]">) {
  const { gameId } = await params;
  if (!BENCH_IDS.includes(gameId)) notFound();
  const query = await searchParams;
  const seedParam = one(query.seed);
  const seed = seedParam !== undefined && Number.isFinite(Number(seedParam)) ? Number(seedParam) : undefined;
  const motion = one(query.reducedMotion);
  return (
    <ConformanceBench
      initialGameId={gameId}
      seed={seed}
      testHooks={one(query.testHooks) === "1"}
      reducedMotion={motion === "1" ? true : motion === "0" ? false : undefined}
    />
  );
}
