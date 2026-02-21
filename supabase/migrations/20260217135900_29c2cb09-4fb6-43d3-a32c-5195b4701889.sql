
-- Table to track duration scan jobs (backend)
CREATE TABLE public.duration_scan_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_videos INTEGER NOT NULL DEFAULT 0,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  found_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  current_video_id UUID NULL,
  error TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE NULL
);

-- Enable RLS
ALTER TABLE public.duration_scan_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view/manage their own scan jobs
CREATE POLICY "Users manage own scan jobs" ON public.duration_scan_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.duration_scan_jobs;

-- Update trigger
CREATE TRIGGER update_duration_scan_jobs_updated_at
  BEFORE UPDATE ON public.duration_scan_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
