import { Badge } from "@/components/ui/badge";
import type { TaskStatus, TranslationStatus } from "@/lib/api/types";
import { taskStatusLabel, translationStatusLabel } from "@/lib/labels";

const translationVariant: Record<
  TranslationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  not_started: "outline",
  in_progress: "default",
  synced: "secondary",
  error: "destructive",
};

const taskVariant: Record<
  TaskStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "default",
  completed: "secondary",
  failed: "destructive",
  skipped: "outline",
};

export function TranslationStatusBadge({
  status,
}: {
  status: TranslationStatus;
}) {
  return (
    <Badge variant={translationVariant[status]}>
      {translationStatusLabel[status]}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant={taskVariant[status]}>{taskStatusLabel[status]}</Badge>
  );
}
