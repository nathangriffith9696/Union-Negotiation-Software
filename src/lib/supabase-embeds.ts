/**
 * Normalizes PostgREST embed shapes (object vs single-element array) for UI labels.
 */

export type DistrictsEmbed =
  | { name: string }
  | { name: string }[]
  | null
  | undefined;

export function districtNameFromEmbed(d: DistrictsEmbed): string {
  if (!d) return "Unknown district";
  if (Array.isArray(d)) {
    return d[0]?.name ?? "Unknown district";
  }
  return d.name ?? "Unknown district";
}

export type TitleEmbed =
  | { title: string }
  | { title: string }[]
  | null
  | undefined;

/** Session / proposal (or any row with `title`) optional FK embeds. */
export function optionalEmbedTitle(row: TitleEmbed): string | null {
  if (!row) return null;
  if (Array.isArray(row)) {
    const t = row[0]?.title;
    return t?.trim() ? t : null;
  }
  return row.title?.trim() ? row.title : null;
}

export type NegotiationRelationEmbed = {
  title: string;
  bargaining_units:
    | {
        name: string;
        locals: {
          name: string;
          districts: DistrictsEmbed;
        } | null;
      }
    | {
        name: string;
        locals: {
          name: string;
          districts: DistrictsEmbed;
        } | null;
      }[]
    | null;
} | null;

export function labelsFromNegotiationsRelation(
  negotiations: NegotiationRelationEmbed
): {
  negotiationTitle: string;
  bargainingUnitName: string;
  localName: string;
  districtName: string;
} {
  const neg = negotiations;
  const buRaw = neg?.bargaining_units ?? null;
  const bu = Array.isArray(buRaw) ? buRaw[0] : buRaw;
  const loc = bu?.locals ?? null;
  return {
    negotiationTitle: neg?.title ?? "Unknown negotiation",
    bargainingUnitName: bu?.name ?? "Unknown unit",
    localName: loc?.name ?? "Unknown local",
    districtName: loc ? districtNameFromEmbed(loc.districts) : "Unknown district",
  };
}

export type LocalWithDistrictEmbed = {
  name: string;
  districts: DistrictsEmbed;
};

/** Bargaining unit → local (and district) optional FK. */
export function labelsFromLocalRelation(
  local: LocalWithDistrictEmbed | LocalWithDistrictEmbed[] | null | undefined
): { localName: string; districtName: string } {
  const loc = Array.isArray(local) ? local[0] : local;
  return {
    localName: loc?.name ?? "Unknown local",
    districtName: loc ? districtNameFromEmbed(loc.districts) : "Unknown district",
  };
}
