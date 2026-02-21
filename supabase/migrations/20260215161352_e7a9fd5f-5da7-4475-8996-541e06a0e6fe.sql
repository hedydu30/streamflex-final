
-- Allow anyone (including anonymous/non-logged-in) to view active imported videos
CREATE POLICY "Public can view active videos"
ON public.imported_videos
FOR SELECT
USING (is_active = true);

-- Allow anyone to view models (for model names on cards)
CREATE POLICY "Public can view models"
ON public.models
FOR SELECT
USING (true);

-- Allow anyone to view categories
CREATE POLICY "Public can view categories"
ON public.categories
FOR SELECT
USING (true);
