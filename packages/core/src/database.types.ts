// Hand-authored to match supabase/migrations/*.sql.
// Regenerate from a live DB with:
//   bunx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type BookingStatus =
  | 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type StayPackage = 'half_day' | 'daily' | 'weekly' | 'monthly';
export type RoomState = 'available' | 'occupied' | 'maintenance' | 'cleaning';

export type RoomType = {
  id: string;
  slug: string;
  name: string;
  name_id: string | null;
  description: string | null;
  description_id: string | null;
  size_sqm: number | null;
  max_occupancy: number;
  bed_config: string | null;
  price_half_day: number | null;
  price_daily: number | null;
  price_weekly: number | null;
  price_monthly: number | null;
  amenities: string[];
  images: string[];
  featured: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Room = {
  id: string;
  room_type_id: string;
  room_number: string;
  floor: number | null;
  state: RoomState;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type Booking = {
  id: string;
  reference: string;
  room_type_id: string;
  room_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_country: string | null;
  package: StayPackage;
  check_in: string;
  check_out: string;
  check_in_time: string | null;
  check_out_time: string | null;
  adults: number;
  children: number;
  nights: number | null;
  unit_price: number;
  quantity: number;
  total_price: number;
  currency: string;
  status: BookingStatus;
  special_requests: string | null;
  admin_notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  snap_token: string | null;
  snap_token_created_at: string | null;
}

export type ActivityLog = {
  id: number;
  action: string;
  category: string;
  message: string;
  actor: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type KeepAlive = {
  id: number;
  pinged_at: string;
  ping_count: number;
}

export type Admin = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
}

export type PropertySettings = {
  id: number;
  name: string;
  tagline_id: string;
  tagline_en: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  address_short: string;
  maps_url: string;
  maps_lat: number;
  maps_lng: number;
  check_in_time: string;
  check_out_time: string;
  updated_at: string;
}

type Row<T> = T;
type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;
type Update<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      room_types: {
        Row: Row<RoomType>;
        Insert: Insert<RoomType, 'id' | 'created_at' | 'updated_at' | 'name_id' | 'description' | 'description_id' | 'size_sqm' | 'max_occupancy' | 'bed_config' | 'price_half_day' | 'price_daily' | 'price_weekly' | 'price_monthly' | 'amenities' | 'images' | 'featured' | 'active' | 'sort_order'>;
        Update: Update<RoomType>;
        Relationships: [];
      };
      rooms: {
        Row: Row<Room>;
        Insert: Insert<Room, 'id' | 'created_at' | 'updated_at' | 'floor' | 'state' | 'notes' | 'active'>;
        Update: Update<Room>;
        Relationships: [];
      };
      bookings: {
        Row: Row<Booking>;
        Insert: Insert<Booking, 'id' | 'reference' | 'created_at' | 'updated_at' | 'room_id' | 'guest_country' | 'check_in_time' | 'check_out_time' | 'adults' | 'children' | 'nights' | 'unit_price' | 'quantity' | 'total_price' | 'currency' | 'status' | 'special_requests' | 'admin_notes' | 'source' | 'confirmed_at' | 'cancelled_at' | 'package' | 'snap_token' | 'snap_token_created_at'>;
        Update: Update<Booking>;
        Relationships: [];
      };
      activity_logs: {
        Row: Row<ActivityLog>;
        Insert: Insert<ActivityLog, 'id' | 'created_at' | 'category' | 'actor' | 'actor_id' | 'entity_type' | 'entity_id' | 'metadata'>;
        Update: Update<ActivityLog>;
        Relationships: [];
      };
      keep_alive: {
        Row: Row<KeepAlive>;
        Insert: Insert<KeepAlive, 'id' | 'pinged_at' | 'ping_count'>;
        Update: Update<KeepAlive>;
        Relationships: [];
      };
      admins: {
        Row: Row<Admin>;
        Insert: Insert<Admin, 'created_at' | 'full_name' | 'role'>;
        Update: Update<Admin>;
        Relationships: [];
      };
      property_settings: {
        Row: Row<PropertySettings>;
        Insert: Insert<PropertySettings, 'updated_at'>;
        Update: Update<PropertySettings>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      room_type_availability: {
        Args: { p_slug: string; p_check_in: string; p_check_out: string };
        Returns: { total: number; booked: number; available: number }[];
      };
      confirm_booking: {
        Args: { p_booking_id: string };
        Returns: Booking;
      };
    };
    Enums: {
      booking_status: BookingStatus;
      stay_package: StayPackage;
      room_state: RoomState;
    };
  };
}
