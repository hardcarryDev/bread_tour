// Supabase table types for the bread tour schema (SPEC-BREADTOUR-001).
//
// These are HAND-WRITTEN to match the SQL migrations under supabase/migrations/.
// Once a real Supabase project is linked, they can be regenerated with:
//   supabase gen types typescript --linked > src/types/database.ts
// (or --project-id <id>). Keep this file in sync with the migrations until then.
//
// Shape note: the `Database` type follows the structure expected by
// `createClient<Database>()` from @supabase/supabase-js (public.Tables.<name>
// with Row / Insert / Update, plus Enums and Functions), so the typed client,
// query builders, and RPC calls all get full inference.

// ---------------------------------------------------------------------------
// Enums (mirror the Postgres enum types in migration 1).
// ---------------------------------------------------------------------------
export type TourMemberRole = 'owner' | 'member';
export type TourInviteStatus = 'pending' | 'accepted' | 'rejected';
// Free text since migration 9 (20260620000500): members can enter any spot
// category, not just 빵집/음식점. Stored verbatim as the displayed label.
export type SpotKind = string;
export type StampMethod = 'auto' | 'manual';
export type ManualCheckInStatus = 'pending' | 'confirmed' | 'cancelled';

// ---------------------------------------------------------------------------
// Database generic.
// Row    = shape returned by SELECT.
// Insert = shape accepted by INSERT (columns with DB defaults are optional).
// Update = shape accepted by UPDATE (all optional).
// Server-managed columns (created_at, updated_at, arrived_at, and trigger-set
// stamps.tour_id) are typed optional on Insert and should not normally be set
// by the client -- the server/triggers own them (SPEC A6 / NFR-CONFLICT-001).
// ---------------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tours: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tour_members: {
        Row: {
          id: string;
          tour_id: string;
          user_id: string;
          role: TourMemberRole;
          joined_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          user_id: string;
          role?: TourMemberRole;
          joined_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          user_id?: string;
          role?: TourMemberRole;
          joined_at?: string;
        };
        Relationships: [];
      };
      tour_invites: {
        Row: {
          id: string;
          tour_id: string;
          invited_email: string | null;
          token: string;
          status: TourInviteStatus;
          invited_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          invited_email?: string | null;
          token?: string;
          status?: TourInviteStatus;
          invited_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          invited_email?: string | null;
          token?: string;
          status?: TourInviteStatus;
          invited_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      spots: {
        Row: {
          id: string;
          tour_id: string;
          name: string;
          kind: SpotKind;
          lat: number;
          lng: number;
          radius_m: number;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          name: string;
          kind?: SpotKind;
          lat: number;
          lng: number;
          radius_m?: number;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          name?: string;
          kind?: SpotKind;
          lat?: number;
          lng?: number;
          radius_m?: number;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // Per-tour selectable 종류 list (migration 10). Backs the "종류 추가"
      // button; spots.kind stores the chosen label as free text.
      spot_kinds: {
        Row: {
          id: string;
          tour_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          tour_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          tour_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      spot_menus: {
        Row: {
          id: string;
          spot_id: string;
          author_id: string;
          menu_text: string;
          // Attached photos: [{ path: storage object path, url: public URL }].
          // Optional in the type so older rows / test fixtures omit it; callers
          // treat a missing value as an empty list.
          images?: { path: string; url: string }[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          spot_id: string;
          author_id: string;
          menu_text: string;
          images?: { path: string; url: string }[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          spot_id?: string;
          author_id?: string;
          menu_text?: string;
          images?: { path: string; url: string }[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stamps: {
        Row: {
          id: string;
          spot_id: string;
          tour_id: string;
          user_id: string;
          method: StampMethod;
          arrived_at: string;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // tour_id is set by the sync_stamp_tour_id trigger from the spot, so it
        // is optional on insert; arrived_at defaults to server now() (A6).
        Insert: {
          id?: string;
          spot_id: string;
          tour_id?: string;
          user_id: string;
          method?: StampMethod;
          arrived_at?: string;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          spot_id?: string;
          tour_id?: string;
          user_id?: string;
          method?: StampMethod;
          arrived_at?: string;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      manual_checkin_requests: {
        Row: {
          id: string;
          spot_id: string;
          tour_id: string;
          requester_id: string;
          status: ManualCheckInStatus;
          confirmed_by: string | null;
          stamp_id: string | null;
          created_at: string;
          updated_at: string;
        };
        // tour_id is set by the sync_manual_checkin_tour_id trigger from the
        // spot, so it is optional on insert. confirmed_by / stamp_id are set by
        // the confirm_manual_checkin RPC, never by the client on insert.
        Insert: {
          id?: string;
          spot_id: string;
          tour_id?: string;
          requester_id: string;
          status?: ManualCheckInStatus;
          confirmed_by?: string | null;
          stamp_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          spot_id?: string;
          tour_id?: string;
          requester_id?: string;
          status?: ManualCheckInStatus;
          confirmed_by?: string | null;
          stamp_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // Per-spot bill settlement (정산). One row per spot. payer_ids /
      // participant_ids are member user_ids. tour_id is set by the
      // sync_settlement_tour_id trigger from the spot, so it is optional on
      // insert (mirrors stamps).
      spot_settlements: {
        Row: {
          id: string;
          spot_id: string;
          tour_id: string;
          amount: number;
          payer_ids: string[];
          participant_ids: string[];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          spot_id: string;
          tour_id?: string;
          amount?: number;
          payer_ids?: string[];
          participant_ids?: string[];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          spot_id?: string;
          tour_id?: string;
          amount?: number;
          payer_ids?: string[];
          participant_ids?: string[];
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Atomic visit-order renumber (REQ-F5-007 / D11). Returns void.
      reorder_spots: {
        Args: { p_tour_id: string; p_ordered_ids: string[] };
        Returns: undefined;
      };
      is_tour_member: {
        Args: { p_tour_id: string };
        Returns: boolean;
      };
      is_tour_owner: {
        Args: { p_tour_id: string };
        Returns: boolean;
      };
      // Atomic peer-confirmation: turns a pending manual check-in request into a
      // real stamp (REQ-F1-007 / AC-F1-04). Returns the created stamp id.
      confirm_manual_checkin: {
        Args: { p_request_id: string };
        Returns: string;
      };
      // Atomic invite acceptance (REQ-F6-003 / AC-F6-03, H-02): validate the
      // pending invite, insert the membership, and mark the invite accepted in
      // one transaction. Returns the joined tour id.
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: {
      tour_member_role: TourMemberRole;
      tour_invite_status: TourInviteStatus;
      spot_kind: SpotKind;
      stamp_method: StampMethod;
      manual_checkin_status: ManualCheckInStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ---------------------------------------------------------------------------
// Convenience row aliases for application code.
// ---------------------------------------------------------------------------
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Tour = Database['public']['Tables']['tours']['Row'];
export type TourMember = Database['public']['Tables']['tour_members']['Row'];
export type TourInvite = Database['public']['Tables']['tour_invites']['Row'];
export type Spot = Database['public']['Tables']['spots']['Row'];
export type SpotKindRow = Database['public']['Tables']['spot_kinds']['Row'];
export type SpotMenu = Database['public']['Tables']['spot_menus']['Row'];
export type Stamp = Database['public']['Tables']['stamps']['Row'];
export type SpotSettlement =
  Database['public']['Tables']['spot_settlements']['Row'];
export type ManualCheckInRequest =
  Database['public']['Tables']['manual_checkin_requests']['Row'];
