import { z } from "zod";

const Ulid = z.string().regex(/^[0-9A-HJKMNPQRSTVWXYZ]{26}$/);

export const TrackSchema = z.object({
  id: Ulid,
  kind: z.enum(["file", "category"]),
  target_id: z.string().min(1),
  volume: z.number().min(0).max(1).default(0.7),
  muted: z.boolean().default(false),
  fade_in_ms: z.number().int().min(0).max(30000).default(2000),
  fade_out_ms: z.number().int().min(0).max(30000).default(2000),
  loop: z.boolean().default(true),
}).strict();

export const MixSchema = z.object({
  schema_version: z.literal(1),
  id: Ulid,
  name: z.string().min(1).max(80),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  master_volume: z.number().min(0).max(1).default(0.8),
  tracks: z.array(TrackSchema).min(0).max(8),
  shuffle: z
    .object({
      seed: z.number().int().optional(),
      avoid_last_n: z.number().int().min(0).max(16).default(1),
    })
    .strict()
    .default({ avoid_last_n: 1 }),
}).strict();

export type Mix = z.infer<typeof MixSchema>;
export type MixTrack = z.infer<typeof TrackSchema>;
