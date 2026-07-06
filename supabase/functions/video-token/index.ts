import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-stream-key",
};

const ALLDEBRID_API = "https://api.alldebrid.com/v4";

// Token validity: 5 minutes (short-lived to limit sharing)
const TOKEN_TTL_SECONDS = 5 * 60;

async function generateToken(videoId: string, userId: string, expiresAt: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(`${videoId}:${userId}:${expiresAt}`);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const arr = new Uint8Array(sig);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(videoId: string, userId: string, expiresAt: number, token: string, secret: string): Promise<boolean> {
  const expected = await generateToken(videoId, userId, expiresAt, secret);
  return expected === token;
}

// Debrid a link using AllDebrid API
async function debridLink(link: string, alldebridToken: string): Promise<{ url?: string; error?: string }> {
  try {
    console.log("Debriding link via AllDebrid:", link);
    const params = new URLSearchParams({
      agent: "StreamApp",
      apikey: alldebridToken,
      link: link,
    });
    const response = await fetch(`${ALLDEBRID_API}/link/unlock?${params.toString()}`);
    const data = await response.json();
    console.log("AllDebrid response status:", data.status);
    if (data.status === "success" && data.data?.link) {
      return { url: data.data.link };
    }
    
    const errorCode = data.error?.code || "UNKNOWN";
    const errorMsg = data.error?.message || "Erreur AllDebrid inconnue";
    console.error("AllDebrid error:", JSON.stringify(data));
    
    if (errorCode === "AUTH_BLOCKED") {
      return { error: `AUTH_BLOCKED: AllDebrid demande une autorisation depuis cette IP.` };
    }
    
    return { error: `AllDebrid: ${errorCode} - ${errorMsg}` };
  } catch (err) {
    console.error("Error calling AllDebrid API:", err);
    return { error: "Erreur de connexion à AllDebrid" };
  }
}

// Fallback: try 1fichier direct API (rate-limited)
let lastOneFichierCall = 0;
const ONE_FICHIER_MIN_INTERVAL_MS = 5000;

async function fallbackOneFichier(url: string): Promise<{ url?: string; error?: string }> {
  const now = Date.now();
  if (now - lastOneFichierCall < ONE_FICHIER_MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, ONE_FICHIER_MIN_INTERVAL_MS - (now - lastOneFichierCall)));
  }
  lastOneFichierCall = Date.now();

  try {
    const token = Deno.env.get("ONE_FICHIER_TOKEN");
    if (!token) {
      return { error: "Token 1fichier non configuré dans les secrets Deno" };
    }

    const response = await fetch("https://api.1fichier.com/v1/download/get_token.cgi", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, pretty: 1 }),
    });
    const data = await response.json();

    if (data.url) {
      return { url: data.url };
    }
    return { error: `1fichier: ${data.message || "Erreur inconnue"}` };
  } catch (err) {
    console.error("1fichier fallback error:", err);
    return { error: "Erreur de connexion à 1fichier" };
  }
}

function needsDebriding(url: string, source: string): boolean {
  return source === "1fichier" || url.includes("1fichier");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const signingSecret = supabaseServiceKey.slice(0, 32);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode JWT manually to extract user ID (signing-keys compatible)
    const token_jwt = authHeader.replace("Bearer ", "");
    let user: { id: string };
    try {
      const payloadB64 = token_jwt.split(".")[1];
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
      if (!payload.sub) throw new Error("Missing sub claim");
      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error("Token expired");
      }
      user = { id: payload.sub };
    } catch (e) {
      console.error("JWT decode error:", e);
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "POST" ? "sign" : null);

    if (action === "sign") {
      const { videoId } = await req.json();
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: video, error: videoError } = await adminClient
        .from("imported_videos")
        .select("id, download_url, original_url")
        .eq("id", videoId)
        .eq("user_id", user.id)
        .single();

      if (videoError || !video) {
        return new Response(JSON.stringify({ error: "Vidéo introuvable" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Short-lived token (5 minutes)
      const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
      const token = await generateToken(videoId, user.id, expiresAt, signingSecret);

      return new Response(JSON.stringify({ token, expiresAt, videoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "stream") {
      const videoId = url.searchParams.get("id");
      const token = url.searchParams.get("t");
      const expires = url.searchParams.get("e");

      if (!videoId || !token || !expires) {
        return new Response(JSON.stringify({ error: "Paramètres manquants" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expiresAt = parseInt(expires);
      if (Date.now() / 1000 > expiresAt) {
        return new Response(JSON.stringify({ error: "Lien expiré" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const valid = await verifyToken(videoId, user.id, expiresAt, token, signingSecret);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Token invalide" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: video } = await adminClient
        .from("imported_videos")
        .select("download_url, original_url, source")
        .eq("id", videoId)
        .eq("user_id", user.id)
        .single();

      if (!video) {
        return new Response(JSON.stringify({ error: "Vidéo introuvable" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let videoUrl = video.download_url || video.original_url;

      if (videoUrl && needsDebriding(videoUrl, video.source || "")) {
        const { data: setting } = await adminClient
          .from("admin_settings")
          .select("value")
          .eq("id", "alldebrid_token")
          .maybeSingle(); // CORRECTION: maybeSingle empêche de crasher si le token n'existe pas

        const linkToDebrid = video.original_url || videoUrl;
        let result: { url?: string; error?: string } = {};

        if (setting?.value) {
          result = await debridLink(linkToDebrid, setting.value);
        } else {
          result = { error: "Token AllDebrid non configuré." };
        }

        // Si AllDebrid échoue ou n'est pas configuré, on utilise le fallback 1fichier
        if (result.error) {
          const fallbackResult = await fallbackOneFichier(linkToDebrid);
          if (fallbackResult.url) {
            result = fallbackResult;
          } else {
            return new Response(JSON.stringify({ error: `AllDebrid: ${result.error} | 1fichier: ${fallbackResult.error}` }), {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        videoUrl = result.url!;

        await adminClient
          .from("imported_videos")
          .update({ download_url: result.url })
          .eq("id", videoId)
          .eq("user_id", user.id);
      }

      // Return URL with short cache headers to discourage caching
      return new Response(JSON.stringify({ url: videoUrl, expiresAt }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "Pragma": "no-cache",
        },
      });
    }

    if (action === "refresh") {
      const { videoId } = await req.json();
      if (!videoId) {
        return new Response(JSON.stringify({ error: "videoId requis" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
      const token = await generateToken(videoId, user.id, expiresAt, signingSecret);

      return new Response(JSON.stringify({ token, expiresAt, videoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Action invalide" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("video-token error:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
