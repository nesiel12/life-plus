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
export type LearningBookKindDb = "book" | "article";
export type LearningBookUnitDb = "page" | "chapter";
export type LearningBookStatusDb = "to_read" | "reading" | "finished";
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

// מרחב תורה — Knowledge Graph vocabularies. Each mirrors a check constraint
// in supabase/migrations/20260916000000–000002. Kept in step by hand, like
// every other *Db union in this file: the constraint is the source of truth,
// and a value the database rejects should not typecheck here either.
export type KgNodeTypeDb =
  | "book"
  | "rabbi"
  | "lesson"
  | "summary"
  | "concept"
  | "person"
  | "topic"
  | "section";
export type KgRelationDb =
  | "authored_by"
  | "taught_by"
  | "quotes"
  | "mentions"
  | "about"
  | "part_of"
  | "commentary_on"
  | "discusses"
  | "related_to";
export type KgOriginDb = "user" | "ai" | "import";
export type ConceptSourceTypeDb = "summary" | "lesson" | "book" | "knowledge_entry";
export type LessonKindDb = "audio" | "youtube" | "pdf";
export type LessonStatusDb = "uploading" | "pending" | "transcribing" | "analyzing" | "ready" | "failed";
export type LessonSourceKindDb = "verse" | "talmud" | "halacha" | "book" | "other";
export type PracticeQuestionKindDb = "scenario" | "application" | "recall" | "compare" | "dilemma" | "counter";
// 20260921000000_ux_overhaul.sql
export type MacroSourceDb = "ai" | "preset" | "user";
export type WorkoutKindDb = "strength" | "cardio" | "hiit" | "yoga" | "walk" | "sport" | "other";
export type PracticeSessionModeDb = "battle" | "review";
export type SrsSourceTypeDb =
  | "lesson"
  | "summary"
  | "book"
  | "knowledge_entry"
  | "concept"
  | "manual"
  // The Learning lab's Anki-style flashcards (supabase/migrations/
  // 20260922000000_learning_os.sql) — source_id is the learning_topics id.
  | "learning_topic";
export type StudyTrackStatusDb = "active" | "paused" | "completed" | "abandoned";
export type HavrutaSubjectTypeDb = "summary" | "lesson" | "book" | "rabbi" | "concept" | "contradiction";
export type HavrutaModeDb = "debate" | "clarify" | "contradiction";
export type ContradictionSideTypeDb = "summary" | "lesson" | "concept";
export type ContradictionStatusDb = "open" | "dismissed" | "resolved";
// 20260920000000_torah_media_scans.sql
export type AudioEntityTypeDb = "book" | "rabbi" | "lesson" | "concept" | "summary";
export type AudioAttachmentStatusDb = "uploading" | "stored" | "transcribing" | "ready" | "failed";
export type AudioAttachmentSourceDb = "upload" | "recording";
export type ScanStatusDb = "draft" | "saved" | "discarded";
export type ScanEntityTypeDb = "book" | "rabbi" | "lesson" | "note";
export type ContradictionKindDb = "halachic" | "logical";

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

/**
 * A table whose Insert and Update shapes are derived from its Row.
 *
 * Every table added for the Torah knowledge graph (20260916000000–000002)
 * follows one rule: the caller always supplies user_id, the database supplies
 * id and the timestamps, and the rest is optional. Spelling all three shapes
 * out by hand for seventeen tables is ~700 lines restating the same thing,
 * and each hand-written copy is a place for the Insert to drift out of step
 * with the Row — the exact drift 20260831000001_fix_learning_schema_drift.sql
 * exists to clean up.
 *
 * The older tables above keep their explicit shapes. They are not rewritten
 * here: this is a new-code convention, and converting 40 existing tables to
 * it would be a large diff whose only effect is on types nobody is editing.
 */
type GraphTable<
  Row extends { id: string; user_id: string },
  RequiredOnInsert extends keyof Row = never,
