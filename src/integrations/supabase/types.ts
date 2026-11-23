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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academy_setup: {
        Row: {
          completed_at: string
          director_id: string
          singleton: boolean
        }
        Insert: {
          completed_at?: string
          director_id: string
          singleton?: boolean
        }
        Update: {
          completed_at?: string
          director_id?: string
          singleton?: boolean
        }
        Relationships: []
      }
      attendance: {
        Row: {
          counted: boolean
          created_at: string
          enrollment_id: string
          group_id: string
          id: string
          status: string
          student_id: string
        }
        Insert: {
          counted?: boolean
          created_at?: string
          enrollment_id: string
          group_id: string
          id?: string
          status?: string
          student_id: string
        }
        Update: {
          counted?: boolean
          created_at?: string
          enrollment_id?: string
          group_id?: string
          id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          group_id: string
          id: string
          payout_id: string | null
          plan: string
          price: number
          sessions_total: number
          sessions_used: number
          student_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          payout_id?: string | null
          plan?: string
          price?: number
          sessions_total?: number
          sessions_used?: number
          student_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          payout_id?: string | null
          plan?: string
          price?: number
          sessions_total?: number
          sessions_used?: number
          student_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          spent_on: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          spent_on?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          active: boolean
          activity: string
          age_group: string | null
          audience: string
          created_at: string
          day_of_week: number | null
          end_time: string | null
          id: string
          level_id: string | null
          max_students: number
          name: string
          price: number | null
          room_id: string | null
          start_time: string | null
          subject_id: string | null
          teacher_id: string | null
          teacher_pct: number | null
          workshop_date: string | null
        }
        Insert: {
          active?: boolean
          activity: string
          age_group?: string | null
          audience?: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          level_id?: string | null
          max_students?: number
          name: string
          price?: number | null
          room_id?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          teacher_pct?: number | null
          workshop_date?: string | null
        }
        Update: {
          active?: boolean
          activity?: string
          age_group?: string | null
          audience?: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string | null
          id?: string
          level_id?: string | null
          max_students?: number
          name?: string
          price?: number | null
          room_id?: string | null
          start_time?: string | null
          subject_id?: string | null
          teacher_id?: string | null
          teacher_pct?: number | null
          workshop_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          code: string
          created_at: string
          id: string
          package_price: number | null
          price: number
          sessions: number
          sort: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          package_price?: number | null
          price?: number
          sessions?: number
          sort?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          package_price?: number | null
          price?: number
          sessions?: number
          sort?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          enrollment_id: string | null
          id: string
          method: string
          note: string | null
          receipt_no: number | null
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          method?: string
          note?: string | null
          receipt_no?: number | null
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          enrollment_id?: string | null
          id?: string
          method?: string
          note?: string | null
          receipt_no?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          details: Json
          id: string
          percentage: number
          students_count: number
          teacher_id: string
          total_revenue: number
        }
        Insert: {
          amount?: number
          created_at?: string
          details?: Json
          id?: string
          percentage: number
          students_count?: number
          teacher_id: string
          total_revenue?: number
        }
        Update: {
          amount?: number
          created_at?: string
          details?: Json
          id?: string
          percentage?: number
          students_count?: number
          teacher_id?: string
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "payouts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string
          id: string
          name_ar: string
          name_en: string
          notes: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
          notes?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
          notes?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          address: string | null
          default_teacher_pct: number
          id: number
          institution_type: string
          kids_monthly_price: number
          kids_quarter_price: number
          kids_semester_price: number
          logo_url: string | null
          name: string
          phone: string | null
          sessions_per_month: number
          kids_sessions_per_month: number
          support_price: number
          workshop_price: number
          workshop_teacher_amount: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          default_teacher_pct?: number
          id?: number
          institution_type?: string
          kids_monthly_price?: number
          kids_quarter_price?: number
          kids_semester_price?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          sessions_per_month?: number
          kids_sessions_per_month?: number
          support_price?: number
          workshop_price?: number
          workshop_teacher_amount?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          default_teacher_pct?: number
          id?: number
          institution_type?: string
          kids_monthly_price?: number
          kids_quarter_price?: number
          kids_semester_price?: number
          logo_url?: string | null
          name?: string
          phone?: string | null
          sessions_per_month?: number
          kids_sessions_per_month?: number
          support_price?: number
          workshop_price?: number
          workshop_teacher_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          active: boolean
          age_group: string | null
          birth_date: string | null
          code: string | null
          created_at: string
          first_name: string
          gender: string
          id: string
          last_name: string
          notes: string | null
          parent_phone: string | null
          phone: string | null
          photo_url: string | null
        }
        Insert: {
          active?: boolean
          age_group?: string | null
          birth_date?: string | null
          code?: string | null
          created_at?: string
          first_name: string
          gender?: string
          id?: string
          last_name: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
        }
        Update: {
          active?: boolean
          age_group?: string | null
          birth_date?: string | null
          code?: string | null
          created_at?: string
          first_name?: string
          gender?: string
          id?: string
          last_name?: string
          notes?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
        }
        Relationships: []
      }
      subjects: {
        Row: {
          activities: string[]
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          activities?: string[]
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          activities?: string[]
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      teacher_attendance: {
        Row: {
          created_at: string
          group_id: string
          id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_attendance_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          first_name: string
          full_name: string
          gender: string
          id: string
          last_name: string
          notes: string | null
          percentage: number
          phone: string | null
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          first_name?: string
          full_name: string
          gender?: string
          id?: string
          last_name?: string
          notes?: string | null
          percentage?: number
          phone?: string | null
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          first_name?: string
          full_name?: string
          gender?: string
          id?: string
          last_name?: string
          notes?: string | null
          percentage?: number
          phone?: string | null
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
      waiting_list: {
        Row: {
          activity: string
          age_group: string | null
          created_at: string
          group_id: string | null
          id: string
          level_id: string | null
          note: string | null
          student_id: string
          subject_id: string | null
        }
        Insert: {
          activity?: string
          age_group?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          level_id?: string | null
          note?: string | null
          student_id: string
          subject_id?: string | null
        }
        Update: {
          activity?: string
          age_group?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          level_id?: string | null
          note?: string | null
          student_id?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waiting_list_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_list_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      director_setup_open: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      local_day: { Args: { ts: string }; Returns: string }
      login_setup_hint: { Args: never; Returns: boolean }
      teacher_present_today: {
        Args: { _at: string; _group: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "staff"],
    },
  },
} as const
