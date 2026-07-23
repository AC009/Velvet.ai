-- Migration 015: missions_pool — Content Engine hardware mission catalog
-- Paste & run in the Supabase SQL Editor (public schema).

CREATE TABLE IF NOT EXISTS public.missions_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_type TEXT NOT NULL,
  arc_id TEXT NOT NULL,
  sequence_order INTEGER NOT NULL,
  mission_text TEXT NOT NULL,
  sensor_type TEXT NOT NULL DEFAULT 'CAMERA_VISION',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT missions_pool_sequence_positive CHECK (sequence_order >= 1),
  CONSTRAINT missions_pool_mission_text_not_empty CHECK (char_length(trim(mission_text)) > 0),
  CONSTRAINT missions_pool_world_arc_sequence_unique
    UNIQUE (world_type, arc_id, sequence_order)
);

CREATE INDEX IF NOT EXISTS idx_missions_pool_world_arc_sequence
  ON public.missions_pool (world_type, arc_id, sequence_order ASC);

COMMENT ON TABLE public.missions_pool IS
  'Content Engine — sequential hardware missions per world / story arc.';

COMMENT ON COLUMN public.missions_pool.world_type IS
  'World label matching catalog (e.g. Horror Mystery, Mafia World, Romance Drama).';

COMMENT ON COLUMN public.missions_pool.sensor_type IS
  'Hardware sensor framing: CAMERA_VISION, LIGHT_SENSOR, GYROSCOPE, etc.';

ALTER TABLE public.missions_pool ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS missions_pool_select_all ON public.missions_pool;
CREATE POLICY missions_pool_select_all
  ON public.missions_pool
  FOR SELECT
  USING (true);

-- ---------------------------------------------------------------------------
-- Seed: The Watcher — Horror Mystery Arc 1 (required)
-- ---------------------------------------------------------------------------
INSERT INTO public.missions_pool (world_type, arc_id, sequence_order, mission_text, sensor_type)
VALUES
  (
    'Horror Mystery',
    'arc_1',
    1,
    'Take a photo of your study workspace / desk. Prove to me your physical environment is clear of distractions so we can begin the focus sync.',
    'CAMERA_VISION'
  ),
  (
    'Horror Mystery',
    'arc_1',
    2,
    'Turn off all lights in your room, point your camera into the darkness, and capture proof of total environmental dark mode.',
    'LIGHT_SENSOR'
  ),
  (
    'Horror Mystery',
    'arc_1',
    3,
    'Provide visual proof of physical exertion. Capture a photo of your workout space or your hands on the ground post-exercise to prove your flesh matches your mental discipline.',
    'CAMERA_VISION'
  )
ON CONFLICT (world_type, arc_id, sequence_order) DO UPDATE SET
  mission_text = EXCLUDED.mission_text,
  sensor_type = EXCLUDED.sensor_type;

-- ---------------------------------------------------------------------------
-- Seed: Mafia World Arc 1
-- ---------------------------------------------------------------------------
INSERT INTO public.missions_pool (world_type, arc_id, sequence_order, mission_text, sensor_type)
VALUES
  (
    'Mafia World',
    'arc_1',
    1,
    'Photograph your cleared desk like a war table — one task only, no clutter. Prove you can hold formation before the next order drops.',
    'CAMERA_VISION'
  ),
  (
    'Mafia World',
    'arc_1',
    2,
    'Show proof of physical grit: a workout corner, mat, or post-set stance. Soft excuses die here.',
    'CAMERA_VISION'
  ),
  (
    'Mafia World',
    'arc_1',
    3,
    'Kill the lights. Capture total dark mode in your room — silence, shadow, discipline. No glowing screens.',
    'LIGHT_SENSOR'
  )
ON CONFLICT (world_type, arc_id, sequence_order) DO UPDATE SET
  mission_text = EXCLUDED.mission_text,
  sensor_type = EXCLUDED.sensor_type;

-- ---------------------------------------------------------------------------
-- Seed: Romance Drama Arc 1
-- ---------------------------------------------------------------------------
INSERT INTO public.missions_pool (world_type, arc_id, sequence_order, mission_text, sensor_type)
VALUES
  (
    'Romance Drama',
    'arc_1',
    1,
    'Show me a prepared presence: coat, shoes, or the note you will deliver in a real conversation. No filters. Real world only.',
    'CAMERA_VISION'
  ),
  (
    'Romance Drama',
    'arc_1',
    2,
    'Capture a calm, distraction-free desk or corner where you can actually listen. Prove you made space for intensity.',
    'CAMERA_VISION'
  ),
  (
    'Romance Drama',
    'arc_1',
    3,
    'Dim the room. Photograph low-light focus — candle, lamp edge, or night desk — and prove you can stay present in the dark.',
    'LIGHT_SENSOR'
  )
ON CONFLICT (world_type, arc_id, sequence_order) DO UPDATE SET
  mission_text = EXCLUDED.mission_text,
  sensor_type = EXCLUDED.sensor_type;