> = TableDef<Row, Partial<Row> & Pick<Row, "user_id" | RequiredOnInsert>, Partial<Row>>;

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
          timezone: string | null;
          /** 20260921000000 — { calories, proteinG, carbsG, fatG, waterMl }. */
          health_targets: Json;
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
          health_targets?: Json;
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
          health_targets?: Json;
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
      // Enriched by 20260916000000_torah_kg_core.sql for the smart book hub.
      // Every added column is nullable or defaulted, so existing writers that
      // only know about title/author/category/notes keep compiling.
      books: TableDef<
        {
          id: string;
          user_id: string;
          title: string;
          author: string | null;
          category: string | null;
          notes: string | null;
          cover_image_url: string | null;
          hebrew_title: string | null;
          published_year: number | null;
          description: string | null;
          pre_study_notes: string | null;
          author_rabbi_id: string | null;
          external_refs: Json;
          avg_price_ils: number | null;
          rating: number | null;
          ratings_count: number | null;
          last_synced_at: string | null;
          key_topics: Json;
          personal_rating: number | null;
          personal_review: string | null;
          recommended_by: string | null;
          isbn: string | null;
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
          cover_image_url?: string | null;
          hebrew_title?: string | null;
          published_year?: number | null;
          description?: string | null;
          pre_study_notes?: string | null;
          author_rabbi_id?: string | null;
          external_refs?: Json;
          avg_price_ils?: number | null;
          rating?: number | null;
          ratings_count?: number | null;
          last_synced_at?: string | null;
          key_topics?: Json;
          personal_rating?: number | null;
          personal_review?: string | null;
          recommended_by?: string | null;
          isbn?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          author?: string | null;
          category?: string | null;
          notes?: string | null;
          cover_image_url?: string | null;
          hebrew_title?: string | null;
          published_year?: number | null;
          description?: string | null;
          pre_study_notes?: string | null;
          author_rabbi_id?: string | null;
          external_refs?: Json;
          avg_price_ils?: number | null;
          rating?: number | null;
          ratings_count?: number | null;
          last_synced_at?: string | null;
          key_topics?: Json;
          personal_rating?: number | null;
          personal_review?: string | null;
          recommended_by?: string | null;
          isbn?: string | null;
        }
      >;
      // Enriched by 20260916000000_torah_kg_core.sql. Teachers and students
      // are NOT here — they are kg_edges rows (relation 'taught_by'), because
      // the app walks that relationship recursively.
      rabbis: TableDef<
        {
          id: string;
          user_id: string;
          name: string;
          title: string | null;
          notes: string | null;
          hebrew_name: string | null;
          portrait_url: string | null;
          birth_year: number | null;
          death_year: number | null;
          birth_place: string | null;
          death_place: string | null;
          locations: Json;
          era: string | null;
          bio: string | null;
          external_refs: Json;
          last_synced_at: string | null;
          historical_context: string | null;
          achievements: Json;
          lineage: Json;
          works: Json;
          is_contemporary: boolean | null;
          phone: string | null;
          whatsapp_url: string | null;
          website_url: string | null;
          youtube_channel_url: string | null;
          email: string | null;
          suggested_links: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          title?: string | null;
          notes?: string | null;
          hebrew_name?: string | null;
          portrait_url?: string | null;
          birth_year?: number | null;
          death_year?: number | null;
          birth_place?: string | null;
          death_place?: string | null;
          locations?: Json;
          era?: string | null;
          bio?: string | null;
          external_refs?: Json;
          last_synced_at?: string | null;
          historical_context?: string | null;
          achievements?: Json;
          lineage?: Json;
          works?: Json;
          is_contemporary?: boolean | null;
          phone?: string | null;
          whatsapp_url?: string | null;
          website_url?: string | null;
          youtube_channel_url?: string | null;
          email?: string | null;
          suggested_links?: Json;
        },
        {
          id?: string;
          user_id?: string;
          name?: string;
          title?: string | null;
          notes?: string | null;
          hebrew_name?: string | null;
          portrait_url?: string | null;
          birth_year?: number | null;
          death_year?: number | null;
          birth_place?: string | null;
          death_place?: string | null;
          locations?: Json;
          era?: string | null;
          bio?: string | null;
          external_refs?: Json;
          last_synced_at?: string | null;
          historical_context?: string | null;
          achievements?: Json;
          lineage?: Json;
          works?: Json;
          is_contemporary?: boolean | null;
          phone?: string | null;
          whatsapp_url?: string | null;
          website_url?: string | null;
          youtube_channel_url?: string | null;
          email?: string | null;
          suggested_links?: Json;
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
      learning_books: TableDef<
        {
          id: string;
          user_id: string;
          topic_id: string | null;
          kind: LearningBookKindDb;
          title: string;
          author: string | null;
          category: string | null;
          cover_image_url: string | null;
          unit_label: LearningBookUnitDb;
          total_units: number;
          progress_units: number;
          status: LearningBookStatusDb;
          notes: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          topic_id?: string | null;
          kind?: LearningBookKindDb;
          title: string;
          author?: string | null;
          category?: string | null;
          cover_image_url?: string | null;
          unit_label?: LearningBookUnitDb;
          total_units?: number;
          progress_units?: number;
          status?: LearningBookStatusDb;
          notes?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          topic_id?: string | null;
          kind?: LearningBookKindDb;
          title?: string;
          author?: string | null;
          category?: string | null;
          cover_image_url?: string | null;
          unit_label?: LearningBookUnitDb;
          total_units?: number;
          progress_units?: number;
          status?: LearningBookStatusDb;
          notes?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
        }
      >;
      learning_quotes: TableDef<
        {
          id: string;
          user_id: string;
          book_id: string;
          quote_text: string;
          note: string | null;
          chapter_label: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          book_id: string;
          quote_text: string;
          note?: string | null;
          chapter_label?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          book_id?: string;
          quote_text?: string;
          note?: string | null;
          chapter_label?: string | null;
        }
      >;
      learning_quiz_attempts: TableDef<
        {
          id: string;
          user_id: string;
          topic_id: string;
          score: number;
          total: number;
          questions: unknown;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          topic_id: string;
          score: number;
          total: number;
          questions?: unknown;
        },
        {
          id?: string;
          user_id?: string;
          topic_id?: string;
          score?: number;
          total?: number;
          questions?: unknown;
        }
      >;
      voice_sessions: GraphTable<
        {
          id: string;
          user_id: string;
          title: string | null;
          created_at: string;
          updated_at: string;
        },
        never
      >;
      voice_messages: GraphTable<
        {
          id: string;
          user_id: string;
          session_id: string;
          role: "user" | "assistant";
          content: string;
          created_at: string;
        },
        "session_id" | "role" | "content"
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
          fat_g: number | null;
          macro_source: MacroSourceDb | null;
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
          fat_g?: number | null;
          macro_source?: MacroSourceDb | null;
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
          fat_g?: number | null;
          macro_source?: MacroSourceDb | null;
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
          kind: WorkoutKindDb | null;
          intensity: number | null;
          avg_heart_rate: number | null;
          calories_burned: number | null;
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
          kind?: WorkoutKindDb | null;
          intensity?: number | null;
          avg_heart_rate?: number | null;
          calories_burned?: number | null;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          start_time?: string;
          end_time?: string | null;
          routine_details?: string | null;
          kind?: WorkoutKindDb | null;
          intensity?: number | null;
          avg_heart_rate?: number | null;
          calories_burned?: number | null;
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

      // ---------------------------------------------------------------------
      // מרחב תורה — Knowledge Graph.
      // supabase/migrations/20260916000000_torah_kg_core.sql
      //                    20260916000001_torah_lessons_pipeline.sql
      //                    20260916000002_torah_active_learning.sql
      // ---------------------------------------------------------------------

      kg_edges: GraphTable<
        {
          id: string;
          user_id: string;
          from_type: KgNodeTypeDb;
          from_id: string;
          to_type: KgNodeTypeDb;
          to_id: string;
          relation: KgRelationDb;
          weight: number;
          origin: KgOriginDb;
          evidence: Json;
          created_at: string;
          updated_at: string;
        },
        "from_type" | "from_id" | "to_type" | "to_id" | "relation"
      >;

      concepts: GraphTable<
        {
          id: string;
          user_id: string;
          term: string;
          normalized_term: string;
          aliases: Json;
          definition: string | null;
          definition_origin: "user" | "ai";
          mention_count: number;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        },
        "term" | "normalized_term"
      >;

      concept_mentions: GraphTable<
        {
          id: string;
          user_id: string;
          concept_id: string;
          source_type: ConceptSourceTypeDb;
          source_id: string;
          excerpt: string | null;
          at_seconds: number | null;
          created_at: string;
        },
        "concept_id" | "source_type" | "source_id"
      >;

      lessons: GraphTable<
        {
          id: string;
          user_id: string;
          title: string;
          kind: LessonKindDb;
          source_url: string | null;
          storage_path: string | null;
          duration_seconds: number | null;
          status: LessonStatusDb;
          error: string | null;
          book_id: string | null;
          rabbi_id: string | null;
          knowledge_entry_id: string | null;
          lesson_date: string;
          // 20260918000000_torah_lessons_phase3.sql
          progress: Json;
          lease_until: string | null;
          attempts: number;
          media_mime: string | null;
          media_size_bytes: number | null;
          summary: string | null;
          key_points: Json;
          speaker: string | null;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        "title" | "kind"
      >;

      lesson_transcripts: TableDef<
        {
          lesson_id: string;
          user_id: string;
          full_text: string;
          language: string | null;
          provider: string;
          word_count: number | null;
          /** [{ start, end, text }] in seconds — 20260918000000. */
          lines: Json;
          created_at: string;
          updated_at: string;
        },
        {
          lesson_id: string;
          user_id: string;
          full_text: string;
          language?: string | null;
          provider: string;
          word_count?: number | null;
          lines?: Json;
        },
        {
          full_text?: string;
          language?: string | null;
          provider?: string;
          word_count?: number | null;
          lines?: Json;
        }
      >;

      lesson_segments: GraphTable<
        {
          id: string;
          user_id: string;
          lesson_id: string;
          start_seconds: number;
          end_seconds: number | null;
          title: string;
          summary: string | null;
          sort_order: number;
          created_at: string;
        },
        "lesson_id" | "start_seconds" | "title"
      >;

      lesson_sources: GraphTable<
        {
          id: string;
          user_id: string;
          lesson_id: string;
          segment_id: string | null;
          raw_citation: string;
          normalized_ref: string | null;
          source_kind: LessonSourceKindDb;
          quoted_text: string | null;
          sefaria_ref: string | null;
          resolved_book_id: string | null;
          at_seconds: number | null;
          confidence: number;
          sefaria_index: string | null;
          he_ref: string | null;
          he_index_title: string | null;
          mentions: number;
          created_at: string;
        },
        "lesson_id" | "raw_citation"
      >;

      learning_chunks: GraphTable<
        {
          id: string;
          user_id: string;
          lesson_id: string;
          ordinal: number;
          title: string;
          body: string;
          start_seconds: number | null;
          end_seconds: number | null;
          completed_at: string | null;
          created_at: string;
        },
        "lesson_id" | "ordinal" | "title" | "body"
      >;

      practice_questions: GraphTable<
        {
          id: string;
          user_id: string;
          lesson_id: string | null;
          chunk_id: string | null;
          kind: PracticeQuestionKindDb;
          prompt: string;
          model_answer: string | null;
          rubric: Json;
          difficulty: number;
          created_at: string;
        },
        "prompt"
      >;

      practice_attempts: GraphTable<
        {
          id: string;
          user_id: string;
          question_id: string;
          answer: string;
          score: number | null;
          ai_feedback: string | null;
          rubric_results: Json;
          created_at: string;
        },
        "question_id" | "answer"
      >;

      srs_cards: GraphTable<
        {
          id: string;
          user_id: string;
          front: string;
          back: string;
          source_type: SrsSourceTypeDb | null;
          source_id: string | null;
          concept_id: string | null;
          ease_factor: number;
          interval_days: number;
          repetitions: number;
          lapses: number;
          due_at: string;
          last_reviewed_at: string | null;
          last_grade: number | null;
          suspended_at: string | null;
          chunk_id: string | null;
          created_at: string;
          updated_at: string;
        },
        "front" | "back"
      >;

      srs_reviews: GraphTable<
        {
          id: string;
          user_id: string;
          card_id: string;
          grade: number;
          interval_days: number;
          ease_factor: number;
          duration_ms: number | null;
          reviewed_at: string;
        },
        "card_id" | "grade" | "interval_days" | "ease_factor"
      >;

      study_tracks: GraphTable<
        {
          id: string;
          user_id: string;
          title: string;
          book_id: string | null;
          start_date: string;
          target_date: string | null;
          status: StudyTrackStatusDb;
          cadence: Json;
          created_at: string;
          updated_at: string;
        },
        "title"
      >;

      study_track_items: GraphTable<
        {
          id: string;
          user_id: string;
          track_id: string;
          ordinal: number;
          label: string;
          reference: string | null;
          due_date: string | null;
          completed_at: string | null;
          lesson_id: string | null;
          created_at: string;
        },
        "track_id" | "ordinal" | "label"
      >;

      havruta_threads: GraphTable<
        {
          id: string;
          user_id: string;
          subject_type: HavrutaSubjectTypeDb;
          subject_id: string;
          mode: HavrutaModeDb;
          title: string | null;
          closed_at: string | null;
          // 20260919000000_torah_havruta_phase4.sql — [{ text, kind }].
          insights: Json;
          insights_at: string | null;
          created_at: string;
          updated_at: string;
        },
        "subject_type" | "subject_id"
      >;

      havruta_messages: GraphTable<
        {
          id: string;
          user_id: string;
          thread_id: string;
          role: "user" | "assistant";
          content: string;
          citations: Json;
          /** 20260919000001 — ["kushya", "shita", …]. */
          moves: Json;
          created_at: string;
        },
        "thread_id" | "role" | "content"
      >;

      contradiction_alerts: GraphTable<
        {
          id: string;
          user_id: string;
          left_type: ContradictionSideTypeDb;
          left_id: string;
          right_type: ContradictionSideTypeDb;
          right_id: string;
          explanation: string;
          confidence: number;
          status: ContradictionStatusDb;
          thread_id: string | null;
          // 20260919000000_torah_havruta_phase4.sql
          left_excerpt: string | null;
          right_excerpt: string | null;
          kind: ContradictionKindDb | null;
          resolution: string | null;
          created_at: string;
          updated_at: string;
        },
        "left_type" | "left_id" | "right_type" | "right_id" | "explanation"
      >;

      entity_audio: GraphTable<
        {
          id: string;
          user_id: string;
          entity_type: AudioEntityTypeDb;
          entity_id: string;
          title: string;
          storage_path: string;
          mime: string;
          size_bytes: number | null;
          duration_seconds: number | null;
          source: AudioAttachmentSourceDb;
          status: AudioAttachmentStatusDb;
          transcript: string | null;
          /** [{ start, end, text }] — the same shape as lesson_transcripts.lines. */
          transcript_lines: Json;
          transcript_provider: string | null;
          error: string | null;
          progress: Json;
          lease_until: string | null;
          attempts: number;
          created_at: string;
          updated_at: string;
        },
        "entity_type" | "entity_id" | "title" | "storage_path" | "mime"
      >;

      handwriting_scans: GraphTable<
        {
          id: string;
          user_id: string;
          storage_paths: Json;
          page_count: number;
          markdown: string;
          edited_markdown: string | null;
          title: string | null;
          confidence: number | null;
          uncertain_count: number;
          status: ScanStatusDb;
          summary_id: string | null;
          entity_type: ScanEntityTypeDb | null;
          entity_id: string | null;
          created_at: string;
          updated_at: string;
        },
        "markdown"
      >;

      water_logs: GraphTable<
        {
          id: string;
          user_id: string;
          amount_ml: number;
          logged_at: string;
          created_at: string;
        },
        "amount_ml"
      >;

      practice_sessions: GraphTable<
        {
          id: string;
          user_id: string;
          mode: PracticeSessionModeDb;
          rounds: number;
          correct: number;
          max_combo: number;
          bonus_xp: number;
          started_at: string;
          ended_at: string;
          created_at: string;
        },
        "started_at"
      >;

      video_checkpoints: GraphTable<
        {
          id: string;
          user_id: string;
          video_id: string;
          topic_id: string | null;
          checkpoints: Json;
          answers: Json;
          created_at: string;
          updated_at: string;
        },
        "video_id"
      >;

      learning_roadmaps: GraphTable<
        {
          id: string;
          user_id: string;
          topic_id: string;
          nodes: Json;
          completed: Json;
          created_at: string;
          updated_at: string;
        },
        "topic_id"
      >;

      contradiction_scan_pairs: GraphTable<
        {
          id: string;
          user_id: string;
          pair_key: string;
          fingerprint: string;
          conflict: boolean;
          scanned_at: string;
        },
        "pair_key" | "fingerprint" | "conflict"
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
      // Recursive graph traversal, in the database — see the header of
      // 20260916000000_torah_kg_core.sql for why deep walks run there rather
      // than by shipping every edge to Node.
      // Lesson pipeline leases — 20260918000000_torah_lessons_phase3.sql.
      claim_lesson_step: {
        Args: { p_lesson_id: string; p_user_id: string | null; p_lease_seconds: number };
        Returns: Database["public"]["Tables"]["lessons"]["Row"][];
      };
      list_claimable_lessons: {
        Args: { p_limit: number };
        Returns: { id: string; user_id: string }[];
      };
      claim_audio_step: {
        Args: { p_audio_id: string; p_user_id: string | null; p_lease_seconds: number };
        Returns: Database["public"]["Tables"]["entity_audio"]["Row"][];
      };
      list_claimable_audio: {
        Args: { p_limit: number };
        Returns: { id: string; user_id: string }[];
      };
      kg_walk: {
        Args: {
          p_user_id: string;
          p_start_type: string;
          p_start_id: string;
          p_relations: string[] | null;
          p_max_depth?: number;
        };
        Returns: {
          node_type: KgNodeTypeDb;
          node_id: string;
          relation: KgRelationDb;
          depth: number;
          weight: number;
          origin: KgOriginDb;
          path: string[];
        }[];
      };
    };
  };
}
