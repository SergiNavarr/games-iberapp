import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { GAMES } from "@/lib/data/games";
import { getPortal } from "@/lib/data/portals";

// HARNESS (not moved to the landing): index of the games test bench. Lists the four games from GAMES with their
// home portal. Links to each game's bench (app/play/[gameId]) come in T3 + T4.
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
        {GAMES.map((game) => (
          <li key={game.id} className="flex flex-col gap-2 rounded-[12px] border border-rule bg-page-2 p-6">
            <span className="eyebrow text-mute">{game.id}</span>
            <h2 className="title-display m-0 text-[32px] leading-none text-head">{game.title}</h2>
            <p className="m-0 text-mute">Portal: {getPortal(game.portalId)?.name ?? game.portalId}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
