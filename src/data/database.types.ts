// GENERATED - do not edit by hand.
//
// Supabase's type generator, run against livewire-staging after the
// migrations in supabase/migrations were applied. Regenerate whenever a
// migration changes a table or a function (see README, "Database"); the test
// in tests/db/types.test.ts fails if a table or function here is missing.

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
      angler_private: {
        Row: {
          angler_code: string
          angler_id: string
          disqualified_at: string | null
          dq_reason: string
          emergency_name: string
          emergency_phone: string
          event_id: string
          full_name: string
          person_id: string | null
          phone: string
          resident: boolean | null
        }
        Insert: {
          angler_code: string
          angler_id: string
          disqualified_at?: string | null
          dq_reason?: string
          emergency_name?: string
          emergency_phone?: string
          event_id: string
          full_name: string
          person_id?: string | null
          phone?: string
          resident?: boolean | null
        }
        Update: {
          angler_code?: string
          angler_id?: string
          disqualified_at?: string | null
          dq_reason?: string
          emergency_name?: string
          emergency_phone?: string
          event_id?: string
          full_name?: string
          person_id?: string | null
          phone?: string
          resident?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "angler_private_angler_id_event_id_fkey"
            columns: ["angler_id", "event_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      anglers: {
        Row: {
          big_fish: boolean
          disqualified: boolean
          entry_id: string
          event_id: string
          handle: string
          id: string
          registered_at: string
          role: Database["public"]["Enums"]["angler_role"]
        }
        Insert: {
          big_fish?: boolean
          disqualified?: boolean
          entry_id: string
          event_id: string
          handle: string
          id: string
          registered_at?: string
          role: Database["public"]["Enums"]["angler_role"]
        }
        Update: {
          big_fish?: boolean
          disqualified?: boolean
          entry_id?: string
          event_id?: string
          handle?: string
          id?: string
          registered_at?: string
          role?: Database["public"]["Enums"]["angler_role"]
        }
        Relationships: [
          {
            foreignKeyName: "anglers_entry_id_event_id_fkey"
            columns: ["entry_id", "event_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      beacons: {
        Row: {
          accuracy_miles: number | null
          angler_id: string
          event_id: string
          id: string
          lat: number
          lng: number
          note: string
          position_at: string
          raised_at: string
          stood_down_at: string | null
          stood_down_by: string | null
        }
        Insert: {
          accuracy_miles?: number | null
          angler_id: string
          event_id: string
          id?: string
          lat: number
          lng: number
          note?: string
          position_at: string
          raised_at?: string
          stood_down_at?: string | null
          stood_down_by?: string | null
        }
        Update: {
          accuracy_miles?: number | null
          angler_id?: string
          event_id?: string
          id?: string
          lat?: number
          lng?: number
          note?: string
          position_at?: string
          raised_at?: string
          stood_down_at?: string | null
          stood_down_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beacons_angler_id_event_id_fkey"
            columns: ["angler_id", "event_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      bet_entries: {
        Row: {
          angler_id: string
          bet_id: string
          joined_at: string
        }
        Insert: {
          angler_id: string
          bet_id: string
          joined_at?: string
        }
        Update: {
          angler_id?: string
          bet_id?: string
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_entries_angler_id_fkey"
            columns: ["angler_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_entries_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          created_at: string
          creator_angler_id: string
          event_id: string
          id: string
          scoring: Database["public"]["Enums"]["bet_scoring"]
          settled_at: string | null
          stake: string
          title: string
          winner_angler_id: string | null
        }
        Insert: {
          created_at?: string
          creator_angler_id: string
          event_id: string
          id: string
          scoring: Database["public"]["Enums"]["bet_scoring"]
          settled_at?: string | null
          stake?: string
          title: string
          winner_angler_id?: string | null
        }
        Update: {
          created_at?: string
          creator_angler_id?: string
          event_id?: string
          id?: string
          scoring?: Database["public"]["Enums"]["bet_scoring"]
          settled_at?: string | null
          stake?: string
          title?: string
          winner_angler_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bets_creator_angler_id_fkey"
            columns: ["creator_angler_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_winner_angler_id_fkey"
            columns: ["winner_angler_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id"]
          },
        ]
      }
      catch_evidence: {
        Row: {
          accuracy_miles: number | null
          ai_review: Json | null
          boundary: Json | null
          captured_at: string | null
          catch_id: string
          clock_offset_ms: number | null
          filed_by: string | null
          filed_by_director: boolean
          lat: number | null
          lng: number | null
          photo_source: Database["public"]["Enums"]["photo_source"] | null
          precheck: Json | null
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          accuracy_miles?: number | null
          ai_review?: Json | null
          boundary?: Json | null
          captured_at?: string | null
          catch_id: string
          clock_offset_ms?: number | null
          filed_by?: string | null
          filed_by_director?: boolean
          lat?: number | null
          lng?: number | null
          photo_source?: Database["public"]["Enums"]["photo_source"] | null
          precheck?: Json | null
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          accuracy_miles?: number | null
          ai_review?: Json | null
          boundary?: Json | null
          captured_at?: string | null
          catch_id?: string
          clock_offset_ms?: number | null
          filed_by?: string | null
          filed_by_director?: boolean
          lat?: number | null
          lng?: number | null
          photo_source?: Database["public"]["Enums"]["photo_source"] | null
          precheck?: Json | null
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catch_evidence_catch_id_fkey"
            columns: ["catch_id"]
            isOneToOne: true
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
        ]
      }
      catches: {
        Row: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at: string
          species: string
          status: Database["public"]["Enums"]["catch_status"]
          updated_at: string
        }
        Insert: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at?: string
          species: string
          status?: Database["public"]["Enums"]["catch_status"]
          updated_at?: string
        }
        Update: {
          angler_id?: string
          division?: Database["public"]["Enums"]["division"]
          event_id?: string
          id?: string
          length_inches?: number
          logged_at?: string
          photo_path?: string
          received_at?: string
          species?: string
          status?: Database["public"]["Enums"]["catch_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catches_angler_id_event_id_fkey"
            columns: ["angler_id", "event_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      check_ins: {
        Row: {
          angler_id: string
          day: string
          event_id: string
          in_at: string | null
          out_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          angler_id: string
          day: string
          event_id: string
          in_at?: string | null
          out_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          angler_id?: string
          day?: string
          event_id?: string
          in_at?: string | null
          out_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_angler_id_event_id_fkey"
            columns: ["angler_id", "event_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "event_id"]
          },
          {
            foreignKeyName: "check_ins_event_id_day_fkey"
            columns: ["event_id", "day"]
            isOneToOne: false
            referencedRelation: "event_days"
            referencedColumns: ["event_id", "day"]
          },
        ]
      }
      donations: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          note: string
          target: Database["public"]["Enums"]["donation_target"]
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          event_id: string
          id: string
          note?: string
          target: Database["public"]["Enums"]["donation_target"]
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          note?: string
          target?: Database["public"]["Enums"]["donation_target"]
        }
        Relationships: [
          {
            foreignKeyName: "donations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          created_at: string
          division: Database["public"]["Enums"]["division"]
          entry_number: number
          event_id: string
          id: string
        }
        Insert: {
          created_at?: string
          division: Database["public"]["Enums"]["division"]
          entry_number: number
          event_id: string
          id: string
        }
        Update: {
          created_at?: string
          division?: Database["public"]["Enums"]["division"]
          entry_number?: number
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_devices: {
        Row: {
          added_at: string
          angler_id: string
          entry_id: string
          event_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          angler_id: string
          entry_id: string
          event_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          angler_id?: string
          entry_id?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_devices_angler_id_entry_id_fkey"
            columns: ["angler_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "entry_id"]
          },
          {
            foreignKeyName: "entry_devices_entry_id_event_id_fkey"
            columns: ["entry_id", "event_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      entry_private: {
        Row: {
          entry_id: string
          event_id: string
          fee_paid: boolean
          fee_paid_at: string | null
          team_code: string | null
        }
        Insert: {
          entry_id: string
          event_id: string
          fee_paid?: boolean
          fee_paid_at?: string | null
          team_code?: string | null
        }
        Update: {
          entry_id?: string
          event_id?: string
          fee_paid?: boolean
          fee_paid_at?: string | null
          team_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_private_entry_id_event_id_fkey"
            columns: ["entry_id", "event_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      event_days: {
        Row: {
          day: string
          event_id: string
        }
        Insert: {
          day: string
          event_id: string
        }
        Update: {
          day?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_days_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reports: {
        Row: {
          event_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          event_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          event_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_species: {
        Row: {
          event_id: string
          name: string
          position: number
          record_inches: number | null
        }
        Insert: {
          event_id: string
          name: string
          position?: number
          record_inches?: number | null
        }
        Update: {
          event_id?: string
          name?: string
          position?: number
          record_inches?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_species_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          archived: boolean
          awards_budget_cents: number
          course: Json
          course_label: string
          course_label_long: string
          created_at: string
          entry_prefix: string
          fee_big_fish_cents: number
          fee_solo_cents: number
          fee_team_cents: number
          final_check_in: string
          id: string
          is_current: boolean
          lines_in: string
          lines_out: string
          name: string
          payout_basis_points: number[]
          presenter: string
          registration_closes_at: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          awards_budget_cents?: number
          course?: Json
          course_label?: string
          course_label_long?: string
          created_at?: string
          entry_prefix: string
          fee_big_fish_cents?: number
          fee_solo_cents?: number
          fee_team_cents?: number
          final_check_in?: string
          id?: string
          is_current?: boolean
          lines_in?: string
          lines_out?: string
          name: string
          payout_basis_points?: number[]
          presenter?: string
          registration_closes_at: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          awards_budget_cents?: number
          course?: Json
          course_label?: string
          course_label_long?: string
          created_at?: string
          entry_prefix?: string
          fee_big_fish_cents?: number
          fee_solo_cents?: number
          fee_team_cents?: number
          final_check_in?: string
          id?: string
          is_current?: boolean
          lines_in?: string
          lines_out?: string
          name?: string
          payout_basis_points?: number[]
          presenter?: string
          registration_closes_at?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          angler_id: string | null
          body: string
          catch_id: string | null
          created_at: string
          event_id: string
          handle: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to: string | null
        }
        Insert: {
          angler_id?: string | null
          body?: string
          catch_id?: string | null
          created_at?: string
          event_id: string
          handle: string
          id: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to?: string | null
        }
        Update: {
          angler_id?: string | null
          body?: string
          catch_id?: string | null
          created_at?: string
          event_id?: string
          handle?: string
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_angler_id_fkey"
            columns: ["angler_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_catch_id_fkey"
            columns: ["catch_id"]
            isOneToOne: false
            referencedRelation: "catches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          accuracy_miles: number | null
          angler_id: string
          event_id: string
          lat: number
          lng: number
          recorded_at: string
          updated_at: string
        }
        Insert: {
          accuracy_miles?: number | null
          angler_id: string
          event_id: string
          lat: number
          lng: number
          recorded_at: string
          updated_at?: string
        }
        Update: {
          accuracy_miles?: number | null
          angler_id?: string
          event_id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_angler_id_event_id_fkey"
            columns: ["angler_id", "event_id"]
            isOneToOne: false
            referencedRelation: "anglers"
            referencedColumns: ["id", "event_id"]
          },
        ]
      }
      results: {
        Row: {
          event_id: string
          frozen_at: string
          frozen_by: string | null
          record: Json
        }
        Insert: {
          event_id: string
          frozen_at?: string
          frozen_by?: string | null
          record: Json
        }
        Update: {
          event_id?: string
          frozen_at?: string
          frozen_by?: string | null
          record?: Json
        }
        Relationships: [
          {
            foreignKeyName: "results_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      amend_catch_length: {
        Args: { p_id: string; p_length_inches: number }
        Returns: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at: string
          species: string
          status: Database["public"]["Enums"]["catch_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "catches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_in: {
        Args: { p_angler_id: string; p_at?: string; p_day: string }
        Returns: {
          angler_id: string
          day: string
          event_id: string
          in_at: string | null
          out_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_out: {
        Args: { p_angler_id: string; p_at?: string; p_day: string }
        Returns: {
          angler_id: string
          day: string
          event_id: string
          in_at: string | null
          out_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_entry: { Args: { p_code: string; p_phone: string }; Returns: Json }
      create_bet: {
        Args: {
          p_angler_id: string
          p_id: string
          p_scoring: Database["public"]["Enums"]["bet_scoring"]
          p_stake?: string
          p_title: string
        }
        Returns: {
          created_at: string
          creator_angler_id: string
          event_id: string
          id: string
          scoring: Database["public"]["Enums"]["bet_scoring"]
          settled_at: string | null
          stake: string
          title: string
          winner_angler_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_bet: { Args: { p_bet_id: string }; Returns: undefined }
      delete_message: { Args: { p_id: string }; Returns: undefined }
      director_archive_event: {
        Args: { p_archived: boolean; p_event_id: string }
        Returns: {
          archived: boolean
          awards_budget_cents: number
          course: Json
          course_label: string
          course_label_long: string
          created_at: string
          entry_prefix: string
          fee_big_fish_cents: number
          fee_solo_cents: number
          fee_team_cents: number
          final_check_in: string
          id: string
          is_current: boolean
          lines_in: string
          lines_out: string
          name: string
          payout_basis_points: number[]
          presenter: string
          registration_closes_at: string
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_clear_event: { Args: { p_event_id: string }; Returns: undefined }
      director_correct_catch: {
        Args: { p_id: string; p_length_inches: number; p_species: string }
        Returns: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at: string
          species: string
          status: Database["public"]["Enums"]["catch_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "catches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_delete_donation: { Args: { p_id: string }; Returns: undefined }
      director_delete_event: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      director_disqualify: {
        Args: { p_angler_id: string; p_reason: string }
        Returns: undefined
      }
      director_freeze_results: {
        Args: { p_event_id: string; p_record: Json }
        Returns: {
          event_id: string
          frozen_at: string
          frozen_by: string | null
          record: Json
        }
        SetofOptions: {
          from: "*"
          to: "results"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_record_donation: {
        Args: {
          p_amount_cents: number
          p_event_id: string
          p_id: string
          p_note?: string
          p_target: Database["public"]["Enums"]["donation_target"]
        }
        Returns: {
          amount_cents: number
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          note: string
          target: Database["public"]["Enums"]["donation_target"]
        }
        SetofOptions: {
          from: "*"
          to: "donations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_reinstate: { Args: { p_angler_id: string }; Returns: undefined }
      director_remove_entry: {
        Args: { p_entry_id: string }
        Returns: undefined
      }
      director_review_catch: {
        Args: {
          p_id: string
          p_note?: string
          p_status: Database["public"]["Enums"]["catch_status"]
        }
        Returns: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at: string
          species: string
          status: Database["public"]["Enums"]["catch_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "catches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_save_event: {
        Args: {
          p_awards_budget_cents?: number
          p_course?: Json
          p_course_label?: string
          p_course_label_long?: string
          p_days: string[]
          p_entry_prefix: string
          p_fee_big_fish_cents?: number
          p_fee_solo_cents?: number
          p_fee_team_cents?: number
          p_final_check_in?: string
          p_id: string
          p_lines_in?: string
          p_lines_out?: string
          p_name: string
          p_payout_basis_points?: number[]
          p_presenter?: string
          p_registration_closes_at: string
          p_time_zone: string
        }
        Returns: {
          archived: boolean
          awards_budget_cents: number
          course: Json
          course_label: string
          course_label_long: string
          created_at: string
          entry_prefix: string
          fee_big_fish_cents: number
          fee_solo_cents: number
          fee_team_cents: number
          final_check_in: string
          id: string
          is_current: boolean
          lines_in: string
          lines_out: string
          name: string
          payout_basis_points: number[]
          presenter: string
          registration_closes_at: string
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_save_report: {
        Args: { p_event_id: string; p_settings: Json }
        Returns: {
          event_id: string
          settings: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "event_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_set_ai_review: {
        Args: { p_id: string; p_review: Json }
        Returns: undefined
      }
      director_set_catch_boundary: {
        Args: { p_boundary: Json; p_id: string }
        Returns: undefined
      }
      director_set_check_in: {
        Args: {
          p_angler_id: string
          p_day: string
          p_in_at: string
          p_out_at: string
        }
        Returns: {
          angler_id: string
          day: string
          event_id: string
          in_at: string | null
          out_at: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_set_current_event: {
        Args: { p_event_id: string }
        Returns: {
          archived: boolean
          awards_budget_cents: number
          course: Json
          course_label: string
          course_label_long: string
          created_at: string
          entry_prefix: string
          fee_big_fish_cents: number
          fee_solo_cents: number
          fee_team_cents: number
          final_check_in: string
          id: string
          is_current: boolean
          lines_in: string
          lines_out: string
          name: string
          payout_basis_points: number[]
          presenter: string
          registration_closes_at: string
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      director_set_event_species: {
        Args: { p_event_id: string; p_species: Json }
        Returns: {
          event_id: string
          name: string
          position: number
          record_inches: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "event_species"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      director_set_fee_paid: {
        Args: { p_entry_id: string; p_paid: boolean }
        Returns: undefined
      }
      director_unfreeze_results: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      director_update_angler: {
        Args: {
          p_angler_id: string
          p_big_fish: boolean
          p_emergency_name: string
          p_emergency_phone: string
          p_full_name: string
          p_handle: string
          p_phone: string
          p_resident: boolean
        }
        Returns: undefined
      }
      file_catch: {
        Args: {
          p_accuracy_miles?: number
          p_angler_id: string
          p_boundary?: Json
          p_captured_at?: string
          p_clock_offset_ms?: number
          p_id: string
          p_lat?: number
          p_length_inches: number
          p_lng?: number
          p_logged_at: string
          p_photo_source?: Database["public"]["Enums"]["photo_source"]
          p_precheck?: Json
          p_species: string
        }
        Returns: {
          angler_id: string
          division: Database["public"]["Enums"]["division"]
          event_id: string
          id: string
          length_inches: number
          logged_at: string
          photo_path: string
          received_at: string
          species: string
          status: Database["public"]["Enums"]["catch_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "catches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_bet: {
        Args: { p_angler_id: string; p_bet_id: string }
        Returns: undefined
      }
      leave_bet: {
        Args: { p_angler_id: string; p_bet_id: string }
        Returns: undefined
      }
      leave_entry: { Args: { p_entry_id: string }; Returns: undefined }
      my_history_angler_ids: { Args: never; Returns: string[] }
      pool_counts: {
        Args: { p_event_id: string }
        Returns: {
          big_fish_paid: number
          solo_eligible: number
          solo_paid: number
          teams_eligible: number
          teams_paid: number
        }[]
      }
      post_message: {
        Args: {
          p_angler_id: string
          p_body: string
          p_catch_id?: string
          p_id: string
          p_reply_to?: string
        }
        Returns: {
          angler_id: string | null
          body: string
          catch_id: string | null
          created_at: string
          event_id: string
          handle: string
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      raise_beacon: {
        Args: {
          p_accuracy_miles?: number
          p_angler_id: string
          p_at?: string
          p_lat: number
          p_lng: number
          p_note?: string
        }
        Returns: {
          accuracy_miles: number | null
          angler_id: string
          event_id: string
          id: string
          lat: number
          lng: number
          note: string
          position_at: string
          raised_at: string
          stood_down_at: string | null
          stood_down_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "beacons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_position: {
        Args: {
          p_accuracy_miles?: number
          p_angler_id: string
          p_at?: string
          p_lat: number
          p_lng: number
        }
        Returns: {
          accuracy_miles: number | null
          angler_id: string
          event_id: string
          lat: number
          lng: number
          recorded_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "positions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_entry: {
        Args: {
          p_captain: Json
          p_division: Database["public"]["Enums"]["division"]
          p_entry_id: string
          p_event_id: string
          p_partner?: Json
        }
        Returns: Json
      }
      settle_bet: {
        Args: { p_bet_id: string; p_winner_angler_id: string }
        Returns: {
          created_at: string
          creator_angler_id: string
          event_id: string
          id: string
          scoring: Database["public"]["Enums"]["bet_scoring"]
          settled_at: string | null
          stake: string
          title: string
          winner_angler_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stand_down_beacon: { Args: { p_angler_id: string }; Returns: undefined }
      withdraw_catch: { Args: { p_id: string }; Returns: undefined }
    }
    Enums: {
      angler_role: "solo" | "captain" | "partner"
      bet_scoring: "smallest" | "most" | "first" | "manual"
      catch_status: "pending" | "approved" | "rejected"
      division: "solo" | "team"
      donation_target: "solo" | "team" | "big_fish" | "general"
      message_kind: "chat" | "catch"
      photo_source: "camera" | "upload"
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
      angler_role: ["solo", "captain", "partner"],
      bet_scoring: ["smallest", "most", "first", "manual"],
      catch_status: ["pending", "approved", "rejected"],
      division: ["solo", "team"],
      donation_target: ["solo", "team", "big_fish", "general"],
      message_kind: ["chat", "catch"],
      photo_source: ["camera", "upload"],
    },
  },
} as const
