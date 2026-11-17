import type { VersionSummary } from "@knowngdb/contracts";

export type ReviewAction = "review" | "approve" | "approve-publish" | "reject";

export async function runReviewWorkflow(
  version: VersionSummary,
  action: ReviewAction,
  reason: string,
  request: (path: string, body: object) => Promise<void>,
  onApproved: () => void,
) {
  let currentStatus = version.moderation;
  const reviewPath = `/api/v1/admin/asset-versions/${version.id}/review`;
  async function review(status: VersionSummary["moderation"]) {
    await request(reviewPath, {
      expectedStatus: currentStatus,
      status,
      reason,
    });
    currentStatus = status;
  }
  if (currentStatus === "submitted") await review("in_review");
  if (action === "approve" || action === "approve-publish") {
    await review("approved");
    onApproved();
  } else if (action === "reject") {
    await review("rejected");
  }
  if (action === "approve-publish") {
    await request(`/api/v1/admin/asset-versions/${version.id}/publication`, {
      expectedStatus: "private",
      publicationStatus: "published",
      reason,
    });
  }
}
