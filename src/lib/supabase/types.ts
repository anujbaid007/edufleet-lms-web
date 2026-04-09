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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      centres: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "centres_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          board: string
          chapter_no: number
          class: number
          created_at: string
          id: string
          medium: string
          subject_id: string
          title: string
          title_hindi: string | null
        }
        Insert: {
          board?: string
          chapter_no: number
          class: number
          created_at?: string
          id?: string
          medium?: string
          subject_id: string
          title: string
          title_hindi?: string | null
        }
        Update: {
          board?: string
          chapter_no?: number
          class?: number
          created_at?: string
          id?: string
          medium?: string
          subject_id?: string
          title?: string
          title_hindi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_quizzes: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          is_published: boolean
          question_count: number
          source_medium: string | null
          source_path: string | null
          source_subject: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          is_published?: boolean
          question_count?: number
          source_medium?: string | null
          source_path?: string | null
          source_subject?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          is_published?: boolean
          question_count?: number
          source_medium?: string | null
          source_path?: string | null
          source_subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapter_quizzes_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      content_restrictions: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_restrictions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_restrictions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          type: Database["public"]["Enums"]["org_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          type?: Database["public"]["Enums"]["org_type"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          board: string | null
          centre_id: string | null
          class: number | null
          created_at: string
          id: string
          is_active: boolean
          medium: string | null
          name: string
          org_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          teacher_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          board?: string | null
          centre_id?: string | null
          class?: number | null
          created_at?: string
          id: string
          is_active?: boolean
          medium?: string | null
          name: string
          org_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          teacher_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          board?: string | null
          centre_id?: string | null
          class?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          medium?: string | null
          name?: string
          org_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          display_order: number
          icon_key: string | null
          id: string
          name: string
          name_hindi: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          icon_key?: string | null
          id?: string
          name: string
          name_hindi?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          icon_key?: string | null
          id?: string
          name?: string
          name_hindi?: string | null
        }
        Relationships: []
      }
      quiz_attempt_answers: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option: number | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option?: number | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempt_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempt_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          completed_at: string
          correct_answers: number
          created_at: string
          id: string
          mastery_level: string
          percent: number
          quiz_id: string
          started_at: string
          total_questions: number
          user_id: string
        }
        Insert: {
          completed_at?: string
          correct_answers: number
          created_at?: string
          id?: string
          mastery_level: string
          percent: number
          quiz_id: string
          started_at?: string
          total_questions: number
          user_id: string
        }
        Update: {
          completed_at?: string
          correct_answers?: number
          created_at?: string
          id?: string
          mastery_level?: string
          percent?: number
          quiz_id?: string
          started_at?: string
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "chapter_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          cognitive_level: string | null
          correct_option: number
          created_at: string
          difficulty: string | null
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          quiz_id: string
          sort_order: number
          source_row: number | null
        }
        Insert: {
          cognitive_level?: string | null
          correct_option: number
          created_at?: string
          difficulty?: string | null
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          quiz_id: string
          sort_order?: number
          source_row?: number | null
        }
        Update: {
          cognitive_level?: string | null
          correct_option?: number
          created_at?: string
          difficulty?: string | null
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          quiz_id?: string
          sort_order?: number
          source_row?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "chapter_quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      video_progress: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          last_position: number
          last_watched_at: string
          user_id: string
          video_id: string
          watched_percentage: number
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          last_position?: number
          last_watched_at?: string
          user_id: string
          video_id: string
          watched_percentage?: number
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          last_position?: number
          last_watched_at?: string
          user_id?: string
          video_id?: string
          watched_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          chapter_id: string
          created_at: string
          duration_seconds: number
          duration_seconds_hindi: number | null
          id: string
          s3_key: string
          s3_key_hindi: string | null
          sort_order: number
          title: string
          title_hindi: string | null
        }
        Insert: {
          chapter_id: string
          created_at?: string
          duration_seconds?: number
          duration_seconds_hindi?: number | null
          id?: string
          s3_key: string
          s3_key_hindi?: string | null
          sort_order?: number
          title: string
          title_hindi?: string | null
        }
        Update: {
          chapter_id?: string
          created_at?: string
          duration_seconds?: number
          duration_seconds_hindi?: number | null
          id?: string
          s3_key?: string
          s3_key_hindi?: string | null
          sort_order?: number
          title?: string
          title_hindi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_centre_id: { Args: never; Returns: string }
      current_user_org_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      org_type: "csr" | "ngo"
      user_role:
        | "platform_admin"
        | "org_admin"
        | "centre_admin"
        | "teacher"
        | "student"
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
      org_type: ["csr", "ngo"],
      user_role: [
        "platform_admin",
        "org_admin",
        "centre_admin",
        "teacher",
        "student",
      ],
    },
  },
} as const
