import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Démarrage de la sauvegarde de la base de données...");

    // 1. Récupération des données vitales (Modèles et Vidéos)
    const { data: models, error: errModels } = await supabase.from("models").select("*");
    if (errModels) throw errModels;

    const { data: videos, error: errVideos } = await supabase.from("imported_videos").select("*");
    if (errVideos) throw errVideos;

    // 2. Formatage sécurisé de la sauvegarde (JSON)
    const backupData = JSON.stringify({
      backup_date: new Date().toISOString(),
      total_models: models?.length || 0,
      total_videos: videos?.length || 0,
      data: {
        models: models || [],
        imported_videos: videos || [],
      }
    });

    // 3. Récupération des secrets Cloudflare
    const r2AccountId = Deno.env.get("R2_ACCOUNT_ID"); 
    const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2Bucket = Deno.env.get("R2_BUCKET_NAME");

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      throw new Error("Il manque les secrets R2_... dans les paramètres de Supabase !");
    }

    const aws = new AwsClient({
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
      service: "s3",
      region: "auto",
    });

    // Génère un nom de fichier par jour (ex: backup_2026-02-23.json)
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `backup_${dateStr}.json`;
    const endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com/${r2Bucket}/${fileName}`;

    console.log(`Envoi du fichier ${fileName} vers Cloudflare R2...`);

    // 4. Envoi (Upload) vers Cloudflare
    const response = await aws.fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: backupData
    });

    if (!response.ok) {
      throw new Error(`Échec de l'envoi Cloudflare: ${response.status} ${response.statusText}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Sauvegarde R2 réussie !", 
      file: fileName 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Erreur fatale Backup:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});