/**
 * OPS-035: how a Studio JSON route turns a SECURITY DEFINER RPC's answer into a response.
 * A transport error is 500; an `{ ok: false, error }` refusal maps not_found to 404,
 * forbidden or seat_lapsed to 403, anything else to 400. The message text is the caller's
 * (each feature has its own `...ErrorMessage`).
 */

export type RpcAnswer = { data: unknown; error: { message: string } | null };

export type RelayOutcome =
  | { failure: { status: number; error: string }; result?: undefined }
  | { failure?: undefined; result: { ok?: boolean; error?: string } & Record<string, unknown> };

export function refusalStatus(code: string | undefined): number {
  if (code === "not_found") return 404;
  if (code === "forbidden" || code === "seat_lapsed") return 403;
  return 400;
}

export async function relayRpc(
  call: PromiseLike<RpcAnswer>,
  messageFor: (code: string | undefined) => string,
): Promise<RelayOutcome> {
  const { data, error } = await call;
  if (error) return { failure: { status: 500, error: "Something went wrong." } };
  const r = (data ?? {}) as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (!r.ok) return { failure: { status: refusalStatus(r.error), error: messageFor(r.error) } };
  return { result: r };
}
