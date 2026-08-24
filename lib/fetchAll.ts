/**
 * Supabase/PostgREST caps a single response at 1000 rows by default — any
 * unpaginated `.select()` over a table bigger than that silently drops the
 * rest. This pages through with `.range()` until everything's been read.
 *
 * Usage:
 *   const cases = await fetchAllRows((from, to) =>
 *     supabase.from('cases').select('*').order('id').range(from, to)
 *   )
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
