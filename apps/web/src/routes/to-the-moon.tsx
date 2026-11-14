import { createFileRoute } from "@tanstack/react-router"

import { MoonGame } from "@/features/to-the-moon/components/moon-game"

export const Route = createFileRoute("/to-the-moon")({
  component: MoonGame,
})
