/** Results are transient: do not add visited hosts or provider lookups to storage. */
export interface SiteDiagnostics {
  hostname: string;
  status: "resolved" | "onion" | "protected" | "failed";
  addresses: string[];
  registrationStatus?: "available" | "unavailable" | "private-address";
  network?: {
    ip: string;
    asns: number[];
    prefix?: string;
    holder?: string;
    provider: "RIPEstat";
  };
}
