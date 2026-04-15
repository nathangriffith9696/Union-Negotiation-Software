import { redirect } from "next/navigation";

/** Field rep assignments live under Admin → People & access. */
export default function AssignmentsRedirectPage() {
  redirect("/admin");
}
