import { useEffect, useState, useCallback } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import VideoPlayer from "@/components/VideoPlayer";
import VideoCardPreview from "@/components/VideoCardPreview";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useVideoFavorites } from "@/hooks/useVideoFavorites";
import { useVideoProgress } from "@/hooks/useVideoProgress";
import {
  ArrowLeft, Heart, ExternalLink, Film, HardDrive, Clock,
  Calendar, Link2, Tag, Server, FileVideo, Info, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatDuration(s: number | null): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} Mo`;
  return `${(bytes / 1024).toFixed(0)} Ko`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const VideoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useVideoFavorites();
  const { getProgress } = useVideoProgress();

  const [video, setVideo] = useState<any>(null);
  const [model, setModel] = useState<any>(null);
  const [signedSrc, setSignedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!id) { setLoading(false); return; }

    const fetchVideo = async () => {
      setLoading(true);
      
      let query = supabase
        .from("imported_videos")
        .select("*")
        .eq("id", id);
      
      if (user) {
        query = query.eq("user_id", user.id);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error || !data) { setVideo(null); setLoading(false); return; }
      setVideo(data);

      // Fetch model if linked
      if (data.model_id) {
        const { data: m } = await supabase.from("models").select("*").eq("id", data.model_id).maybeSingle();
        if (m) setModel(m);
      }

      // Only fetch signed URL if logged in
      if (!user) { setLoading(false); return; }

      try {
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke("video-token", {
          body: { videoId: id },
        });
        if (!tokenError && tokenData?.token) {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const session = (await supabase.auth.getSession()).data.session;
          if (session) {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/video-token?action=stream&id=${id}&t=${tokenData.token}&e=${tokenData.expiresAt}`,
              { headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey } }
            );
            const streamData = await res.json();
            if (streamData.url) setSignedSrc(streamData.url);
          }
        }
      } catch { /* silent */ }

      setLoading(false);
    };

    fetchVideo();
  }, [user, id]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't redirect non-logged-in users - let them see video details

  if (!video) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar onSearch={() => {}} />
        <div className="flex flex-col items-center justify-center pt-32 gap-4">
          <p className="text-muted-foreground">Vidéo introuvable</p>
          <Button variant="outline" onClick={() => navigate("/videos")}>
            <ArrowLeft size={16} className="mr-2" /> Retour aux vidéos
          </Button>
        </div>
      </div>
    );
  }

  const liked = isFavorite(video.id);
  const progress = getProgress(video.id);
  const metadata = video.metadata || {};

  // Extract all metadata keys for display
  const metaEntries = Object.entries(metadata).filter(
    ([k]) => !["source", "original_url", "model_name"].includes(k)
  );

  const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Icon size={16} className="text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-muted-foreground text-sm w-28 shrink-0">{label}</span>
      <span className="text-foreground text-sm break-all">{value || "—"}</span>
    </div>
  );

  if (playing && signedSrc) {
    return (
      <div className="min-h-screen bg-black">
        <button
          onClick={() => setPlaying(false)}
          className="fixed top-4 left-4 z-50 flex items-center gap-2 text-foreground/70 hover:text-foreground transition-colors bg-black/50 rounded-full px-3 py-2"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Retour</span>
        </button>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-full max-w-6xl">
            <VideoPlayer
              key={video.id}
              videoId={video.id}
              src={signedSrc}
              title={video.title}
              autoPlay={true}
              onClose={() => setPlaying(false)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar onSearch={() => {}} />
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-5xl">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/videos")} className="gap-1.5">
            <ArrowLeft size={16} /> Retour
          </Button>
        </div>

        {/* Hero: Thumbnail + Play */}
        <div className="relative rounded-xl overflow-hidden bg-muted aspect-video mb-8 group cursor-pointer"
          onClick={() => {
            if (!user) { navigate("/auth"); return; }
            if (signedSrc) setPlaying(true);
          }}>
          {video.thumbnail_url ? (
            <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-muted flex items-center justify-center">
              <Film size={64} className="text-muted-foreground/40" />
            </div>
          )}

          {/* Auto-play preview without hover */}
          <VideoCardPreview videoId={video.id} isHovered={false} autoPlay={!playing} />

          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30">
            <div className="w-20 h-20 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl">
              <Play size={36} fill="currentColor" className="text-primary-foreground ml-1" />
            </div>
            {!user && (
              <p className="text-white text-sm mt-3 font-medium">Connectez-vous pour regarder</p>
            )}
          </div>
          {progress && progress.watched_percent > 0 && progress.watched_percent < 95 && (
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-muted-foreground/30 z-30">
              <div className="h-full bg-primary" style={{ width: `${progress.watched_percent}%` }} />
            </div>
          )}
        </div>

        {/* Title + Actions */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground break-words">{video.title}</h1>
            {model && (
              <button
                onClick={() => navigate(`/models`)}
                className="text-primary hover:underline text-sm mt-1 flex items-center gap-1"
              >
                <Tag size={12} /> {model.name}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <Button
                  variant={liked ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleFavorite(video.id)}
                  className="gap-1.5"
                >
                  <Heart size={14} fill={liked ? "currentColor" : "none"} />
                  {liked ? "Favori" : "Ajouter aux favoris"}
                </Button>
                {signedSrc && (
                  <Button size="sm" onClick={() => setPlaying(true)} className="gap-1.5">
                    <Play size={14} /> Lire
                  </Button>
                )}
              </>
            ) : (
              <Button size="sm" onClick={() => navigate("/auth")} className="gap-1.5">
                <Play size={14} /> Se connecter pour regarder
              </Button>
            )}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Video Info */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-foreground font-semibold mb-4 flex items-center gap-2">
              <Info size={16} className="text-primary" /> Informations
            </h2>
            <div className="space-y-0">
              <InfoRow icon={Film} label="Titre" value={video.title} />
              <InfoRow icon={Clock} label="Durée" value={formatDuration(video.duration_seconds)} />
              <InfoRow icon={HardDrive} label="Taille" value={formatFileSize(video.file_size)} />
              <InfoRow icon={FileVideo} label="Format" value={video.format?.toUpperCase()} />
              <InfoRow icon={Server} label="Source" value={video.source} />
              <InfoRow icon={Calendar} label="Importé le" value={formatDate(video.imported_at)} />
              {model && <InfoRow icon={Tag} label="Modèle" value={model.name} />}
              {progress && progress.watched_percent > 0 && (
                <InfoRow icon={Play} label="Progression" value={`${progress.watched_percent}% — ${formatDuration(progress.position_seconds)}`} />
              )}
            </div>
          </div>

          {/* Sources & Metadata */}
          <div className="space-y-6">
            {/* URLs */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                <Link2 size={16} className="text-primary" /> Sources
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">URL originale</p>
                  <a
                    href={video.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline break-all flex items-start gap-1"
                  >
                    <ExternalLink size={12} className="mt-0.5 shrink-0" />
                    {video.original_url}
                  </a>
                </div>
                {video.download_url && video.download_url !== video.original_url && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">URL de téléchargement</p>
                    <a
                      href={video.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline break-all flex items-start gap-1"
                    >
                      <ExternalLink size={12} className="mt-0.5 shrink-0" />
                      {video.download_url}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Raw Metadata */}
            {metaEntries.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-foreground font-semibold mb-4 flex items-center gap-2">
                  <Tag size={16} className="text-primary" /> Métadonnées
                </h2>
                <div className="space-y-2">
                  {metaEntries.map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground font-mono text-xs bg-muted px-1.5 py-0.5 rounded shrink-0">{key}</span>
                      <span className="text-foreground break-all">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VideoDetail;
