import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRecommendations } from "@/hooks/useRecommendations";
import { Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendedVideo {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  model_id: string | null;
  modelName?: string;
}

interface EndScreenRecommendationsProps {
  currentVideoId: string;
  modelId?: string;
  modelName?: string;
  allVideos?: any[];
  onPlayVideo: (videoId: string) => void;
  onReplay: () => void;
  onClose?: () => void;
}

const formatDuration = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const EndScreenRecommendations = ({
  currentVideoId,
  modelId,
  modelName,
  allVideos = [],
  onPlayVideo,
  onReplay,
  onClose,
}: EndScreenRecommendationsProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sameModelVideos, setSameModelVideos] = useState<RecommendedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nextVideoId, setNextVideoId] = useState<string | null>(null);

  // Use algorithmic recommendations for "other" section
  const { recommendations } = useRecommendations(allVideos, 6);
  const otherVideos = useMemo(() => {
    const sameModelIds = new Set(sameModelVideos.map((v) => v.id));
    return recommendations
      .filter((v: any) => v.id !== currentVideoId && !sameModelIds.has(v.id))
      .slice(0, 6)
      .map((v: any) => ({
        id: v.id,
        title: v.title,
        thumbnail_url: v.thumbnail_url,
        duration_seconds: v.duration_seconds,
        model_id: v.model_id,
      }));
  }, [recommendations, currentVideoId, sameModelVideos]);

  useEffect(() => {
    if (!user) return;
    const fetchRecs = async () => {
      setLoading(true);

      // Fetch same-model videos (excluding current)
      let sameModel: RecommendedVideo[] = [];
      if (modelId) {
        const { data } = await supabase
          .from("imported_videos")
          .select("id, title, thumbnail_url, duration_seconds, model_id")
          .eq("user_id", user.id)
          .eq("model_id", modelId)
          .neq("id", currentVideoId)
          .eq("is_active", true)
          .order("imported_at", { ascending: false })
          .limit(6);
        if (data) {
          sameModel = data.map(v => ({ ...v, modelName }));
        }
      }

      setSameModelVideos(sameModel);
      setLoading(false);

      // Auto-play first recommendation after 10s
      const firstRec = sameModel[0] || (otherVideos.length > 0 ? otherVideos[0] : null);
      if (firstRec) {
        setNextVideoId(firstRec.id);
        setCountdown(10);
      }
    };
    fetchRecs();
  }, [user, currentVideoId, modelId, modelName]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1 && nextVideoId) {
        onPlayVideo(nextVideoId);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, nextVideoId, onPlayVideo]);

  const cancelCountdown = () => {
    setCountdown(null);
    setNextVideoId(null);
  };

  const allDisplayVideos = [...sameModelVideos, ...otherVideos];

  if (loading) {
    return (
      <div className="absolute inset-0 bg-black/90 z-40 flex items-center justify-center animate-fade-in">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black/90 z-40 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in overflow-y-auto">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-50"
        >
          <X size={24} />
        </button>
      )}

      {/* Replay + Countdown */}
      <div className="flex items-center gap-6 mb-6 md:mb-8">
        <button
          onClick={onReplay}
          className="flex flex-col items-center gap-2 text-white/70 hover:text-white transition-colors group"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border-2 border-white/30 group-hover:border-primary flex items-center justify-center transition-colors">
            <RotateCcw size={28} className="group-hover:text-primary" />
          </div>
          <span className="text-xs md:text-sm font-medium">Revoir</span>
        </button>

        {countdown !== null && nextVideoId && (
          <div className="flex flex-col items-center gap-2">
            <div className="relative w-16 h-16 md:w-20 md:h-20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (1 - countdown / 10)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000 linear"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-white text-lg md:text-xl font-bold">
                {countdown}
              </span>
            </div>
            <button
              onClick={cancelCountdown}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {/* Same model section */}
      {sameModelVideos.length > 0 && (
        <div className="w-full max-w-4xl mb-6">
          <h3 className="text-sm md:text-base font-semibold text-white/80 mb-3 flex items-center gap-2">
            {modelName && (
              <img
                src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(modelName)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
                alt={modelName}
                className="w-5 h-5 rounded-full"
              />
            )}
            Plus de {modelName || "ce modèle"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
            {sameModelVideos.map((v) => (
              <VideoRecCard
                key={v.id}
                video={v}
                isNext={v.id === nextVideoId}
                onClick={() => { cancelCountdown(); onPlayVideo(v.id); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other recommendations */}
      {otherVideos.length > 0 && (
        <div className="w-full max-w-4xl">
          <h3 className="text-sm md:text-base font-semibold text-white/80 mb-3">
            Autres recommandations
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
            {otherVideos.map((v) => (
              <VideoRecCard
                key={v.id}
                video={v}
                isNext={v.id === nextVideoId}
                onClick={() => { cancelCountdown(); onPlayVideo(v.id); }}
              />
            ))}
          </div>
        </div>
      )}

      {allDisplayVideos.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune recommandation disponible.</p>
      )}
    </div>
  );
};

const VideoRecCard = ({
  video,
  isNext,
  onClick,
}: {
  video: RecommendedVideo;
  isNext: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "group relative rounded-lg overflow-hidden text-left transition-all hover:scale-[1.03] hover:ring-2 hover:ring-primary/60",
      isNext && "ring-2 ring-primary"
    )}
  >
    <div className="aspect-video bg-muted relative">
      {video.thumbnail_url ? (
        <img
          src={video.thumbnail_url}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <Play size={24} className="text-muted-foreground" />
        </div>
      )}
      {/* Duration badge */}
      {video.duration_seconds && (
        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
          {formatDuration(video.duration_seconds)}
        </span>
      )}
      {/* Play overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <Play
          size={32}
          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
          fill="currentColor"
        />
      </div>
      {isNext && (
        <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded">
          SUIVANT
        </span>
      )}
    </div>
    <div className="p-1.5 md:p-2 bg-card/80">
      <p className="text-[11px] md:text-xs text-foreground font-medium truncate">{video.title.replace(/\.[^/.]+$/, "")}</p>
      {video.modelName && (
        <p className="text-[10px] text-muted-foreground truncate">{video.modelName}</p>
      )}
    </div>
  </button>
);

export default EndScreenRecommendations;
