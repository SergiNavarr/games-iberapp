import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { BENCH_IDS, benchStage } from "@/components/harness/bench-games";
import { getPortal } from "@/lib/data/portals";

// HARNESS (not moved to the landing): index of the test benches. One card per game (the four GameIds and the harness
// `_dummy`), with its home portal, registry state and links to the visual bench and the conformance bench.
export default function HarnessIndex() {
  return (
    <main className="flex min-h-dvh flex-col gap-10 bg-page py-16 text-fg" style={{ paddingInline: "clamp(24px,4vw,64px)" }}>
      <header className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <span className="eyebrow text-mute">Banco de pruebas · IberAPP</span>
          <h1 className="title-display m-0 text-[clamp(44px,6vw,88px)] leading-[0.9] text-head">Minijuegos</h1>
        </div>
        <ThemeToggle color="var(--fg)" borderColor="var(--rule)" />
      </header>
      <ul className="m-0 grid list-none gap-4 p-0 tab:grid-cols-2">
        {BENCH_IDS.map((id) => {
          const stage = benchStage(id);
          return (
            <li key={id} className="flex flex-col gap-2 rounded-[12px] border border-rule bg-page-2 p-6">
              <span className="eyebrow text-mute">
                {id} · {stage.entry.status === "ready" ? "jugable" : "próximamente"}
              </span>
              <h2 className="title-display m-0 text-[32px] leading-none text-head">{stage.title}</h2>
              <p className="m-0 text-mute">Portal: {getPortal(stage.portalId)?.name ?? stage.portalId}</p>
              <p className="m-0 flex gap-4 text-[15px]">
                <Link href={`/play/${id}`} className="link-underline text-fg no-underline">
                  Banco visual
                </Link>
                <Link href={`/conformance/${id}`} className="link-underline text-fg no-underline">
                  Conformidad
                </Link>
              </p>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-mute">
        <Link href="/spike" className="link-underline text-fg no-underline">
          Spike de Phaser (T2)
        </Link>
      </p>
    </main>
  );
}
