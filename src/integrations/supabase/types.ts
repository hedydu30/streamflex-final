export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          resource_id: string | null
          resource_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_notes: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          note: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          note: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          id: string
          updated_at: string
          updated_by: string
          value: string
        }
        Insert: {
          id: string
          updated_at?: string
          updated_by: string
          value: string
        }
        Update: {
          id?: string
          updated_at?: string
          updated_by?: string
          value?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_by: string
          created_at: string
          id: string
          ip_address: string
          reason: string | null
        }
        Insert: {
          blocked_by: string
          created_at?: string
          id?: string
          ip_address: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string
          created_at?: string
          id?: string
          ip_address?: string
          reason?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_visible: boolean
          name: string
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "imported_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      content_views: {
        Row: {
          completed: boolean
          content_id: string
          device_info: string | null
          duration_seconds: number | null
          id: string
          position_seconds: number
          retention_ttl: unknown
          session_id: string | null
          user_id: string
          watched_at: string
          watched_percent: number | null
        }
        Insert: {
          completed?: boolean
          content_id: string
          device_info?: string | null
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          retention_ttl?: unknown
          session_id?: string | null
          user_id: string
          watched_at?: string
          watched_percent?: number | null
        }
        Update: {
          completed?: boolean
          content_id?: string
          device_info?: string | null
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          retention_ttl?: unknown
          session_id?: string | null
          user_id?: string
          watched_at?: string
          watched_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_views_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_views_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          genre: string[] | null
          id: string
          is_active: boolean
          rating: string | null
          release_year: number | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          genre?: string[] | null
          id?: string
          is_active?: boolean
          rating?: string | null
          release_year?: number | null
          thumbnail_url?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          genre?: string[] | null
          id?: string
          is_active?: boolean
          rating?: string | null
          release_year?: number | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      duration_scan_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_video_id: string | null
          error: string | null
          errors_count: number
          found_count: number
          id: string
          scanned_count: number
          status: string
          total_videos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_video_id?: string | null
          error?: string | null
          errors_count?: number
          found_count?: number
          id?: string
          scanned_count?: number
          status?: string
          total_videos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_video_id?: string | null
          error?: string | null
          errors_count?: number
          found_count?: number
          id?: string
          scanned_count?: number
          status?: string
          total_videos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          movie_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movie_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movie_id?: number
          user_id?: string
        }
        Relationships: []
      }
      fichier_tokens: {
        Row: {
          account_info: Json | null
          created_at: string
          id: string
          is_valid: boolean | null
          label: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_info?: Json | null
          created_at?: string
          id?: string
          is_valid?: boolean | null
          label?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_info?: Json | null
          created_at?: string
          id?: string
          is_valid?: boolean | null
          label?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_offset: number
          discovery_queue: Json | null
          discovery_status: string | null
          dupes_count: number
          error: string | null
          errors_count: number
          fichier_folder_id: number | null
          fichier_token: string | null
          files_data: Json
          folder_name: string
          id: string
          imported_count: number
          model_id: string | null
          model_name: string | null
          processed_files: number
          source: string
          status: string
          total_files: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_offset?: number
          discovery_queue?: Json | null
          discovery_status?: string | null
          dupes_count?: number
          error?: string | null
          errors_count?: number
          fichier_folder_id?: number | null
          fichier_token?: string | null
          files_data?: Json
          folder_name: string
          id?: string
          imported_count?: number
          model_id?: string | null
          model_name?: string | null
          processed_files?: number
          source?: string
          status?: string
          total_files?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_offset?: number
          discovery_queue?: Json | null
          discovery_status?: string | null
          dupes_count?: number
          error?: string | null
          errors_count?: number
          fichier_folder_id?: number | null
          fichier_token?: string | null
          files_data?: Json
          folder_name?: string
          id?: string
          imported_count?: number
          model_id?: string | null
          model_name?: string | null
          processed_files?: number
          source?: string
          status?: string
          total_files?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_videos: {
        Row: {
          allow_comments: boolean
          allow_ratings: boolean
          average_rating: number | null
          category_id: string | null
          download_url: string | null
          duration_seconds: number | null
          external_id: string | null
          file_size: number | null
          format: string | null
          full_description: string | null
          id: string
          imported_at: string
          is_active: boolean
          last_accessed_at: string | null
          metadata: Json | null
          mirror_url: string | null
          model_id: string | null
          original_url: string
          short_description: string | null
          source: string
          status: string
          thumbnail_hover_url: string | null
          thumbnail_url: string | null
          title: string
          url_1080p: string | null
          url_480p: string | null
          url_720p: string | null
          user_id: string
          video_type: string
          view_count: number
        }
        Insert: {
          allow_comments?: boolean
          allow_ratings?: boolean
          average_rating?: number | null
          category_id?: string | null
          download_url?: string | null
          duration_seconds?: number | null
          external_id?: string | null
          file_size?: number | null
          format?: string | null
          full_description?: string | null
          id?: string
          imported_at?: string
          is_active?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          mirror_url?: string | null
          model_id?: string | null
          original_url: string
          short_description?: string | null
          source: string
          status?: string
          thumbnail_hover_url?: string | null
          thumbnail_url?: string | null
          title: string
          url_1080p?: string | null
          url_480p?: string | null
          url_720p?: string | null
          user_id: string
          video_type?: string
          view_count?: number
        }
        Update: {
          allow_comments?: boolean
          allow_ratings?: boolean
          average_rating?: number | null
          category_id?: string | null
          download_url?: string | null
          duration_seconds?: number | null
          external_id?: string | null
          file_size?: number | null
          format?: string | null
          full_description?: string | null
          id?: string
          imported_at?: string
          is_active?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          mirror_url?: string | null
          model_id?: string | null
          original_url?: string
          short_description?: string | null
          source?: string
          status?: string
          thumbnail_hover_url?: string | null
          thumbnail_url?: string | null
          title?: string
          url_1080p?: string | null
          url_480p?: string | null
          url_720p?: string | null
          user_id?: string
          video_type?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "imported_videos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_videos_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          body: string
          created_at: string
          from_admin: string
          id: string
          read_at: string | null
          subject: string
          to_user_id: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          from_admin: string
          id?: string
          read_at?: string | null
          subject?: string
          to_user_id: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string
          from_admin?: string
          id?: string
          read_at?: string | null
          subject?: string
          to_user_id?: string
          type?: string
        }
        Relationships: []
      }
      login_logs: {
        Row: {
          created_at: string
          email: string | null
          failure_reason: string | null
          id: string
          ip_hashed: string | null
          retention_ttl: unknown
          source: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_hashed?: string | null
          retention_ttl?: unknown
          source?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_hashed?: string | null
          retention_ttl?: unknown
          source?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      model_favorites: {
        Row: {
          created_at: string
          id: string
          model_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_favorites_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      models: {
        Row: {
          bio: string | null
          coomer_id: string | null
          coomer_service: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          last_imported_at: string | null
          name: string
          profile_image_url: string | null
          source_platform: string | null
          updated_at: string
          user_id: string
          video_count: number | null
        }
        Insert: {
          bio?: string | null
          coomer_id?: string | null
          coomer_service?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          last_imported_at?: string | null
          name: string
          profile_image_url?: string | null
          source_platform?: string | null
          updated_at?: string
          user_id: string
          video_count?: number | null
        }
        Update: {
          bio?: string | null
          coomer_id?: string | null
          coomer_service?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          last_imported_at?: string | null
          name?: string
          profile_image_url?: string | null
          source_platform?: string | null
          updated_at?: string
          user_id?: string
          video_count?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      premium_keys: {
        Row: {
          created_at: string
          created_by: string
          duration_days: number | null
          duration_label: string
          expires_at: string | null
          id: string
          is_used: boolean
          key_code: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_days?: number | null
          duration_label: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          key_code: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_days?: number | null
          duration_label?: string
          expires_at?: string | null
          id?: string
          is_used?: boolean
          key_code?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_color: string | null
          admin_labels: string[] | null
          autoplay_enabled: boolean | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          favorite_genres: string[] | null
          id: string
          is_premium: boolean
          language: string | null
          notes_count: number | null
          preferred_rating: string | null
          premium_until: string | null
          risk_score: number | null
          selected_theme_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_color?: string | null
          admin_labels?: string[] | null
          autoplay_enabled?: boolean | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id?: string
          is_premium?: boolean
          language?: string | null
          notes_count?: number | null
          preferred_rating?: string | null
          premium_until?: string | null
          risk_score?: number | null
          selected_theme_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_color?: string | null
          admin_labels?: string[] | null
          autoplay_enabled?: boolean | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          favorite_genres?: string[] | null
          id?: string
          is_premium?: boolean
          language?: string | null
          notes_count?: number | null
          preferred_rating?: string | null
          premium_until?: string | null
          risk_score?: number | null
          selected_theme_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_selected_theme_id_fkey"
            columns: ["selected_theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          device_info: string | null
          ended_at: string | null
          id: string
          ip_hashed: string | null
          is_active: boolean
          last_active_at: string
          retention_ttl: unknown
          source: string
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_info?: string | null
          ended_at?: string | null
          id?: string
          ip_hashed?: string | null
          is_active?: boolean
          last_active_at?: string
          retention_ttl?: unknown
          source?: string
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_info?: string | null
          ended_at?: string | null
          id?: string
          ip_hashed?: string | null
          is_active?: boolean
          last_active_at?: string
          retention_ttl?: unknown
          source?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
      themes: {
        Row: {
          colors: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          colors?: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          colors?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sanctions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          issued_by: string
          metadata: Json | null
          reason: string
          sanction_type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_by: string
          metadata?: Json | null
          reason: string
          sanction_type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          issued_by?: string
          metadata?: Json | null
          reason?: string
          sanction_type?: Database["public"]["Enums"]["sanction_type"]
          user_id?: string
        }
        Relationships: []
      }
      video_favorites: {
        Row: {
          created_at: string
          id: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      video_progress: {
        Row: {
          completed: boolean
          duration_seconds: number | null
          id: string
          position_seconds: number
          updated_at: string
          user_id: string
          video_id: string
          watched_percent: number | null
        }
        Insert: {
          completed?: boolean
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          updated_at?: string
          user_id: string
          video_id: string
          watched_percent?: number | null
        }
        Update: {
          completed?: boolean
          duration_seconds?: number | null
          id?: string
          position_seconds?: number
          updated_at?: string
          user_id?: string
          video_id?: string
          watched_percent?: number | null
        }
        Relationships: []
      }
      video_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_ratings_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "imported_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tags: {
        Row: {
          id: string
          tag_id: string
          video_id: string
        }
        Insert: {
          id?: string
          tag_id: string
          video_id: string
        }
        Update: {
          id?: string
          tag_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "imported_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_popular_contents: {
        Row: {
          avg_watched_percent: number | null
          content_id: string | null
          last_watched_at: string | null
          title: string | null
          total_views: number | null
          type: string | null
          unique_viewers: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_views_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_trending_weekly: {
        Row: {
          last_played: string | null
          play_count: number | null
          trend_score: number | null
          unique_viewers: number | null
          video_id: string | null
        }
        Relationships: []
      }
      vw_trending_weekly: {
        Row: {
          last_played: string | null
          play_count: number | null
          trend_score: number | null
          unique_viewers: number | null
          video_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_premium_key: { Args: { p_key_code: string }; Returns: Json }
      get_popular_contents: {
        Args: never
        Returns: {
          avg_watched_percent: number
          content_id: string
          last_watched_at: string
          title: string
          total_views: number
          type: string
          unique_viewers: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      lift_sanction: {
        Args: { p_admin_id: string; p_sanction_id: string }
        Returns: undefined
      }
      purge_expired_data: { Args: never; Returns: Json }
      refresh_trending: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      sanction_type:
        | "warning"
        | "temp_ban"
        | "permanent_ban"
        | "ip_block"
        | "device_block"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      sanction_type: [
        "warning",
        "temp_ban",
        "permanent_ban",
        "ip_block",
        "device_block",
      ],
    },
  },
} as const
