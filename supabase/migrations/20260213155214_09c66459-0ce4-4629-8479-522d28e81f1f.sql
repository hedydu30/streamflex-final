
-- Prevent duplicate imports per user (same URL or same title)
CREATE UNIQUE INDEX idx_imported_videos_user_url ON public.imported_videos(user_id, original_url);
CREATE UNIQUE INDEX idx_imported_videos_user_title ON public.imported_videos(user_id, title);
