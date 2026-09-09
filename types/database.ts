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
export type RecoveryEventKindDb = "relapse" | "urge" | "note";
export type RecoveryChallengePurposeDb = "register" | "authenticate";
export type RoutineKindDb =
  | "work"
  | "study"
  | "torah"
  | "training"
  | "rest"
  | "meal"
  | "commute"
  | "family"
  | "free"
  | "other";
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
          birth_year: number | null;
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
          birth_year?: number | null;
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
          birth_year?: number | null;
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
          timezone: string | null;
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
          timezone?: string | null;
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
          timezone?: string | null;
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
      ai_usage: TableDef<
        {
          id: string;
          user_id: string;
          scope: string;
          window_start: string;
          units: number;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          scope: string;
          window_start: string;
          units?: number;
        },
        { units?: number }
      >;
      check_ins: TableDef<
        {
          id: string;
          user_id: string;
          occurred_at: string;
          activity: string;
          energy: number;
          note: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          occurred_at?: string;
          activity: string;
          energy: number;
          note?: string | null;
        },
        {
          occurred_at?: string;
          activity?: string;
          energy?: number;
          note?: string | null;
        }
      >;
      summary_sections: TableDef<
        {
          id: string;
          user_id: string;
          name: string;
          icon: string | null;
          sort_order: number;
          parent_id: string | null;
          pinned_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          icon?: string | null;
          sort_order?: number;
          parent_id?: string | null;
          pinned_at?: string | null;
        },
        {
          name?: string;
          icon?: string | null;
          sort_order?: number;
          parent_id?: string | null;
          pinned_at?: string | null;
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
          section_id: string | null;
          sort_order: number;
          pinned_at: string | null;
          tags: Json;
          kind: string;
          url: string | null;
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
          section_id?: string | null;
          sort_order?: number;
          pinned_at?: string | null;
          tags?: Json;
          kind?: string;
          url?: string | null;
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
          section_id?: string | null;
          sort_order?: number;
          pinned_at?: string | null;
          tags?: Json;
          kind?: string;
          url?: string | null;
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
          reminded_at: string | null;
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
          reminded_at?: string | null;
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
          calories: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fats_g: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          description: string;
          eaten_at?: string;
          type: MealTypeDb;
          calories?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fats_g?: number | null;
        },
        {
          id?: string;
          user_id?: string;
          description?: string;
          eaten_at?: string;
          type?: MealTypeDb;
          calories?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fats_g?: number | null;
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
          delivery: Record<string, unknown>;
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
          delivery?: Record<string, unknown>;
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
          delivery?: Record<string, unknown>;
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
          schedule_alert_minutes: number;
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
          schedule_alert_minutes?: number;
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
          schedule_alert_minutes?: number;
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
      recovery_programs: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          clean_since: string;
          reasons: string[];
          triggers: string[];
          risk_hours: number[];
          coping_strategies: string[];
          celebrated_milestones: number[];
          is_active: boolean;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          clean_since: string;
          reasons?: string[];
          triggers?: string[];
          risk_hours?: number[];
          coping_strategies?: string[];
          celebrated_milestones?: number[];
          is_active?: boolean;
          archived_at?: string | null;
        },
        {
          title?: string;
          clean_since?: string;
          reasons?: string[];
          triggers?: string[];
          risk_hours?: number[];
          coping_strategies?: string[];
          celebrated_milestones?: number[];
          is_active?: boolean;
          archived_at?: string | null;
          updated_at?: string;
        }
      >;
      recovery_events: TableDef<
        {
          id: string;
          user_id: string;
          program_id: string;
          kind: RecoveryEventKindDb;
          occurred_at: string;
          intensity: number | null;
          trigger: string | null;
          note: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          program_id: string;
          kind: RecoveryEventKindDb;
          occurred_at?: string;
          intensity?: number | null;
          trigger?: string | null;
          note?: string | null;
        },
        {
          kind?: RecoveryEventKindDb;
          occurred_at?: string;
          intensity?: number | null;
          trigger?: string | null;
          note?: string | null;
        }
      >;
      recovery_credentials: TableDef<
        {
          id: string;
          user_id: string;
          credential_id: string;
          public_key: string;
          counter: number;
          transports: string[];
          device_label: string | null;
          created_at: string;
          last_used_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          credential_id: string;
          public_key: string;
          counter?: number;
          transports?: string[];
          device_label?: string | null;
        },
        {
          counter?: number;
          device_label?: string | null;
          last_used_at?: string | null;
        }
      >;
      recovery_challenges: TableDef<
        {
          user_id: string;
          challenge: string;
          purpose: RecoveryChallengePurposeDb;
          expires_at: string;
          created_at: string;
        },
        {
          user_id: string;
          challenge: string;
          purpose: RecoveryChallengePurposeDb;
          expires_at: string;
        },
        {
          challenge?: string;
          purpose?: RecoveryChallengePurposeDb;
          expires_at?: string;
        }
      >;
      routine_blocks: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          kind: RoutineKindDb;
          weekdays: number[];
          start_minute: number;
          end_minute: number;
          note: string | null;
          is_active: boolean;
          imported_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          kind?: RoutineKindDb;
          weekdays: number[];
          start_minute: number;
          end_minute: number;
          note?: string | null;
          is_active?: boolean;
          imported_at?: string | null;
        },
        {
          title?: string;
          kind?: RoutineKindDb;
          weekdays?: number[];
          start_minute?: number;
          end_minute?: number;
          note?: string | null;
          is_active?: boolean;
          imported_at?: string | null;
        }
      >;
      google_calendar_credentials: TableDef<
        {
          user_id: string;
          access_token: string;
          refresh_token: string | null;
          expires_at: string;
          scope: string;
          invalid_at: string | null;
          connected_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          access_token: string;
          refresh_token?: string | null;
          expires_at: string;
          scope: string;
          invalid_at?: string | null;
          updated_at?: string;
        },
        {
          access_token?: string;
          refresh_token?: string | null;
          expires_at?: string;
          scope?: string;
          invalid_at?: string | null;
          updated_at?: string;
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
      push_subscriptions: TableDef<
        {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          last_used_at?: string | null;
        },
        {
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          last_used_at?: string | null;
        }
      >;
      fitness_goals: TableDef<
        {
          user_id: string;
          start_weight_kg: number | null;
          current_weight_kg: number | null;
          target_weight_kg: number | null;
          body_composition_goal: string | null;
          weekly_workout_target: number | null;
          daily_calorie_target: number | null;
          daily_protein_target: number | null;
          updated_at: string;
        },
        {
          user_id: string;
          start_weight_kg?: number | null;
          current_weight_kg?: number | null;
          target_weight_kg?: number | null;
          body_composition_goal?: string | null;
          weekly_workout_target?: number | null;
          daily_calorie_target?: number | null;
          daily_protein_target?: number | null;
          updated_at?: string;
        },
        {
          start_weight_kg?: number | null;
          current_weight_kg?: number | null;
          target_weight_kg?: number | null;
          body_composition_goal?: string | null;
          weekly_workout_target?: number | null;
          daily_calorie_target?: number | null;
          daily_protein_target?: number | null;
          updated_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      // The atomic quota check-and-charge. Both live in
      // supabase/migrations/20260906020000_ai_usage_quota.sql — declared here
      // so .rpc() is typed rather than `any`, since these two calls are the
      // whole enforcement mechanism.
      consume_ai_units: {
        Args: {
          p_user_id: string;
          p_budgets: { scope: string; window: string; cost: number; limit: number }[];
        };
        Returns: {
          allowed: boolean;
          rejected_scope: string | null;
          used: number | null;
          cap: number | null;
        }[];
      };
      adjust_ai_units: {
        Args: { p_user_id: string; p_scope: string; p_window: string; p_delta: number };
        Returns: number;
      };
    };
  };
}
