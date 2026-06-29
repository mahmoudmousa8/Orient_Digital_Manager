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
      app_settings: {
        Row: {
          company_name: string
          created_at: string
          id: boolean
          logo_url: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          id?: boolean
          logo_url?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: boolean
          logo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          client_id: string
          client_percentage: number
          created_at: string
          id: string
          link: string | null
          name: string
          status: Database["public"]["Enums"]["channel_status"]
          updated_at: string
          system_id: string | null
          system_percentage: number
          company_percentage: number
          is_monetized: boolean
        }
        Insert: {
          client_id: string
          client_percentage?: number
          created_at?: string
          id?: string
          link?: string | null
          name: string
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          system_id?: string | null
          system_percentage?: number
          company_percentage?: number
          is_monetized?: boolean
        }
        Update: {
          client_id?: string
          client_percentage?: number
          created_at?: string
          id?: string
          link?: string | null
          name?: string
          status?: Database["public"]["Enums"]["channel_status"]
          updated_at?: string
          system_id?: string | null
          system_percentage?: number
          company_percentage?: number
          is_monetized?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "channels_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          }
        ]
      }
      clients: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
          vodafone_cash: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vodafone_cash?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          vodafone_cash?: string | null
        }
        Relationships: []
      }
      monthly_revenues: {
        Row: {
          channel_id: string
          client_percentage: number
          client_share: number | null
          company_share: number | null
          created_at: string
          id: string
          notes: string | null
          period_month: string
          total_revenue: number
          updated_at: string
          views: number
          invoice_id: string | null
          company_percentage: number
        }
        Insert: {
          channel_id: string
          client_percentage: number
          client_share?: number | null
          company_share?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month: string
          total_revenue?: number
          updated_at?: string
          views?: number
          invoice_id?: string | null
          company_percentage?: number
        }
        Update: {
          channel_id?: string
          client_percentage?: number
          client_share?: number | null
          company_share?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          period_month?: string
          total_revenue?: number
          updated_at?: string
          views?: number
          invoice_id?: string | null
          company_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_revenues_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_id: string | null
          transaction_date: string
          vodafone_transfer_no: string | null
          invoice_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_id?: string | null
          transaction_date?: string
          vodafone_transfer_no?: string | null
          invoice_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_id?: string | null
          transaction_date?: string
          vodafone_transfer_no?: string | null
          invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pt_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: {
          amount_paid: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string | null
          remaining: number
          revenue_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          vodafone_transfer_no: string | null
          invoice_id: string | null
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          remaining?: number
          revenue_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          vodafone_transfer_no?: string | null
          invoice_id?: string | null
        }
        Update: {
          amount_paid?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string | null
          remaining?: number
          revenue_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          vodafone_transfer_no?: string | null
          invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: true
            referencedRelation: "monthly_revenues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "p_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          vodafone_cash: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vodafone_cash?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          vodafone_cash?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          client_id: string
          status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled"
          issue_date: string
          due_date: string
          payment_date: string | null
          currency: string
          exchange_rate: number
          subtotal: number
          tax_rate: number
          tax_amount: number
          discount_rate: number
          discount_amount: number
          grand_total: number
          amount_paid: number
          remaining_balance: number
          company_name: string
          company_logo: string | null
          company_address: string | null
          company_phone: string | null
          company_email: string | null
          company_tax_no: string | null
          company_cr_no: string | null
          notes: string | null
          terms_conditions: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_number: string
          client_id: string
          status?: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled"
          issue_date?: string
          due_date: string
          payment_date?: string | null
          currency?: string
          exchange_rate?: number
          subtotal?: number
          tax_rate?: number
          tax_amount?: number
          discount_rate?: number
          discount_amount?: number
          grand_total?: number
          amount_paid?: number
          remaining_balance?: number
          company_name?: string
          company_logo?: string | null
          company_address?: string | null
          company_phone?: string | null
          company_email?: string | null
          company_tax_no?: string | null
          company_cr_no?: string | null
          notes?: string | null
          terms_conditions?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_number?: string
          client_id?: string
          status?: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled"
          issue_date?: string
          due_date?: string
          payment_date?: string | null
          currency?: string
          exchange_rate?: number
          subtotal?: number
          tax_rate?: number
          tax_amount?: number
          discount_rate?: number
          discount_amount?: number
          grand_total?: number
          amount_paid?: number
          remaining_balance?: number
          company_name?: string
          company_logo?: string | null
          company_address?: string | null
          company_phone?: string | null
          company_email?: string | null
          company_tax_no?: string | null
          company_cr_no?: string | null
          notes?: string | null
          terms_conditions?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      invoice_items: {
        Row: {
          id: string
          invoice_id: string
          channel_id: string | null
          revenue_id: string | null
          description: string
          views: number
          amount: number
          client_percentage: number | null
          client_share: number | null
          company_share: number | null
        }
        Insert: {
          id?: string
          invoice_id: string
          channel_id?: string | null
          revenue_id?: string | null
          description: string
          views?: number
          amount?: number
          client_percentage?: number | null
          client_share?: number | null
          company_share?: number | null
        }
        Update: {
          id?: string
          invoice_id?: string
          channel_id?: string | null
          revenue_id?: string | null
          description?: string
          views?: number
          amount?: number
          client_percentage?: number | null
          client_share?: number | null
          company_share?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "monthly_revenues"
            referencedColumns: ["id"]
          }
        ]
      }
      receipts: {
        Row: {
          id: string
          receipt_number: string
          invoice_id: string | null
          payment_transaction_id: string | null
          client_id: string
          amount: number
          payment_method: string
          receipt_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_number: string
          invoice_id?: string | null
          payment_transaction_id?: string | null
          client_id: string
          amount: number
          payment_method?: string
          receipt_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          receipt_number?: string
          invoice_id?: string | null
          payment_transaction_id?: string | null
          client_id?: string
          amount?: number
          payment_method?: string
          receipt_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      invoice_activity_logs: {
        Row: {
          id: string
          invoice_id: string
          action: string
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          action: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          action?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_activity_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      systems: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      recompute_payment: { Args: { _payment_id: string }; Returns: undefined }
      recompute_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      recompute_invoice_totals: { Args: { _invoice_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "employee" | "client"
      channel_status: "active" | "paused" | "suspended" | "closed"
      payment_status: "paid" | "unpaid" | "partial"
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
      app_role: ["admin", "employee", "client"],
      channel_status: ["active", "paused", "suspended", "closed"],
      payment_status: ["paid", "unpaid", "partial"],
    },
  },
} as const
