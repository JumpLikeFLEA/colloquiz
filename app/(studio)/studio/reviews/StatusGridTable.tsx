import { weekKey, type StatusGrid } from "@/lib/reviews/queue";
import { STATUS_LABEL, STATUS_PILL, weekLabel } from "./statusLabels";

// "Status per learner and week" (VOICE-006): one row per enrolment, one
// column per week, built by lib/reviews statusGrid() from review_queue()'s
// rows. A real <table> with scope headers (the Settings > Notifications
// precedent) inside its own horizontal scroller, so many weeks stay
// readable at 360px without the page itself scrolling sideways.

export function StatusGridTable({ grid }: { grid: StatusGrid }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Learner
            </th>
            {grid.weeks.map((w) => (
              <th key={weekKey(w)} scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                {weekLabel(w)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {grid.learners.map((l) => (
            <tr key={l.enrolmentId}>
              <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-normal align-top">
                <span className="block max-w-40 truncate text-foreground" title={l.email}>
                  {l.label}
                </span>
                <span className="block max-w-40 truncate text-xs text-muted-foreground">{l.runLabel}</span>
              </th>
              {grid.weeks.map((w) => (
                <td key={weekKey(w)} className="px-3 py-2 align-top">
                  <div className="flex flex-col items-start gap-1">
                    {(l.cells[weekKey(w)] ?? []).map((s, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_PILL[s]}`}>
                        {STATUS_LABEL[s]}
                      </span>
                    ))}
                    {!l.cells[weekKey(w)] && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
