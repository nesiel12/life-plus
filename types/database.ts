// Hand-written to match supabase/migrations/20260720000000_init.sql.
// Once a live Supabase project exists, regenerate with:
//   npx supabase gen types typescript --linked > types/database.ts
// and reconcile any drift — this file should not be hand-edited after that.

// Postgres jsonb. Structured shapes live in types/index.ts
// (ChronotypeSettings, LifeAreaKey[]); this is the transport type.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type LifeAreaKeyDb = "faith" | "family" | "knowledge" | "health" | "career";
export type MomentCategoryDb = LifeAreaKeyDb | "general";
export type ChatRoleDb = "user" | "assistant" | "system";
export type RecommendationStatusDb = "pending" | "accepted" | "rejected" | "modified" | "expired";
export type TaskStatusDb = "todo" | "in-progress" | "done";
export type TransactionTypeDb = "income" | "expense";
export type LearningTopicStatusDb = "planning" | "active" | "completed";
export type LearningResourceTypeDb = "youtube" | "podcast" | "article" | "equipment" | "summary";
export type MealTypeDb = "breakfast" | "lunch" | "dinner" | "snack" | "post-workout";
export type JobRunStatusDb = "running" | "succeeded" | "failed" | "skipped";
export type NotificationStatusDb =
  | "pending"
  | "sent"
  | "read"
  | "acted"
  | "dismissed"
  | "expired";

