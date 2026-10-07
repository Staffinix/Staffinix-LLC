export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          scopes: string[];
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          scopes?: string[];
          tenant_id?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string;
          revoked_at?: string | null;
          scopes?: string[];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          ip_address: string | null;
          metadata: Json;
          tenant_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          ip_address?: string | null;
          metadata?: Json;
          tenant_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_certifications: {
        Row: {
          candidate_id: string;
          created_at: string;
          credential_id: string | null;
          expires_date: string | null;
          id: string;
          issued_date: string | null;
          issuer: string | null;
          name: string;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          credential_id?: string | null;
          expires_date?: string | null;
          id?: string;
          issued_date?: string | null;
          issuer?: string | null;
          name: string;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          credential_id?: string | null;
          expires_date?: string | null;
          id?: string;
          issued_date?: string | null;
          issuer?: string | null;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_certifications_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_education: {
        Row: {
          candidate_id: string;
          created_at: string;
          degree: string | null;
          end_year: number | null;
          field: string | null;
          id: string;
          institution: string;
          start_year: number | null;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          degree?: string | null;
          end_year?: number | null;
          field?: string | null;
          id?: string;
          institution: string;
          start_year?: number | null;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          degree?: string | null;
          end_year?: number | null;
          field?: string | null;
          id?: string;
          institution?: string;
          start_year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_education_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_embeddings: {
        Row: {
          candidate_id: string;
          embedding: string;
          model: string;
          updated_at: string;
        };
        Insert: {
          candidate_id: string;
          embedding: string;
          model: string;
          updated_at?: string;
        };
        Update: {
          candidate_id?: string;
          embedding?: string;
          model?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_embeddings_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: true;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_employment: {
        Row: {
          candidate_id: string;
          company: string;
          created_at: string;
          description: string | null;
          end_date: string | null;
          id: string;
          is_current: boolean;
          location: string | null;
          start_date: string | null;
          title: string | null;
        };
        Insert: {
          candidate_id: string;
          company: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean;
          location?: string | null;
          start_date?: string | null;
          title?: string | null;
        };
        Update: {
          candidate_id?: string;
          company?: string;
          created_at?: string;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_current?: boolean;
          location?: string | null;
          start_date?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_employment_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_projects: {
        Row: {
          candidate_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          technologies: string[];
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          technologies?: string[];
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          technologies?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "candidate_projects_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_skills: {
        Row: {
          candidate_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          skill: string;
          years: number | null;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          skill: string;
          years?: number | null;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          skill?: string;
          years?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_skills_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_assignment_history: {
        Row: {
          candidate_id: string;
          changed_at: string;
          changed_by: string;
          id: string;
          new_recruiter_id: string;
          previous_recruiter_id: string | null;
          tenant_id: string;
        };
        Insert: {
          candidate_id: string;
          changed_at?: string;
          changed_by: string;
          id?: string;
          new_recruiter_id: string;
          previous_recruiter_id?: string | null;
          tenant_id: string;
        };
        Update: {
          candidate_id?: string;
          changed_at?: string;
          changed_by?: string;
          id?: string;
          new_recruiter_id?: string;
          previous_recruiter_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_assignment_history_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_status_history: {
        Row: {
          candidate_id: string;
          changed_at: string;
          changed_by: string;
          id: string;
          new_status: Database["public"]["Enums"]["candidate_status"];
          previous_status: Database["public"]["Enums"]["candidate_status"];
          tenant_id: string;
        };
        Insert: {
          candidate_id: string;
          changed_at?: string;
          changed_by: string;
          id?: string;
          new_status: Database["public"]["Enums"]["candidate_status"];
          previous_status: Database["public"]["Enums"]["candidate_status"];
          tenant_id: string;
        };
        Update: {
          candidate_id?: string;
          changed_at?: string;
          changed_by?: string;
          id?: string;
          new_status?: Database["public"]["Enums"]["candidate_status"];
          previous_status?: Database["public"]["Enums"]["candidate_status"];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_status_history_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          ai_notes: string | null;
          assigned_at: string | null;
          assigned_by: string | null;
          assigned_to: string | null;
          ats_score: number | null;
          availability: Database["public"]["Enums"]["availability_status"] | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          current_employer: string | null;
          current_title: string | null;
          email: string | null;
          experience_years: number | null;
          first_name: string;
          github_url: string | null;
          id: string;
          last_name: string;
          linkedin_url: string | null;
          last_submitted_at: string | null;
          last_submitted_by: string | null;
          location: string | null;
          marketing_types: string[];
          max_rate: number | null;
          min_rate: number | null;
          phone: string | null;
          portfolio_url: string | null;
          preferred_location: string | null;
          primary_technology: string | null;
          rate_type: Database["public"]["Enums"]["requirement_rate_type"] | null;
          ready_to_relocate: boolean | null;
          required_job: string | null;
          source: Database["public"]["Enums"]["requirement_source"];
          status: Database["public"]["Enums"]["candidate_status"];
          summary: string | null;
          tenant_id: string;
          updated_at: string;
          visa_status: string | null;
        };
        Insert: {
          ai_notes?: string | null;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          ats_score?: number | null;
          availability?: Database["public"]["Enums"]["availability_status"] | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_employer?: string | null;
          current_title?: string | null;
          email?: string | null;
          experience_years?: number | null;
          first_name: string;
          github_url?: string | null;
          id?: string;
          last_name: string;
          linkedin_url?: string | null;
          last_submitted_at?: string | null;
          last_submitted_by?: string | null;
          location?: string | null;
          marketing_types?: string[];
          max_rate?: number | null;
          min_rate?: number | null;
          phone?: string | null;
          portfolio_url?: string | null;
          preferred_location?: string | null;
          primary_technology?: string | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          ready_to_relocate?: boolean | null;
          required_job?: string | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          status?: Database["public"]["Enums"]["candidate_status"];
          summary?: string | null;
          tenant_id?: string;
          updated_at?: string;
          visa_status?: string | null;
        };
        Update: {
          ai_notes?: string | null;
          assigned_at?: string | null;
          assigned_by?: string | null;
          assigned_to?: string | null;
          ats_score?: number | null;
          availability?: Database["public"]["Enums"]["availability_status"] | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_employer?: string | null;
          current_title?: string | null;
          email?: string | null;
          experience_years?: number | null;
          first_name?: string;
          github_url?: string | null;
          id?: string;
          last_name?: string;
          linkedin_url?: string | null;
          last_submitted_at?: string | null;
          last_submitted_by?: string | null;
          location?: string | null;
          marketing_types?: string[];
          max_rate?: number | null;
          min_rate?: number | null;
          phone?: string | null;
          portfolio_url?: string | null;
          preferred_location?: string | null;
          primary_technology?: string | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          ready_to_relocate?: boolean | null;
          required_job?: string | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          status?: Database["public"]["Enums"]["candidate_status"];
          summary?: string | null;
          tenant_id?: string;
          updated_at?: string;
          visa_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          address: string | null;
          city: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          industry: string | null;
          msa_signed_at: string | null;
          name: string;
          notes: string | null;
          postal_code: string | null;
          state: string | null;
          status: Database["public"]["Enums"]["crm_status"];
          tax_id: string | null;
          tenant_id: string;
          tier: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industry?: string | null;
          msa_signed_at?: string | null;
          name: string;
          notes?: string | null;
          postal_code?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          tax_id?: string | null;
          tenant_id?: string;
          tier?: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          industry?: string | null;
          msa_signed_at?: string | null;
          name?: string;
          notes?: string | null;
          postal_code?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          tax_id?: string | null;
          tenant_id?: string;
          tier?: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_us: {
        Row: {
          created_at: string;
          description: string;
          email: string;
          id: string;
          name: string;
          phone_number: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          email: string;
          id?: string;
          name: string;
          phone_number: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          email?: string;
          id?: string;
          name?: string;
          phone_number?: string;
        };
        Relationships: [];
      };
      copilot_messages: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          role: string;
          sources: Json;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          role: string;
          sources?: Json;
          tenant_id?: string;
          user_id?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          role?: string;
          sources?: Json;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "copilot_messages_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "copilot_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      email_accounts: {
        Row: {
          created_at: string;
          email_address: string;
          encrypted_access_token: string;
          encrypted_refresh_token: string | null;
          id: string;
          last_sync_at: string | null;
          last_sync_error_code: string | null;
          provider: string;
          provider_account_id: string;
          status: string;
          sync_cursor: string | null;
          tenant_id: string;
          token_expires_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_address: string;
          encrypted_access_token: string;
          encrypted_refresh_token?: string | null;
          id?: string;
          last_sync_at?: string | null;
          last_sync_error_code?: string | null;
          provider: string;
          provider_account_id: string;
          status?: string;
          sync_cursor?: string | null;
          tenant_id: string;
          token_expires_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_address?: string;
          encrypted_access_token?: string;
          encrypted_refresh_token?: string | null;
          id?: string;
          last_sync_at?: string | null;
          last_sync_error_code?: string | null;
          provider?: string;
          provider_account_id?: string;
          status?: string;
          sync_cursor?: string | null;
          tenant_id?: string;
          token_expires_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_accounts_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_attachments: {
        Row: {
          created_at: string;
          filename: string;
          id: string;
          mime_type: string;
          provider_attachment_id: string;
          selected_email_id: string;
          size_bytes: number | null;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filename: string;
          id?: string;
          mime_type: string;
          provider_attachment_id: string;
          selected_email_id: string;
          size_bytes?: number | null;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filename?: string;
          id?: string;
          mime_type?: string;
          provider_attachment_id?: string;
          selected_email_id?: string;
          size_bytes?: number | null;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_attachments_selected_email_id_user_id_fkey";
            columns: ["selected_email_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "selected_emails";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "email_attachments_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_filter_rules: {
        Row: {
          ai_category: string | null;
          ai_enabled: boolean;
          ai_prompt: string | null;
          allowed_attachment_types: string[];
          body_keywords: string[];
          created_at: string;
          email_account_id: string;
          enabled: boolean;
          excluded_keywords: string[];
          id: string;
          match_mode: string;
          minimum_relevance_score: number;
          name: string;
          require_attachment: boolean;
          required_keywords: string[];
          sender_domains: string[];
          sender_emails: string[];
          subject_exact: string | null;
          subject_keywords: string[];
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_category?: string | null;
          ai_enabled?: boolean;
          ai_prompt?: string | null;
          allowed_attachment_types?: string[];
          body_keywords?: string[];
          created_at?: string;
          email_account_id: string;
          enabled?: boolean;
          excluded_keywords?: string[];
          id?: string;
          match_mode?: string;
          minimum_relevance_score?: number;
          name: string;
          require_attachment?: boolean;
          required_keywords?: string[];
          sender_domains?: string[];
          sender_emails?: string[];
          subject_exact?: string | null;
          subject_keywords?: string[];
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_category?: string | null;
          ai_enabled?: boolean;
          ai_prompt?: string | null;
          allowed_attachment_types?: string[];
          body_keywords?: string[];
          created_at?: string;
          email_account_id?: string;
          enabled?: boolean;
          excluded_keywords?: string[];
          id?: string;
          match_mode?: string;
          minimum_relevance_score?: number;
          name?: string;
          require_attachment?: boolean;
          required_keywords?: string[];
          sender_domains?: string[];
          sender_emails?: string[];
          subject_exact?: string | null;
          subject_keywords?: string[];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_filter_rules_email_account_id_user_id_fkey";
            columns: ["email_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "email_filter_rules_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_oauth_states: {
        Row: {
          created_at: string;
          encrypted_pkce_verifier: string;
          expires_at: string;
          id: string;
          provider: string;
          state_hash: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          encrypted_pkce_verifier: string;
          expires_at: string;
          id?: string;
          provider: string;
          state_hash: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          encrypted_pkce_verifier?: string;
          expires_at?: string;
          id?: string;
          provider?: string;
          state_hash?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_oauth_states_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_processing_logs: {
        Row: {
          created_at: string;
          email_account_id: string | null;
          error_code: string | null;
          id: number;
          matched_rule_id: string | null;
          processing_duration_ms: number;
          provider: string;
          provider_message_fingerprint: string | null;
          status: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_account_id?: string | null;
          error_code?: string | null;
          id?: never;
          matched_rule_id?: string | null;
          processing_duration_ms?: number;
          provider: string;
          provider_message_fingerprint?: string | null;
          status: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_account_id?: string | null;
          error_code?: string | null;
          id?: never;
          matched_rule_id?: string | null;
          processing_duration_ms?: number;
          provider?: string;
          provider_message_fingerprint?: string | null;
          status?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_processing_logs_email_account_id_user_id_fkey";
            columns: ["email_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "email_processing_logs_matched_rule_id_user_id_fkey";
            columns: ["matched_rule_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_filter_rules";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "email_processing_logs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sync_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          email_account_id: string;
          error_code: string | null;
          id: string;
          scheduled_at: string;
          started_at: string | null;
          status: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          email_account_id: string;
          error_code?: string | null;
          id?: string;
          scheduled_at?: string;
          started_at?: string | null;
          status?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          email_account_id?: string;
          error_code?: string | null;
          id?: string;
          scheduled_at?: string;
          started_at?: string | null;
          status?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_sync_jobs_email_account_id_user_id_fkey";
            columns: ["email_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "email_sync_jobs_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          ai_summary: string | null;
          created_at: string;
          created_by: string | null;
          duration_minutes: number | null;
          feedback: string | null;
          id: string;
          interviewer_email: string | null;
          interviewer_name: string | null;
          location: string | null;
          meeting_link: string | null;
          notes: string | null;
          outcome: Database["public"]["Enums"]["interview_outcome"];
          round: Database["public"]["Enums"]["interview_round"];
          scheduled_at: string | null;
          score: number | null;
          submission_id: string;
          tenant_id: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          ai_summary?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number | null;
          feedback?: string | null;
          id?: string;
          interviewer_email?: string | null;
          interviewer_name?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          notes?: string | null;
          outcome?: Database["public"]["Enums"]["interview_outcome"];
          round?: Database["public"]["Enums"]["interview_round"];
          scheduled_at?: string | null;
          score?: number | null;
          submission_id: string;
          tenant_id?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          ai_summary?: string | null;
          created_at?: string;
          created_by?: string | null;
          duration_minutes?: number | null;
          feedback?: string | null;
          id?: string;
          interviewer_email?: string | null;
          interviewer_name?: string | null;
          location?: string | null;
          meeting_link?: string | null;
          notes?: string | null;
          outcome?: Database["public"]["Enums"]["interview_outcome"];
          round?: Database["public"]["Enums"]["interview_round"];
          scheduled_at?: string | null;
          score?: number | null;
          submission_id?: string;
          tenant_id?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interviews_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      placements: {
        Row: {
          bill_rate: number | null;
          candidate_id: string;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          end_date: string | null;
          id: string;
          margin: number | null;
          notes: string | null;
          pay_rate: number | null;
          rate_type: Database["public"]["Enums"]["requirement_rate_type"] | null;
          requirement_id: string;
          start_date: string | null;
          status: Database["public"]["Enums"]["placement_status"];
          submission_id: string;
          tenant_id: string;
          updated_at: string;
          vendor_id: string | null;
        };
        Insert: {
          bill_rate?: number | null;
          candidate_id: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          end_date?: string | null;
          id?: string;
          margin?: number | null;
          notes?: string | null;
          pay_rate?: number | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          requirement_id: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["placement_status"];
          submission_id: string;
          tenant_id?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          bill_rate?: number | null;
          candidate_id?: string;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          end_date?: string | null;
          id?: string;
          margin?: number | null;
          notes?: string | null;
          pay_rate?: number | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          requirement_id?: string;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["placement_status"];
          submission_id?: string;
          tenant_id?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "placements_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "placements_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_access_requests: {
        Row: {
          created_at: string;
          id: string;
          reason: string | null;
          requested_role: Database["public"]["Enums"]["platform_role"];
          review_note: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database["public"]["Enums"]["access_request_status"];
          tenant_id: string | null;
          updated_at: string;
          user_email: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          reason?: string | null;
          requested_role?: Database["public"]["Enums"]["platform_role"];
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["access_request_status"];
          tenant_id?: string | null;
          updated_at?: string;
          user_email?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          reason?: string | null;
          requested_role?: Database["public"]["Enums"]["platform_role"];
          review_note?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database["public"]["Enums"]["access_request_status"];
          tenant_id?: string | null;
          updated_at?: string;
          user_email?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_access_requests_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          is_active: boolean;
          phone: string | null;
          tenant_id: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          is_active?: boolean;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          phone?: string | null;
          tenant_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      requirement_embeddings: {
        Row: {
          embedding: string;
          model: string;
          requirement_id: string;
          updated_at: string;
        };
        Insert: {
          embedding: string;
          model: string;
          requirement_id: string;
          updated_at?: string;
        };
        Update: {
          embedding?: string;
          model?: string;
          requirement_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requirement_embeddings_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: true;
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      requirement_skills: {
        Row: {
          created_at: string;
          id: string;
          is_mandatory: boolean;
          requirement_id: string;
          skill: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_mandatory?: boolean;
          requirement_id: string;
          skill: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_mandatory?: boolean;
          requirement_id?: string;
          skill?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requirement_skills_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      requirements: {
        Row: {
          assigned_at: string | null;
          assigned_to: string | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string | null;
          duration: string | null;
          id: string;
          jd_file_url: string | null;
          location: string | null;
          max_experience_years: number | null;
          min_experience_years: number | null;
          primary_technology: string | null;
          priority: Database["public"]["Enums"]["requirement_priority"];
          rate_max: number | null;
          rate_min: number | null;
          rate_type: Database["public"]["Enums"]["requirement_rate_type"] | null;
          recruiter_notes: string | null;
          source: Database["public"]["Enums"]["requirement_source"];
          status: Database["public"]["Enums"]["requirement_status"];
          tenant_id: string;
          title: string;
          updated_at: string;
          vendor_id: string | null;
          visa_types: string[];
          work_mode: Database["public"]["Enums"]["requirement_work_mode"] | null;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          duration?: string | null;
          id?: string;
          jd_file_url?: string | null;
          location?: string | null;
          max_experience_years?: number | null;
          min_experience_years?: number | null;
          primary_technology?: string | null;
          priority?: Database["public"]["Enums"]["requirement_priority"];
          rate_max?: number | null;
          rate_min?: number | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          recruiter_notes?: string | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          status?: Database["public"]["Enums"]["requirement_status"];
          tenant_id?: string;
          title: string;
          updated_at?: string;
          vendor_id?: string | null;
          visa_types?: string[];
          work_mode?: Database["public"]["Enums"]["requirement_work_mode"] | null;
        };
        Update: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string | null;
          duration?: string | null;
          id?: string;
          jd_file_url?: string | null;
          location?: string | null;
          max_experience_years?: number | null;
          min_experience_years?: number | null;
          primary_technology?: string | null;
          priority?: Database["public"]["Enums"]["requirement_priority"];
          rate_max?: number | null;
          rate_min?: number | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          recruiter_notes?: string | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          status?: Database["public"]["Enums"]["requirement_status"];
          tenant_id?: string;
          title?: string;
          updated_at?: string;
          vendor_id?: string | null;
          visa_types?: string[];
          work_mode?: Database["public"]["Enums"]["requirement_work_mode"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "requirements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      resume_versions: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          ats_score: number | null;
          candidate_id: string;
          claim_validation: Json;
          created_at: string;
          created_by: string | null;
          file_path: string | null;
          id: string;
          match_score: number | null;
          notes: string | null;
          requirement_id: string | null;
          source_facts: Json;
          source_hash: string | null;
          source_resume_id: string | null;
          status: string;
          tailored_content: string | null;
          tailored_summary: string | null;
          version_no: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          ats_score?: number | null;
          candidate_id: string;
          claim_validation?: Json;
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          match_score?: number | null;
          notes?: string | null;
          requirement_id?: string | null;
          source_facts?: Json;
          source_hash?: string | null;
          source_resume_id?: string | null;
          status?: string;
          tailored_content?: string | null;
          tailored_summary?: string | null;
          version_no?: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          ats_score?: number | null;
          candidate_id?: string;
          claim_validation?: Json;
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          match_score?: number | null;
          notes?: string | null;
          requirement_id?: string | null;
          source_facts?: Json;
          source_hash?: string | null;
          source_resume_id?: string | null;
          status?: string;
          tailored_content?: string | null;
          tailored_summary?: string | null;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resume_versions_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_versions_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resume_versions_source_resume_id_fkey";
            columns: ["source_resume_id"];
            isOneToOne: false;
            referencedRelation: "resumes";
            referencedColumns: ["id"];
          },
        ];
      };
      resumes: {
        Row: {
          candidate_id: string;
          created_at: string;
          extracted_text: string | null;
          file_name: string;
          file_path: string;
          id: string;
          is_primary: boolean;
          mime_type: string | null;
          size_bytes: number | null;
          source: Database["public"]["Enums"]["requirement_source"];
          tenant_id: string;
          uploaded_by: string | null;
          verification_status: string;
          verified_at: string | null;
          verified_by: string | null;
          verified_facts_hash: string | null;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          extracted_text?: string | null;
          file_name: string;
          file_path: string;
          id?: string;
          is_primary?: boolean;
          mime_type?: string | null;
          size_bytes?: number | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          tenant_id: string;
          uploaded_by?: string | null;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          verified_facts_hash?: string | null;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          extracted_text?: string | null;
          file_name?: string;
          file_path?: string;
          id?: string;
          is_primary?: boolean;
          mime_type?: string | null;
          size_bytes?: number | null;
          source?: Database["public"]["Enums"]["requirement_source"];
          tenant_id?: string;
          uploaded_by?: string | null;
          verification_status?: string;
          verified_at?: string | null;
          verified_by?: string | null;
          verified_facts_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "resumes_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resumes_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      selected_emails: {
        Row: {
          ai_category: string | null;
          ai_confidence: number | null;
          created_at: string;
          email_account_id: string;
          has_attachments: boolean;
          id: string;
          match_checks: Json;
          match_reasons: string[];
          matched_rule_id: string | null;
          preview: string;
          provider_message_id: string;
          provider_thread_id: string | null;
          received_at: string;
          recipient_emails: string[];
          relevance_score: number;
          sender_email: string;
          sender_name: string | null;
          subject: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          ai_category?: string | null;
          ai_confidence?: number | null;
          created_at?: string;
          email_account_id: string;
          has_attachments?: boolean;
          id?: string;
          match_checks?: Json;
          match_reasons?: string[];
          matched_rule_id?: string | null;
          preview?: string;
          provider_message_id: string;
          provider_thread_id?: string | null;
          received_at: string;
          recipient_emails?: string[];
          relevance_score: number;
          sender_email: string;
          sender_name?: string | null;
          subject?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          ai_category?: string | null;
          ai_confidence?: number | null;
          created_at?: string;
          email_account_id?: string;
          has_attachments?: boolean;
          id?: string;
          match_checks?: Json;
          match_reasons?: string[];
          matched_rule_id?: string | null;
          preview?: string;
          provider_message_id?: string;
          provider_thread_id?: string | null;
          received_at?: string;
          recipient_emails?: string[];
          relevance_score?: number;
          sender_email?: string;
          sender_name?: string | null;
          subject?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "selected_emails_email_account_id_user_id_fkey";
            columns: ["email_account_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_accounts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "selected_emails_matched_rule_id_user_id_fkey";
            columns: ["matched_rule_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "email_filter_rules";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "selected_emails_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      submission_events: {
        Row: {
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          event_type: Database["public"]["Enums"]["submission_event_type"];
          from_stage: Database["public"]["Enums"]["submission_stage"] | null;
          id: string;
          message: string | null;
          metadata: Json | null;
          submission_id: string;
          to_stage: Database["public"]["Enums"]["submission_stage"] | null;
        };
        Insert: {
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          event_type: Database["public"]["Enums"]["submission_event_type"];
          from_stage?: Database["public"]["Enums"]["submission_stage"] | null;
          id?: string;
          message?: string | null;
          metadata?: Json | null;
          submission_id: string;
          to_stage?: Database["public"]["Enums"]["submission_stage"] | null;
        };
        Update: {
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["submission_event_type"];
          from_stage?: Database["public"]["Enums"]["submission_stage"] | null;
          id?: string;
          message?: string | null;
          metadata?: Json | null;
          submission_id?: string;
          to_stage?: Database["public"]["Enums"]["submission_stage"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "submission_events_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          candidate_id: string;
          candidate_status_at_submission: Database["public"]["Enums"]["candidate_status"] | null;
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          email_body: string | null;
          email_cc: string | null;
          email_sent_at: string | null;
          email_subject: string | null;
          email_to: string | null;
          id: string;
          match_gaps: string[] | null;
          match_score: number | null;
          match_strengths: string[] | null;
          notes: string | null;
          rate_type: Database["public"]["Enums"]["requirement_rate_type"] | null;
          rejected_reason: string | null;
          requirement_id: string;
          resume_version_id: string | null;
          stage: Database["public"]["Enums"]["submission_stage"];
          submitted_at: string | null;
          submitted_by: string | null;
          submitted_rate: number | null;
          tenant_id: string;
          updated_at: string;
          vendor_id: string | null;
        };
        Insert: {
          candidate_id: string;
          candidate_status_at_submission?: Database["public"]["Enums"]["candidate_status"] | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          email_body?: string | null;
          email_cc?: string | null;
          email_sent_at?: string | null;
          email_subject?: string | null;
          email_to?: string | null;
          id?: string;
          match_gaps?: string[] | null;
          match_score?: number | null;
          match_strengths?: string[] | null;
          notes?: string | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          rejected_reason?: string | null;
          requirement_id: string;
          resume_version_id?: string | null;
          stage?: Database["public"]["Enums"]["submission_stage"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          submitted_rate?: number | null;
          tenant_id?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Update: {
          candidate_id?: string;
          candidate_status_at_submission?: Database["public"]["Enums"]["candidate_status"] | null;
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          email_body?: string | null;
          email_cc?: string | null;
          email_sent_at?: string | null;
          email_subject?: string | null;
          email_to?: string | null;
          id?: string;
          match_gaps?: string[] | null;
          match_score?: number | null;
          match_strengths?: string[] | null;
          notes?: string | null;
          rate_type?: Database["public"]["Enums"]["requirement_rate_type"] | null;
          rejected_reason?: string | null;
          requirement_id?: string;
          resume_version_id?: string | null;
          stage?: Database["public"]["Enums"]["submission_stage"];
          submitted_at?: string | null;
          submitted_by?: string | null;
          submitted_rate?: number | null;
          tenant_id?: string;
          updated_at?: string;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_requirement_id_fkey";
            columns: ["requirement_id"];
            isOneToOne: false;
            referencedRelation: "requirements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_resume_version_id_fkey";
            columns: ["resume_version_id"];
            isOneToOne: false;
            referencedRelation: "resume_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      tenants: {
        Row: {
          admin_contact_email: string | null;
          admin_contact_name: string | null;
          admin_contact_phone: string | null;
          company_address: string | null;
          created_at: string;
          id: string;
          industry: string | null;
          logo_url: string | null;
          name: string;
          owner_contact_email: string | null;
          owner_contact_name: string | null;
          owner_contact_phone: string | null;
          plan: Database["public"]["Enums"]["tenant_plan"];
          primary_contact_email: string | null;
          seat_limit: number;
          slug: string;
          status: Database["public"]["Enums"]["tenant_status"];
          tax_id: string | null;
          trial_ends_at: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          admin_contact_email?: string | null;
          admin_contact_name?: string | null;
          admin_contact_phone?: string | null;
          company_address?: string | null;
          created_at?: string;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name: string;
          owner_contact_email?: string | null;
          owner_contact_name?: string | null;
          owner_contact_phone?: string | null;
          plan?: Database["public"]["Enums"]["tenant_plan"];
          primary_contact_email?: string | null;
          seat_limit?: number;
          slug: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          tax_id?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          admin_contact_email?: string | null;
          admin_contact_name?: string | null;
          admin_contact_phone?: string | null;
          company_address?: string | null;
          created_at?: string;
          id?: string;
          industry?: string | null;
          logo_url?: string | null;
          name?: string;
          owner_contact_email?: string | null;
          owner_contact_name?: string | null;
          owner_contact_phone?: string | null;
          plan?: Database["public"]["Enums"]["tenant_plan"];
          primary_contact_email?: string | null;
          seat_limit?: number;
          slug?: string;
          status?: Database["public"]["Enums"]["tenant_status"];
          tax_id?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vendors: {
        Row: {
          address: string | null;
          city: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_role: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          linkedin_id: string | null;
          msa_signed_at: string | null;
          name: string;
          notes: string | null;
          payment_terms_days: number | null;
          postal_code: string | null;
          state: string | null;
          status: Database["public"]["Enums"]["crm_status"];
          tax_id: string | null;
          tenant_id: string;
          tier: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          city?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          linkedin_id?: string | null;
          msa_signed_at?: string | null;
          name: string;
          notes?: string | null;
          payment_terms_days?: number | null;
          postal_code?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          tax_id?: string | null;
          tenant_id?: string;
          tier?: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          city?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          linkedin_id?: string | null;
          msa_signed_at?: string | null;
          name?: string;
          notes?: string | null;
          payment_terms_days?: number | null;
          postal_code?: string | null;
          state?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          tax_id?: string | null;
          tenant_id?: string;
          tier?: Database["public"]["Enums"]["crm_tier"] | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vendors_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_settings: {
        Row: {
          auto_draft_submission_email: boolean;
          auto_match_on_requirement: boolean;
          auto_parse_resumes: boolean;
          created_at: string;
          id: string;
          interview_reminders: boolean;
          match_score_threshold: number;
          tenant_id: string;
          updated_at: string;
          webhook_url: string | null;
        };
        Insert: {
          auto_draft_submission_email?: boolean;
          auto_match_on_requirement?: boolean;
          auto_parse_resumes?: boolean;
          created_at?: string;
          id?: string;
          interview_reminders?: boolean;
          match_score_threshold?: number;
          tenant_id?: string;
          updated_at?: string;
          webhook_url?: string | null;
        };
        Update: {
          auto_draft_submission_email?: boolean;
          auto_match_on_requirement?: boolean;
          auto_parse_resumes?: boolean;
          created_at?: string;
          id?: string;
          interview_reminders?: boolean;
          match_score_threshold?: number;
          tenant_id?: string;
          updated_at?: string;
          webhook_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_settings_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: true;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_candidates_to_recruiter: {
        Args: { _candidate_ids: string[]; _recruiter_id: string };
        Returns: {
          assigned_at: string;
          candidate_id: string;
          previous_recruiter_id: string | null;
          recruiter_id: string;
        }[];
      };
      authorize_resume_upload: {
        Args: { _upload_id: string };
        Returns: {
          file_name: string;
          mime_type: string;
          size_bytes: number;
          staging_path: string;
          upload_id: string;
        }[];
      };
      candidate_assignment_kpis: { Args: never; Returns: Json };
      claim_candidate_embedding_jobs: {
        Args: { _limit?: number };
        Returns: {
          attempts: number;
          candidate_id: string;
          job_id: string;
        }[];
      };
      complete_candidate_embedding_job: {
        Args: { _job_id: string };
        Returns: undefined;
      };
      create_candidate_graph: {
        Args: {
          _candidate: Json;
          _certifications?: Json;
          _education?: Json;
          _employment?: Json;
          _projects?: Json;
          _resume?: Json;
          _skills?: Json;
        };
        Returns: {
          candidate_id: string;
        }[];
      };
      create_candidate_graph_from_resume_upload: {
        Args: {
          _candidate: Json;
          _certifications?: Json;
          _education?: Json;
          _employment?: Json;
          _extracted_text?: string;
          _projects?: Json;
          _resume_upload_id: string;
          _skills?: Json;
        };
        Returns: {
          candidate_id: string;
          resume_path: string;
        }[];
      };
      current_tenant_id: { Args: never; Returns: string };
      dashboard_overview: { Args: never; Returns: Json };
      fail_candidate_embedding_job: {
        Args: { _error: string; _job_id: string };
        Returns: undefined;
      };
      get_role_level: { Args: { _user_id: string }; Returns: string };
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_company_admin: { Args: { _user_id: string }; Returns: boolean };
      is_developer_admin: { Args: { _user_id: string }; Returns: boolean };
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean };
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean };
      is_recruiter: { Args: { _user_id: string }; Returns: boolean };
      issue_resume_upload: {
        Args: { _file_name: string; _mime_type: string; _size_bytes: number };
        Returns: {
          file_name: string;
          mime_type: string;
          staging_path: string;
          upload_id: string;
        }[];
      };
      match_candidates_for_requirement: {
        Args: { _limit?: number; _requirement_id: string };
        Returns: {
          candidate_id: string;
          similarity: number;
        }[];
      };
      match_requirements_for_candidate: {
        Args: { _candidate_id: string; _limit?: number };
        Returns: {
          requirement_id: string;
          similarity: number;
        }[];
      };
      mark_candidate_placed_from_submission: {
        Args: { _submission_id: string };
        Returns: {
          candidate_id: string;
          previous_status: Database["public"]["Enums"]["candidate_status"];
          updated_at: string;
        }[];
      };
      platform_console_overview: { Args: never; Returns: Json };
      reserve_ai_usage: { Args: { _operation: string }; Returns: Json };
      search_candidates_semantic: {
        Args: { _limit?: number; _query_embedding: string };
        Returns: {
          candidate_id: string;
          similarity: number;
        }[];
      };
      update_candidate_status: {
        Args: {
          _candidate_id: string;
          _expected_updated_at: string;
          _new_status: Database["public"]["Enums"]["candidate_status"];
        };
        Returns: {
          candidate_id: string;
          new_status: Database["public"]["Enums"]["candidate_status"];
          previous_status: Database["public"]["Enums"]["candidate_status"];
          updated_at: string;
        }[];
      };
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: undefined;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: {
      access_request_status: "pending" | "approved" | "denied";
      app_role:
        | "super_admin"
        | "admin"
        | "recruiter"
        | "account_manager"
        | "delivery_manager"
        | "marketing_executive"
        | "developer_admin";
      availability_status: "immediate" | "two_weeks" | "one_month" | "negotiable" | "unavailable";
      candidate_status: "active" | "submitted" | "placed" | "on_hold" | "inactive";
      crm_status: "prospect" | "active" | "inactive";
      crm_tier: "a" | "b" | "c";
      interview_outcome:
        "scheduled" | "completed" | "passed" | "failed" | "no_show" | "rescheduled" | "cancelled";
      interview_round:
        "screen" | "l1" | "l2" | "manager" | "client" | "technical" | "final" | "other";
      placement_status: "active" | "ended" | "terminated" | "extended";
      platform_role: "platform_owner" | "platform_admin" | "platform_support";
      requirement_priority: "low" | "medium" | "high" | "urgent";
      requirement_rate_type: "hourly" | "annual" | "monthly";
      requirement_source: "manual" | "paste" | "pdf" | "docx" | "email";
      requirement_status: "open" | "assigned" | "closed" | "expired";
      requirement_work_mode: "onsite" | "remote" | "hybrid";
      submission_event_type:
        | "created"
        | "stage_changed"
        | "email_drafted"
        | "email_sent"
        | "note_added"
        | "interview_scheduled"
        | "interview_updated"
        | "offer_extended"
        | "placed"
        | "rejected"
        | "withdrawn";
      submission_stage:
        | "draft"
        | "submitted"
        | "vendor_review"
        | "client_review"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
        | "withdrawn";
      tenant_plan: "trial" | "starter" | "growth" | "enterprise";
      tenant_status: "active" | "trialing" | "suspended" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_request_status: ["pending", "approved", "denied"],
      app_role: [
        "super_admin",
        "admin",
        "recruiter",
        "account_manager",
        "delivery_manager",
        "marketing_executive",
        "developer_admin",
      ],
      availability_status: ["immediate", "two_weeks", "one_month", "negotiable", "unavailable"],
      candidate_status: ["active", "submitted", "placed", "on_hold", "inactive"],
      crm_status: ["prospect", "active", "inactive"],
      crm_tier: ["a", "b", "c"],
      interview_outcome: [
        "scheduled",
        "completed",
        "passed",
        "failed",
        "no_show",
        "rescheduled",
        "cancelled",
      ],
      interview_round: ["screen", "l1", "l2", "manager", "client", "technical", "final", "other"],
      placement_status: ["active", "ended", "terminated", "extended"],
      platform_role: ["platform_owner", "platform_admin", "platform_support"],
      requirement_priority: ["low", "medium", "high", "urgent"],
      requirement_rate_type: ["hourly", "annual", "monthly"],
      requirement_source: ["manual", "paste", "pdf", "docx", "email"],
      requirement_status: ["open", "assigned", "closed", "expired"],
      requirement_work_mode: ["onsite", "remote", "hybrid"],
      submission_event_type: [
        "created",
        "stage_changed",
        "email_drafted",
        "email_sent",
        "note_added",
        "interview_scheduled",
        "interview_updated",
        "offer_extended",
        "placed",
        "rejected",
        "withdrawn",
      ],
      submission_stage: [
        "draft",
        "submitted",
        "vendor_review",
        "client_review",
        "interview",
        "offer",
        "hired",
        "rejected",
        "withdrawn",
      ],
      tenant_plan: ["trial", "starter", "growth", "enterprise"],
      tenant_status: ["active", "trialing", "suspended", "cancelled"],
    },
  },
} as const;
