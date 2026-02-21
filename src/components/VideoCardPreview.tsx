import { useEffect, useRef, useState, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSecureVideoUrl } from "@/lib/secure-video";
import { usePreviewSound } from "@/contexts/PreviewSoundContext";

interface Props {
  videoId: string;
  isHovered: boolean;
  autoPlay?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  fallbackUrl?: string;
}

// Track which videoIds we've already saved duration for (avoid repeat DB writes)
const durationSavedSet = new Set<string>();

const VideoCardPreview = ({ videoId, isHovered, autoPlay = false, onTimeUpdate, fallbackUrl }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const timerRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const durationSavedRef = useRef(false);
  const { previewSoundEnabled } = usePreviewSound();

  const active = isHovered || autoPlay;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if a URL is a direct playable video (not a hosting page link)
  const isPlayableUrl = (url?: string) => {
    if (!url) return false;
    if (url.includes("1fichier.com") || url.includes("mega.nz")) return false;
    return true;
  };

  useEffect(() => {
    mountedRef.current = true;
    if (!active) {
      // Cancel pending debounce
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      setReady(false);
      setVideoUrl(null);
      setLoading(false);
      clearInterval(timerRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
      return;
    }

    // Debounce 300ms before loading to avoid unnecessary calls on quick hover
    debounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setLoading(true);

      const loadingTimeout = setTimeout(() => {
        if (mountedRef.current) setLoading(false);
      }, 8000);

      supabase.auth.getSession().then(({ data: { session } }) => {
        clearTimeout(loadingTimeout);
        if (!mountedRef.current) return;

        if (session) {
          getSecureVideoUrl(videoId).then((result) => {
            if (!mountedRef.current) return;
            if (result) {
              setVideoUrl(result.blobUrl);
            } else if (isPlayableUrl(fallbackUrl)) {
              setVideoUrl(fallbackUrl!);
            }
            setLoading(false);
          });
        } else if (isPlayableUrl(fallbackUrl)) {
          setVideoUrl(fallbackUrl!);
          setLoading(false);
        } else {
          setLoading(false);
        }
      });
    }, autoPlay ? 0 : 300);

    return () => {
      mountedRef.current = false;
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
      clearInterval(timerRef.current);
    };
  }, [active, videoId, fallbackUrl, autoPlay]);

  // Sync muted state when preference changes
  useEffect(() => {
    if (videoRef.current && active) {
      videoRef.current.muted = !previewSoundEnabled;
      if (previewSoundEnabled) {
        videoRef.current.volume = 0.3;
      }
    }
  }, [previewSoundEnabled, active]);

  // When URL is ready + active, load and play
  useEffect(() => {
    if (!active || !videoUrl) return;
    const vid = videoRef.current;
    if (!vid) return;

    vid.src = videoUrl;
    vid.muted = !previewSoundEnabled;
    vid.volume = previewSoundEnabled ? 0.3 : 0;
    vid.playsInline = true;
    vid.load();

    const onCanPlay = () => {
      if (!mountedRef.current || !active) return;
      setReady(true);
      // Auto-save duration to DB if not already saved
      if (!durationSavedRef.current && !durationSavedSet.has(videoId) && vid.duration && isFinite(vid.duration) && vid.duration > 0) {
        durationSavedRef.current = true;
        durationSavedSet.add(videoId);
        supabase
          .from("imported_videos")
          .update({ duration_seconds: Math.floor(vid.duration) })
          .eq("id", videoId)
          .is("duration_seconds", null)
          .then(() => {});
      }
      vid.play().catch(() => {
        vid.muted = true;
        vid.play().catch(() => {});
      });
    };

    const onTime = () => {
      if (onTimeUpdate && vid.currentTime) {
        onTimeUpdate(vid.currentTime);
      }
    };

    vid.addEventListener("canplay", onCanPlay, { once: true });
    vid.addEventListener("timeupdate", onTime);

    return () => {
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("timeupdate", onTime);
      clearInterval(timerRef.current);
    };
  }, [active, videoUrl, videoId, onTimeUpdate, previewSoundEnabled]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-10 rounded-lg overflow-hidden">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <video
        ref={videoRef}
        className={`w-full h-full object-cover transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
        playsInline
        muted={!previewSoundEnabled}
        loop={false}
      />
    </div>
  );
};

export default memo(VideoCardPreview);