// The Supabase client's generics require every table to carry a
// `Relationships` array (foreign-key metadata used for `.select()` joins).
// We don't use that feature, but the shape still has to be present for the
// client's internal type resolution to work at all — see the empty array
// baked into this alias instead of repeating it on every table below.
interface TableDef<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      users: TableDef<
        {
          id: string;
          email: string;
          name: string;
          hebrew_name: string | null;
          life_stage: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          email: string;
          name: string;
          hebrew_name?: string | null;
          life_stage?: string | null;
        },
        {
          id?: string;
          email?: string;
          name?: string;
          hebrew_name?: string | null;
          life_stage?: string | null;
        }
      >;
      life_area_scores: TableDef<
        {
          user_id: string;
          area_key: LifeAreaKeyDb;
          score: number;
          last_touched: string | null;
          updated_at: string;
        },
        {
          user_id: string;
          area_key: LifeAreaKeyDb;
          score?: number;
          last_touched?: string | null;
        },
        {
          user_id?: string;
          area_key?: LifeAreaKeyDb;
          score?: number;
          last_touched?: string | null;
        }
      >;
      people: TableDef<
        {
          id: string;
          user_id: string;
          name: string;
          hebrew_name: string | null;
          relation: string;
          last_meaningful_interaction: string | null;
          birthday: string | null;
          anniversary: string | null;
          note: string | null;
          phone: string | null;
          avatar_url: string | null;
          gender: string | null;
          role: string | null;
          message_template: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          hebrew_name?: string | null;
          relation: string;
          last_meaningful_interaction?: string | null;
          birthday?: string | null;
          anniversary?: string | null;
          note?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          gender?: string | null;
          role?: string | null;
          message_template?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          name?: string;
          hebrew_name?: string | null;
          relation?: string;
          last_meaningful_interaction?: string | null;
          birthday?: string | null;
          anniversary?: string | null;
          note?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          gender?: string | null;
          role?: string | null;
          message_template?: string | null;
        }
      >;
      moments: TableDef<
        {
          id: string;
          user_id: string;
          category: MomentCategoryDb;
          title: string;
          content: string;
          occurred_at: string;
          person_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          category: MomentCategoryDb;
          title: string;
          content: string;
          occurred_at?: string;
          person_id?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          category?: MomentCategoryDb;
          title?: string;
          content?: string;
          occurred_at?: string;
          person_id?: string | null;
        }
      >;
      upcoming_events: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          category: MomentCategoryDb;
          event_date: string;
          google_event_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          category: MomentCategoryDb;
          event_date: string;
          google_event_id?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          category?: MomentCategoryDb;
          event_date?: string;
          google_event_id?: string | null;
        }
      >;
      knowledge_entries: TableDef<
        {
          id: string;
          user_id: string;
          entry_date: string;
          topic: string;
          source: string;
          summary: string;
          duration_minutes: number | null;
          last_reviewed_at: string | null;
          flashcards: { front: string; back: string }[] | null;
          review_questions: string[] | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          entry_date?: string;
          topic: string;
          source: string;
          summary: string;
          duration_minutes?: number | null;
          last_reviewed_at?: string | null;
          flashcards?: { front: string; back: string }[] | null;
          review_questions?: string[] | null;
        },
        {
          id?: string;
          user_id?: string;
          entry_date?: string;
          topic?: string;
          source?: string;
          summary?: string;
          duration_minutes?: number | null;
          last_reviewed_at?: string | null;
          flashcards?: { front: string; back: string }[] | null;
          review_questions?: string[] | null;
        }
      >;
      daily_intentions: TableDef<
        {
          user_id: string;
          intention_date: string;
          intention: string;
          updated_at: string;
        },
        {
          user_id: string;
          intention_date?: string;
          intention?: string;
        },
        {
          user_id?: string;
          intention_date?: string;
          intention?: string;
        }
      >;
      personal_dna: TableDef<
        {
          user_id: string;
          peak_focus_hours: string | null;
          learning_style: string | null;
          family_check_in_interval_days: number | null;
          habit_notes: string[];
          sleep_notes: string | null;
          career_notes: string | null;
          motivation_triggers: string[];
          onboarding_complete: boolean;
          full_name: string | null;
          birth_date: string | null;
          chronotype_settings: Json;
          core_priorities: Json;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          peak_focus_hours?: string | null;
          learning_style?: string | null;
          family_check_in_interval_days?: number | null;
          habit_notes?: string[];
          sleep_notes?: string | null;
          career_notes?: string | null;
          motivation_triggers?: string[];
          onboarding_complete?: boolean;
          full_name?: string | null;
          birth_date?: string | null;
          chronotype_settings?: Json;
          core_priorities?: Json;
        },
        {
          user_id?: string;
          peak_focus_hours?: string | null;
          learning_style?: string | null;
          family_check_in_interval_days?: number | null;
          habit_notes?: string[];
          sleep_notes?: string | null;
          career_notes?: string | null;
          motivation_triggers?: string[];
          onboarding_complete?: boolean;
          full_name?: string | null;
          birth_date?: string | null;
          chronotype_settings?: Json;
          core_priorities?: Json;
        }
      >;
      goals: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          category: LifeAreaKeyDb;
          target_date: string | null;
          person_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          category: LifeAreaKeyDb;
          target_date?: string | null;
          person_id?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          category?: LifeAreaKeyDb;
          target_date?: string | null;
          person_id?: string | null;
        }
      >;
      milestones: TableDef<
        {
          id: string;
          goal_id: string;
          title: string;
          done: boolean;
          position: number;
          completed_at: string | null;
          due_date: string | null;
          created_at: string;
        },
        {
          id?: string;
          goal_id: string;
          title: string;
          done?: boolean;
          position?: number;
          completed_at?: string | null;
          due_date?: string | null;
        },
        {
          id?: string;
          goal_id?: string;
          title?: string;
          done?: boolean;
          position?: number;
          completed_at?: string | null;
          due_date?: string | null;
        }
      >;
      chat_messages: TableDef<
        {
          id: string;
          user_id: string;
          role: ChatRoleDb;
          content: string;
          created_at: string;
          pinned_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          role: ChatRoleDb;
          content: string;
          pinned_at?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          role?: ChatRoleDb;
          content?: string;
          pinned_at?: string | null;
        }
      >;
      insights: TableDef<
        {
          id: string;
          user_id: string;
          content: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          content: string;
        },
        {
          id?: string;
          user_id?: string;
          content?: string;
        }
      >;
      personal_patterns: TableDef<
        {
          id: string;
          user_id: string;
          category: string;
          pattern_type: string;
          subject: string;
          description: string;
          value: string;
          confidence: number;
          evidence_count: number;
          source: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          category: string;
          pattern_type: string;
          subject?: string;
          description: string;
          value: string;
          confidence: number;
          evidence_count?: number;
          source: string;
        },
        {
          id?: string;
          user_id?: string;
          category?: string;
          pattern_type?: string;
          subject?: string;
          description?: string;
          value?: string;
          confidence?: number;
          evidence_count?: number;
          source?: string;
        }
      >;
      books: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          author: string | null;
          category: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          author?: string | null;
          category?: string | null;
          notes?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          author?: string | null;
          category?: string | null;
          notes?: string | null;
        }
      >;
      rabbis: TableDef<
        {
          id: string;
          user_id: string;
          name: string;
          title: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          title?: string | null;
          notes?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          name?: string;
          title?: string | null;
          notes?: string | null;
        }
      >;
      summaries: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          content: string;
          content_html: string | null;
          is_draft: boolean;
          entity_type: string | null;
          entity_id: string | null;
          mentions: Json;
          summary_date: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          content_html?: string | null;
          is_draft?: boolean;
          entity_type?: string | null;
          entity_id?: string | null;
          mentions?: Json;
          summary_date?: string;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
          content_html?: string | null;
          is_draft?: boolean;
          entity_type?: string | null;
          entity_id?: string | null;
          mentions?: Json;
          summary_date?: string;
        }
      >;
      tasks: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          status: TaskStatusDb;
          due_date: string | null;
          is_high_priority: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          status?: TaskStatusDb;
          due_date?: string | null;
          is_high_priority?: boolean;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          status?: TaskStatusDb;
          due_date?: string | null;
          is_high_priority?: boolean;
        }
      >;
      habits: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
        }
      >;
      habit_logs: TableDef<
        {
          id: string;
          user_id: string;
          habit_id: string;
          completed_date: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          habit_id: string;
          completed_date: string;
        },
        {
          id?: string;
          user_id?: string;
          habit_id?: string;
          completed_date?: string;
        }
      >;
      transactions: TableDef<
        {
          id: string;
          user_id: string;
          amount: number;
          type: TransactionTypeDb;
          title: string;
          category: string;
          transaction_date: string;
          note: string | null;
          is_shift: boolean;
          hourly_rate: number | null;
          shift_start: string | null;
          shift_end: string | null;
          employer: string | null;
          is_recurring: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          amount: number;
          type: TransactionTypeDb;
          title: string;
          category: string;
          transaction_date?: string;
          note?: string | null;
          is_shift?: boolean;
          hourly_rate?: number | null;
          shift_start?: string | null;
          shift_end?: string | null;
          employer?: string | null;
          is_recurring?: boolean;
        },
        {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: TransactionTypeDb;
          title?: string;
          category?: string;
          transaction_date?: string;
          note?: string | null;
          is_shift?: boolean;
          hourly_rate?: number | null;
          shift_start?: string | null;
          shift_end?: string | null;
          employer?: string | null;
          is_recurring?: boolean;
        }
      >;
      manual_events: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          start_time: string;
          end_time: string;
          category: MomentCategoryDb | null;
          reminder_minutes: number | null;
          linked_contact_ids: string[];
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          start_time: string;
          end_time: string;
          category?: MomentCategoryDb | null;
          reminder_minutes?: number | null;
          linked_contact_ids?: string[];
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          start_time?: string;
          end_time?: string;
          category?: MomentCategoryDb | null;
          reminder_minutes?: number | null;
          linked_contact_ids?: string[];
        }
      >;
      learning_topics: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          category: string | null;
          status: LearningTopicStatusDb;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          category?: string | null;
          status?: LearningTopicStatusDb;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          category?: string | null;
          status?: LearningTopicStatusDb;
        }
      >;
      learning_resources: TableDef<
        {
          id: string;
          user_id: string;
          topic_id: string;
          type: LearningResourceTypeDb;
          title: string;
          url: string | null;
          notes: string | null;
          is_completed: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          topic_id: string;
          type: LearningResourceTypeDb;
          title: string;
          url?: string | null;
          notes?: string | null;
          is_completed?: boolean;
        },
        {
          id?: string;
          user_id?: string;
          topic_id?: string;
          type?: LearningResourceTypeDb;
          title?: string;
          url?: string | null;
          notes?: string | null;
          is_completed?: boolean;
        }
      >;
      meals: TableDef<
        {
          id: string;
          user_id: string;
          description: string;
          eaten_at: string;
          type: MealTypeDb;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          description: string;
          eaten_at?: string;
          type: MealTypeDb;
        },
        {
          id?: string;
          user_id?: string;
          description?: string;
          eaten_at?: string;
          type?: MealTypeDb;
        }
      >;
      workouts: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          start_time: string;
          end_time: string | null;
          routine_details: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          start_time?: string;
          end_time?: string | null;
          routine_details?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          start_time?: string;
          end_time?: string | null;
          routine_details?: string | null;
        }
      >;
      recommendation_events: TableDef<
        {
          id: string;
          user_id: string;
          type: string;
          source: string;
          recommendation_payload: Record<string, unknown>;
          status: RecommendationStatusDb;
          metadata: Record<string, unknown>;
          created_at: string;
          responded_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          type: string;
          source: string;
          recommendation_payload?: Record<string, unknown>;
          status?: RecommendationStatusDb;
          metadata?: Record<string, unknown>;
          responded_at?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          type?: string;
          source?: string;
          recommendation_payload?: Record<string, unknown>;
          status?: RecommendationStatusDb;
          metadata?: Record<string, unknown>;
          responded_at?: string | null;
        }
      >;
      // Proactive Engine (M2) — see supabase/migrations/20260831000000_proactive_engine.sql
      job_runs: TableDef<
        {
          id: string;
          job_name: string;
          scope_key: string;
          run_date: string;
          status: JobRunStatusDb;
          items_produced: number;
          detail: Record<string, unknown>;
          started_at: string;
          finished_at: string | null;
        },
        {
          id?: string;
          job_name: string;
          scope_key: string;
          run_date: string;
          status?: JobRunStatusDb;
          items_produced?: number;
          detail?: Record<string, unknown>;
          finished_at?: string | null;
        },
        {
          status?: JobRunStatusDb;
          items_produced?: number;
          detail?: Record<string, unknown>;
          started_at?: string;
          finished_at?: string | null;
        }
      >;
      notifications: TableDef<
        {
          id: string;
          user_id: string;
          kind: string;
          title: string;
          body: string;
          reason: string | null;
          action: Record<string, unknown> | null;
          channels: string[];
          dedupe_key: string;
          status: NotificationStatusDb;
          scheduled_for: string;
          sent_at: string | null;
          read_at: string | null;
          acted_at: string | null;
          expires_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          kind: string;
          title: string;
          body: string;
          reason?: string | null;
          action?: Record<string, unknown> | null;
          channels?: string[];
          dedupe_key: string;
          status?: NotificationStatusDb;
          scheduled_for?: string;
          sent_at?: string | null;
          read_at?: string | null;
          acted_at?: string | null;
          expires_at?: string | null;
        },
        {
          kind?: string;
          title?: string;
          body?: string;
          reason?: string | null;
          action?: Record<string, unknown> | null;
          channels?: string[];
          status?: NotificationStatusDb;
          scheduled_for?: string;
          sent_at?: string | null;
          read_at?: string | null;
          acted_at?: string | null;
          expires_at?: string | null;
        }
      >;
      notification_preferences: TableDef<
        {
          user_id: string;
          quiet_hours_start: number;
          quiet_hours_end: number;
          channel_email: boolean;
          channel_push: boolean;
          channel_whatsapp: boolean;
          muted_kinds: string[];
          whatsapp_number: string | null;
          max_per_day: number;
          updated_at: string;
        },
        {
          user_id: string;
          quiet_hours_start?: number;
          quiet_hours_end?: number;
          channel_email?: boolean;
          channel_push?: boolean;
          channel_whatsapp?: boolean;
          muted_kinds?: string[];
          whatsapp_number?: string | null;
          max_per_day?: number;
        },
        {
          quiet_hours_start?: number;
          quiet_hours_end?: number;
          channel_email?: boolean;
          channel_push?: boolean;
          channel_whatsapp?: boolean;
          muted_kinds?: string[];
          whatsapp_number?: string | null;
          max_per_day?: number;
        }
      >;

      // Sprint 3 — Google Photos. See supabase/migrations/20260903000000_photo_memories.sql.
      photo_memories: TableDef<
        {
          id: string;
          user_id: string;
          taken_at: string;
          google_media_id: string | null;
          source: string;
          // bytea. Arrives from PostgREST as a "\x…" hex string, not a Buffer.
          image_data: string;
          mime_type: string;
          width: number;
          height: number;
          byte_size: number;
          caption: string | null;
          caption_generated_at: string | null;
          created_at: string;
        },
        {
          user_id: string;
          taken_at: string;
          google_media_id?: string | null;
          source?: string;
          image_data: string;
          mime_type?: string;
          width: number;
          height: number;
          byte_size: number;
          caption?: string | null;
          caption_generated_at?: string | null;
        },
        {
          taken_at?: string;
          google_media_id?: string | null;
          source?: string;
          image_data?: string;
          mime_type?: string;
          width?: number;
          height?: number;
          byte_size?: number;
          caption?: string | null;
          caption_generated_at?: string | null;
        }
      >;
      google_photos_credentials: TableDef<
        {
          user_id: string;
          access_token: string;
          refresh_token: string | null;
          expires_at: string;
          scope: string;
          connected_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          access_token: string;
          refresh_token?: string | null;
          expires_at: string;
          scope: string;
          updated_at?: string;
        },
        {
          access_token?: string;
          refresh_token?: string | null;
          expires_at?: string;
          scope?: string;
          updated_at?: string;
        }
      >;
      google_photos_picker_sessions: TableDef<
        {
          id: string;
          user_id: string;
          purpose: string;
          target_person_id: string | null;
          picker_uri: string;
          expire_time: string | null;
          media_items_set: boolean;
          created_at: string;
        },
        {
          id: string;
          user_id: string;
          purpose: string;
          target_person_id?: string | null;
          picker_uri: string;
          expire_time?: string | null;
          media_items_set?: boolean;
        },
        {
          media_items_set?: boolean;
          expire_time?: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
