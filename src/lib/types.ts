export type MemoryCategory = "event" | "person" | "feeling" | "plan";
export type MessageRole = "user" | "partner";
export type MessageKind = "chat" | "reach_out" | "busy_note" | "voice_message" | "call";

export interface Profile {
  id: string;
  name: string;
  age_range: string;
  interests: string[];
  partner_id: string | null;
  timezone: string;
  day_offset: number;
  created_at: string;
}

export interface Message {
  id: string;
  user_id: string;
  partner_id: string;
  role: MessageRole;
  kind: MessageKind;
  content: string;
  /** On reach_out messages: the real person the partner encouraged the user to contact. */
  nudged_person?: string | null;
  sim_date: string;
  created_at: string;
}

export interface Memory {
  id: string;
  user_id: string;
  partner_id: string;
  category: MemoryCategory;
  content: string;
  event_date: string | null;
  importance: 1 | 2 | 3;
  followed_up: boolean;
  /** Real person in the user's life this memory involves (family, friend, neighbor), if any. */
  person_name: string | null;
  relationship: string | null;
  source_message_id: string | null;
  sim_date: string;
  created_at: string;
}

export interface ScheduleItem {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  activity: string;
  busy: boolean;
}

export interface Schedule {
  id: string;
  user_id: string;
  partner_id: string;
  sim_date: string;
  items: ScheduleItem[];
}
