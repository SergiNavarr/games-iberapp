import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BENCH_IDS } from "@/components/harness/bench-games";
import { PlayBench } from "@/components/harness/PlayBench";

// HARNESS (T4): visual bench for people. Tests use /conformance/[gameId].
export const metadata: Metadata = { title: "Banco visual · Minijuegos" };

export default async function PlayPage({ params }: PageProps<"/play/[gameId]">) {
  const { gameId } = await params;
  if (!BENCH_IDS.includes(gameId)) notFound();
  return <PlayBench gameId={gameId} />;
}
