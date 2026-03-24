/** UUID v1–v5 shape; used to decide when `negotiation_id` filters are safe for Postgres UUID columns. */
export function isLikelyNegotiationUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id.trim()
  );
}
