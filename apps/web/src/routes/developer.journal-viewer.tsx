import { createFileRoute } from "@tanstack/react-router"
import { DeveloperJournal } from "@/features/journal-viewer/components/developer-journal"

export const Route = createFileRoute("/developer/journal-viewer")({
  component: DeveloperJournal,
})
