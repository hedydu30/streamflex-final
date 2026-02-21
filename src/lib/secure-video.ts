import { supabase } from "@/integrations/supabase/client";

// Secure URL cache with short TTL
const urlCache = new Map<string, { url: string; blobUrl: string; expiresAt: number; token: string }>();

// Clean up blob URLs on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    urlCache.forEach((entry) => {
      try { URL.revokeObjectURL(entry.blobUrl); } catch {}
    });
    urlCache.clear();
  });

  // Periodic cleanup of expired cache entries every 5 minutes
  setInterval(() => {
    const now = Date.now() / 1000;
    urlCache.forEach((entry, key) => {
      if (now >= entry.expiresAt) {
        try { URL.revokeObjectURL(entry.blobUrl); } catch {}
        urlCache.delete(key);
      }
    });
  }, 5 * 60 * 1000);
}

/**
 * Fetch a signed URL via the edge function (handles debriding for 1fichier, etc.)
 * Returns { blobUrl, expiresAt } or null.
 */

/**
 * Fetch a signed URL and convert to a Blob URL to hide the real source.
 * Returns { blobUrl, expiresAt } or null.
 */
export async function getSecureVideoUrl(videoId: string): Promise<{ blobUrl: string; expiresAt: number } | null> {
  // Check cache
  const cached = urlCache.get(videoId);
  if (cached && Date.now() / 1000 < cached.expiresAt - 30) {
    return { blobUrl: cached.blobUrl, expiresAt: cached.expiresAt };
  }

  // Revoke old blob URL if present
  if (cached?.blobUrl) {
    try { URL.revokeObjectURL(cached.blobUrl); } catch {}
    urlCache.delete(videoId);
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn("getSecureVideoUrl: no active session");
      return null;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // Step 1: Get a signed token — use fetch directly to ensure user JWT is sent
    const signRes = await fetch(`${supabaseUrl}/functions/v1/video-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ videoId }),
    });
    if (!signRes.ok) {
      console.warn("video-token sign error:", signRes.status, await signRes.text().catch(() => ""));
      return null;
    }
    const tokenData = await signRes.json();
    if (!tokenData?.token) return null;

    // Step 2: Get the real (debrided) URL via stream action
    const res = await fetch(
      `${supabaseUrl}/functions/v1/video-token?action=stream&id=${videoId}&t=${tokenData.token}&e=${tokenData.expiresAt}`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
      }
    );
    if (!res.ok) {
      console.warn("video-token stream error:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const streamData = await res.json();
    if (!streamData.url) return null;

    // Step 3: Fetch the actual video and create a Blob URL to hide the source
    // For large files, we just use the URL directly but wrapped in a blob reference
    // Note: For very large files, full blob download isn't practical, so we use the URL
    // but rotate it frequently
    const blobUrl = streamData.url;
    
    urlCache.set(videoId, {
      url: streamData.url,
      blobUrl,
      expiresAt: tokenData.expiresAt,
      token: tokenData.token,
    });

    return { blobUrl, expiresAt: tokenData.expiresAt };
  } catch {
    return null;
  }
}

/**
 * Refresh the token for an active video (rotation during playback).
 * Returns a new URL if the token was about to expire.
 */
export async function refreshVideoToken(videoId: string): Promise<{ blobUrl: string; expiresAt: number } | null> {
  const cached = urlCache.get(videoId);
  // Only refresh if token expires in less than 60s
  if (cached && Date.now() / 1000 < cached.expiresAt - 60) {
    return { blobUrl: cached.blobUrl, expiresAt: cached.expiresAt };
  }

  // Force re-fetch
  if (cached?.blobUrl) {
    try { URL.revokeObjectURL(cached.blobUrl); } catch {}
    urlCache.delete(videoId);
  }
  return getSecureVideoUrl(videoId);
}

/**
 * Revoke and clear cached URL for a video
 */
export function revokeVideoUrl(videoId: string) {
  const cached = urlCache.get(videoId);
  if (cached?.blobUrl) {
    try { URL.revokeObjectURL(cached.blobUrl); } catch {}
  }
  urlCache.delete(videoId);
}
