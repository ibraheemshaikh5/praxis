import {
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  Dumbbell,
  Heart,
  Leaf,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import {
  DEFAULT_TASK_ICON,
  type TaskIconKey,
} from "@/lib/daily-planner/appearance";

const icons: Record<TaskIconKey, LucideIcon> = {
  check: CheckCircle2,
  briefcase: BriefcaseBusiness,
  book: BookOpen,
  dumbbell: Dumbbell,
  heart: Heart,
  leaf: Leaf,
  utensils: Utensils,
  sparkles: Sparkles,
};

export function TaskGlyph({ iconKey }: { iconKey?: TaskIconKey }) {
  const Icon = icons[iconKey ?? DEFAULT_TASK_ICON];
  return <Icon aria-hidden="true" />;
}
