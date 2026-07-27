// "1 day" / "2 days". Every count we render next to a noun goes through here so
// a streak of one never reads "1 days". Irregular plurals pass their own form.
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatDuration(totalSeconds: number, style: "compact" | "verbose"): string {
  if (style === "compact") {
    if (totalSeconds === 0) return "0m";
    const minutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes % 60}m`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
