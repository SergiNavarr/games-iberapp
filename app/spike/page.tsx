import type { Metadata } from "next";
import { SpikeBench } from "@/components/harness/SpikeBench";

// HARNESS (T2): route /spike is a fixed contract with the judge's tests.
export const metadata: Metadata = { title: "Spike de Phaser · Banco de pruebas" };

export default function SpikePage() {
  return <SpikeBench />;
}
