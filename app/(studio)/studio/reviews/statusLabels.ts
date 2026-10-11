import type { ReviewStatus, StatusFilter } from "@/lib/reviews/queue";

// VOICE-006 (docs/decisions/0114 Decision 3): the five statuses come from
// review_queue() (062); these only name and colour them. Pill vocabulary
// and tokens are the runs page's (bg-muted / bg-brand-subtle) plus the
// warning set already used by the Colloquiz review queues for "needs you".

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  not_open: "Not open yet",
  not_sent: "Not sent",
  waiting: "Waiting",
  draft: "Draft",
  answered: "Answered",
};

export const STATUS_PILL: Record<ReviewStatus, string> = {
  not_open: "bg-muted text-muted-foreground",
  not_sent: "bg-muted text-muted-foreground",
  waiting: "bg-warning-subtle text-warning",
  draft: "bg-warning-subtle text-warning",
  answered: "bg-brand-subtle text-brand-text",
};

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  to_review: "To review",
  all: "All",
  ...STATUS_LABEL,
};

export const weekLabel = (week: number | null) => (week == null ? "No week" : `Week ${week}`);
