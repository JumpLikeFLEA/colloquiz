import type { WritingStatusFilter } from "@/lib/writing/review";

export const WRITING_STATUS_FILTER_LABEL: Record<WritingStatusFilter, string> = {
  to_review: "To review",
  all: "All",
  waiting: "Waiting",
  draft: "Draft",
  answered: "Answered",
};
