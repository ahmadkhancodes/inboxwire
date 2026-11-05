import { Notice } from "@/components/ui/states";
import { instanceLicence } from "@/lib/licences";

/** Self-host only: shown when the instance's licence expired and is in its 30 day grace period, or is not valid. */
export function LicenceBanner() {
  const l = instanceLicence();
  if (!l || l.status === "valid") return null;
  if (l.status === "grace") {
    const end = l.payload ? new Date((l.payload.expiresAt + 30 * 86400) * 1000).toISOString().slice(0, 10) : "soon";
    return <Notice tone="warning" title="Licence expired: grace period">Everything keeps working until {end}. Renew in Billing on the Inboxwire site and set the new key as INBOXWIRE_LICENCE.</Notice>;
  }
  return <Notice tone="danger" title={l.status === "expired" ? "Licence expired" : "Licence not valid"}>This instance runs the Developer plan limits until a valid key is set in INBOXWIRE_LICENCE. {l.reason ?? ""}</Notice>;
}
