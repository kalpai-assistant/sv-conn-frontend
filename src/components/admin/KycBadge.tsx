import { Badge } from "@/components/ui/badge";
import type { KycStatus } from "@/hooks/useApi";
import { KYC_LABEL } from "@/lib/admin-team";

const VARIANT: Record<KycStatus, "default" | "secondary" | "destructive" | "outline"> = {
  verified: "default",
  submitted: "secondary",
  pending: "outline",
  rejected: "destructive",
};

export function KycBadge({ status }: { status: KycStatus }) {
  return <Badge variant={VARIANT[status] ?? "outline"}>{KYC_LABEL[status] ?? status}</Badge>;
}
