// Hand-written to match supabase/migrations/20260720000000_init.sql.
// Once a live Supabase project exists, regenerate with:
//   npx supabase gen types typescript --linked > types/database.ts
// and reconcile any drift — this file should not be hand-edited after that.

export type LifeAreaKeyDb = "faith" | "family" | "knowledge" | "health" | "career";
export type MomentCategoryDb = LifeAreaKeyDb | "general";
export type ChatRoleDb = "user" | "assistant" | "system";
export type RecommendationStatusDb = "pending" | "accepted" | "rejected" | "modified" | "expired";
export type TaskStatusDb = "todo" | "in-progress" | "done";
export type TransactionTypeDb = "income" | "expense";
export type LearningTopicStatusDb = "planning" | "active" | "completed";
export type LearningResourceTypeDb = "youtube" | "podcast" | "article" | "equipment" | "summary";
export type MealTypeDb = "breakfast" | "lunch" | "dinner" | "snack" | "post-workout";

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
          summary_date: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          content: string;
          summary_date?: string;
        },
        {
          id?: string;
          user_id?: string;
          title?: string;
          content?: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
