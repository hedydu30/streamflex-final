-- Add columns for paginated folder discovery
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS discovery_queue jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS discovery_status text DEFAULT 'pending';

-- Reset the stuck job so we can re-test
UPDATE public.import_jobs 
SET status = 'pending', discovery_status = 'pending', discovery_queue = '[]'::jsonb, error = null
WHERE id = 'ac38705d-f0f8-4a1f-bbe3-aeaea4b8a3c1';