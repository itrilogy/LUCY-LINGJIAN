import type { Mix } from "../../shared/mixSchema";

export type PlayNavState = {
  autoplay?: boolean;
  mix?: Mix;
  momentTags?: string[];
};
