import type { ComponentType } from "react";
import { SupportsArtifact } from "./artifacts/SupportsArtifact";
import { RefineConfirmation } from "./artifacts/RefineConfirmation";
import { PricingArtifact } from "./artifacts/PricingArtifact";
import { AdjustArtifact } from "./artifacts/AdjustArtifact";
import { ExportArtifact } from "./artifacts/ExportArtifact";
import { MetadataArtifact } from "./artifacts/MetadataArtifact";
import { EmailPreview } from "./artifacts/EmailPreview";
import { SuggestNextStepsArtifact } from "./artifacts/SuggestNextStepsArtifact";

export type ArtifactProps = {
  result: unknown;
  onSendMessage?: (text: string) => void;
};

export const ARTIFACT_REGISTRY: Record<string, ComponentType<ArtifactProps>> = {
  ragSearch: SupportsArtifact,
  refineSelection: RefineConfirmation,
  calculatePricing: PricingArtifact,
  adjustSupport: AdjustArtifact,
  generateExcel: ExportArtifact,
  generatePpt: ExportArtifact,
  collectMetadata: MetadataArtifact,
  draftEmail: EmailPreview,
  suggestNextSteps: SuggestNextStepsArtifact,
};
