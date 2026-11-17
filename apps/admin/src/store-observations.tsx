import type { AdminRole } from "@knowngdb/contracts";
import { PageHeading } from "@knowngdb/ui/workspace";
import { SteamPreview } from "./steam-preview.tsx";
import { XboxPreview } from "./xbox-preview.tsx";
import { EpicPreview } from "./epic-preview.tsx";
import { EAPreview } from "./ea-preview.tsx";
import { UbisoftPreview } from "./ubisoft-preview.tsx";
import { PlayStationPreview } from "./playstation-preview.tsx";

export function StoreObservations({ role }: { role: AdminRole }) {
  return (
    <>
      <PageHeading
        title="Store observations"
        description="Review official storefront evidence before associating provider identities with a KnownGDB catalog item."
      />
      <div className="store-observations">
        <SteamPreview role={role} />
        <XboxPreview role={role} />
        <EpicPreview role={role} />
        <EAPreview role={role} />
        <UbisoftPreview role={role} />
        <PlayStationPreview role={role} />
      </div>
    </>
  );
}
