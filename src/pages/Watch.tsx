import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getSecureVideoUrl } from "@/lib/secure-video";
import VideoPlayer from "@/components/VideoPlayer";
import { ArrowLeft, ShieldAlert } from "lucide-react";

const Watch = () => {
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoId = searchParams.get("v");
  const mixParam = searchParams.get("mix");

  const [video, setVideo] = useState<any>(null);
  const [signedSrc, setSignedSrc] = useState<string | null>(null);
  const [videoModelName, setVideoModelName] = useState<string | undefined>();
  const [initialLoading, setInitialLoading] = useState(true);
  const [srcLoading, setSrcLoading] = useState(false);
  const [error, setError] = useState(false);

  // Mix mode state
  const [mixIds, setMixIds] = useState<string[]>([]);
  const [mixIndex, setMixIndex] = useState(0);
  const isMixMode = mixIds.length > 0;
  const playerMounted = useRef(false);

  // Preload cache for instant mix switching
  const preloadCache = useRef<Map<string, { video: any; src: string; modelName?: string }>>(new Map());

  // Parse mix playlist on mount
  useEffect(() => {
    if (mixParam) {
      try {
        const ids = JSON.parse(decodeURIComponent(mixParam));
        if (Array.isArray(ids) && ids.length > 0) {
          setMixIds(ids);
          setMixIndex(0);
        }
      } catch {}
    }
  }, [mixParam]);

  // Fetch signed URL for a video ID
  const fetchVideoData = useCallback(async (id: string): Promise<{ video: any; src: string; modelName?: string } | null> => {
    try {
      let query = supabase
        .from("imported_videos")
        .select("id, title, thumbnail_url, duration_seconds, format, file_size, source, metadata, model_id")
        .eq("id", id);

      if (user) {
        query = query.eq("user_id", user.id);
      }

      const { data, error: dbError } = await query.maybeSingle();
      if (dbError || !data) return null;

      let modelName: string | undefined;
      if (data.model_id) {
        const { data: modelData } = await supabase.from("models").select("name").eq("id", data.model_id).maybeSingle();
        if (modelData) modelName = modelData.name;
      }

      if (!user) {
        return { video: data, src: "", modelName };
      }

      // Use secure video URL fetcher
      const result = await getSecureVideoUrl(id);
      if (!result) return null;

      return { video: data, src: result.blobUrl, modelName };
    } catch {}
    return null;
  }, [user]);

  // Preload adjacent mix videos (URL + start buffering actual data)
  const preloadElements = useRef<Map<string, HTMLVideoElement>>(new Map());
  const preloadAdjacent = useCallback((currentIdx: number) => {
    if (!isMixMode) return;
    const toPreload = [currentIdx + 1, currentIdx - 1].filter(i => i >= 0 && i < mixIds.length);
    for (const i of toPreload) {
      const id = mixIds[i];
      if (!preloadCache.current.has(id)) {
        fetchVideoData(id).then(result => {
          if (result) {
            preloadCache.current.set(id, result);
            // Create hidden video element to start buffering
            if (!preloadElements.current.has(id)) {
              const vid = document.createElement("video");
              vid.preload = "auto";
              vid.muted = true;
              vid.src = result.src;
              vid.load();
              preloadElements.current.set(id, vid);
            }
          }
        });
      } else if (!preloadElements.current.has(id)) {
        // URL cached but not buffering yet
        const cached = preloadCache.current.get(id);
        if (cached) {
          const vid = document.createElement("video");
          vid.preload = "auto";
          vid.muted = true;
          vid.src = cached.src;
          vid.load();
          preloadElements.current.set(id, vid);
        }
      }
    }
    // Cleanup old preload elements (keep only adjacent)
    const keepIds = new Set(toPreload.map(i => mixIds[i]));
    for (const [id, vid] of preloadElements.current) {
      if (!keepIds.has(id)) {
        vid.src = "";
        vid.load();
        preloadElements.current.delete(id);
      }
    }
  }, [isMixMode, mixIds, fetchVideoData]);

  // Fetch video metadata + signed URL
  useEffect(() => {
    // Allow fetching video data even without auth (for metadata display)
    const currentId = isMixMode ? mixIds[mixIndex] : videoId;
    if (!currentId) { setInitialLoading(false); return; }

    setError(false);
    const isFirstLoad = !playerMounted.current;

    // Check preload cache first for instant switch
    const cached = preloadCache.current.get(currentId);
    if (cached) {
      setVideo(cached.video);
      setSignedSrc(cached.src);
      setVideoModelName(cached.modelName);
      playerMounted.current = true;
      setInitialLoading(false);
      setSrcLoading(false);
      preloadAdjacent(mixIndex);
      return;
    }

    if (!isFirstLoad) setSrcLoading(true);

    fetchVideoData(currentId).then(result => {
      if (result) {
        setVideo(result.video);
        setSignedSrc(result.src);
        setVideoModelName(result.modelName);
        preloadCache.current.set(currentId, result);
        playerMounted.current = true;
        preloadAdjacent(mixIndex);
      } else {
        setError(true);
      }
      setInitialLoading(false);
      setSrcLoading(false);
    });
  }, [user, videoId, mixIds, mixIndex, isMixMode, fetchVideoData, preloadAdjacent]);

  const goNext = useCallback(() => {
    if (mixIndex < mixIds.length - 1) setMixIndex((i) => i + 1);
  }, [mixIndex, mixIds.length]);

  const goPrev = useCallback(() => {
    if (mixIndex > 0) setMixIndex((i) => i - 1);
  }, [mixIndex]);

  const handleClose = () => navigate(-1);

  if (authLoading || (initialLoading && !playerMounted.current)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldAlert size={48} className="text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Contenu Premium</h2>
        <p className="text-muted-foreground text-center max-w-md">Connectez-vous pour accéder aux vidéos complètes. Les extraits sont disponibles sur la page d'accueil.</p>
        <button onClick={() => navigate("/auth")} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors">
          Se connecter
        </button>
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground text-sm">
          Retour
        </button>
      </div>
    );
  }

  if (error && !signedSrc) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldAlert size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground">Impossible de charger la vidéo.</p>
        <button onClick={handleClose} className="text-primary hover:underline">
          Retour aux vidéos
        </button>
      </div>
    );
  }

  if (!signedSrc || !video) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <button
        onClick={handleClose}
        className="fixed top-4 left-4 z-50 flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors bg-black/50 rounded-full px-3 py-2"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Retour</span>
      </button>


      <div className="flex items-center justify-center h-screen">
        <div className="w-full relative">
          <VideoPlayer
            videoId={video.id}
            src={signedSrc}
            title={video.title}
            autoPlay={true}
            onClose={handleClose}
            modelName={videoModelName}
            modelId={video.model_id}
            {...(isMixMode && {
              onNext: goNext,
              onPrev: goPrev,
              hasNext: mixIndex < mixIds.length - 1,
              hasPrev: mixIndex > 0,
              mixIndex,
              mixTotal: mixIds.length,
            })}
          />
        </div>
      </div>
    </div>
  );
};

export default Watch;