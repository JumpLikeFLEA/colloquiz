/**
 * Read every row of a PostgREST query, a page at a time (OPS-044, docs/decisions/0250).
 *
 * PostgREST stops a response at `max_rows` (1,000, local and hosted, printed in 0250) and says
 * nothing: the rows past the limit are simply missing. `readAllPages` asks for consecutive
 * `[from, to]` ranges until a page comes back shorter than the page size.
 *
 * Two things are the caller's job, because only the caller knows the query:
 * - the query must have a total order (a unique tiebreak, or every selected column), or rows
 *   that tie can be skipped or repeated between pages;
 * - the page size must not exceed the server's `max_rows`, or every page comes back short and
 *   the read stops after the first (0250 Decision 2).
 *
 * Any failed page fails the whole read, and no rows are returned: a partial section is worse
 * than none (docs/decisions/0225 Decision 14).
 */

export const PAGE_SIZE = 1000;

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };
export type PagedResult<T> = { data: T[]; error: null } | { data: null; error: { message: string } };

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<PagedResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error(`readAllPages: bad page size ${pageSize}`);
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
