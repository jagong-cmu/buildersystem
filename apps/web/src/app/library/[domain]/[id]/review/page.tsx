import { IngestReview } from "@/ui/IngestReview";
import type { DomainId } from "@/core/types";

export default async function ReviewPage({ params }: { params: Promise<{ domain: string; id: string }> }) {
  const { domain, id } = await params;
  return <IngestReview domain={domain as DomainId} id={id} />;
}
