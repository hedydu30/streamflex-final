
-- Add ON DELETE CASCADE to all foreign keys referencing imported_videos
ALTER TABLE public.comments DROP CONSTRAINT comments_video_id_fkey;
ALTER TABLE public.comments ADD CONSTRAINT comments_video_id_fkey
  FOREIGN KEY (video_id) REFERENCES public.imported_videos(id) ON DELETE CASCADE;

ALTER TABLE public.video_ratings DROP CONSTRAINT video_ratings_video_id_fkey;
ALTER TABLE public.video_ratings ADD CONSTRAINT video_ratings_video_id_fkey
  FOREIGN KEY (video_id) REFERENCES public.imported_videos(id) ON DELETE CASCADE;

ALTER TABLE public.video_tags DROP CONSTRAINT video_tags_video_id_fkey;
ALTER TABLE public.video_tags ADD CONSTRAINT video_tags_video_id_fkey
  FOREIGN KEY (video_id) REFERENCES public.imported_videos(id) ON DELETE CASCADE;

-- Add ON DELETE CASCADE to imported_videos -> models
ALTER TABLE public.imported_videos DROP CONSTRAINT imported_videos_model_id_fkey;
ALTER TABLE public.imported_videos ADD CONSTRAINT imported_videos_model_id_fkey
  FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE SET NULL;

-- Add ON DELETE CASCADE to import_jobs -> models
ALTER TABLE public.import_jobs DROP CONSTRAINT import_jobs_model_id_fkey;
ALTER TABLE public.import_jobs ADD CONSTRAINT import_jobs_model_id_fkey
  FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE SET NULL;

-- Add ON DELETE CASCADE to model_favorites -> models
ALTER TABLE public.model_favorites DROP CONSTRAINT model_favorites_model_id_fkey;
ALTER TABLE public.model_favorites ADD CONSTRAINT model_favorites_model_id_fkey
  FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE CASCADE;
