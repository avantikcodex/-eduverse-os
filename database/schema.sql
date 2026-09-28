create extension if not exists pgcrypto;

-- =========================
-- ENUMS
-- =========================

create type user_status as enum (
  'active',
  'suspended',
  'pending'
);

create type platform_user_role as enum (
  'student',
  'teacher',
  'admin'
);

create type admin_role_name as enum (
  'super_admin',
  'user_admin',
  'content_admin',
  'ai_admin',
  'support_admin',
  'auditor'
);

create type feedback_type as enum (
  'bug',
  'feature',
  'question',
  'general'
);

create type feedback_status as enum (
  'new',
  'reviewing',
  'planned',
  'resolved',
  'closed'
);

-- =========================
-- USERS
-- =========================

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role platform_user_role not null default 'student',
  status user_status not null default 'active',
  college text,
  course text,
  year text,
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- ADMIN ROLES
-- =========================

create table if not exists admin_roles (
  id uuid primary key default gen_random_uuid(),
  name admin_role_name unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text unique not null,
  description text
);

create table if not exists user_admin_roles (
  user_id uuid references users(id) on delete cascade,
  admin_role_id uuid references admin_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, admin_role_id)
);

create table if not exists admin_role_permissions (
  admin_role_id uuid references admin_roles(id) on delete cascade,
  permission_id uuid references permissions(id) on delete cascade,
  primary key (admin_role_id, permission_id)
);

-- =========================
-- ACADEMIC STRUCTURE
-- =========================

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  chapter_number integer,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(subject_id, chapter_number)
);

-- =========================
-- TEACHER MATERIALS
-- =========================

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete set null,
  uploaded_by uuid references users(id) on delete set null,
  filename text not null,
  storage_path text,
  mime_type text,
  file_size bigint,
  ai_indexed boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================
-- NOTICES
-- =========================

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id) on delete set null,
  title text not null,
  content text not null,
  priority text default 'normal',
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================
-- QUIZZES
-- =========================

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  chapter_id uuid references chapters(id) on delete set null,
  title text not null,
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  student_id uuid not null references users(id) on delete cascade,
  score numeric,
  total_questions integer,
  answers jsonb default '[]'::jsonb,
  completed_at timestamptz
);

-- =========================
-- STUDY PLANS
-- =========================

create table if not exists study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  title text not null,
  plan jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references users(id) on delete cascade,
  subject_id uuid references subjects(id) on delete cascade,
  chapter_id uuid references chapters(id) on delete cascade,
  progress_percent numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(student_id, chapter_id)
);

-- =========================
-- FEEDBACK
-- =========================

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  rating integer check (rating between 1 and 5),
  type feedback_type not null default 'general',
  title text,
  message text not null,
  page text,
  feature text,
  status feedback_status not null default 'new',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feedback_tags (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedback(id) on delete cascade,
  tag text not null,
  unique(feedback_id, tag)
);

-- =========================
-- FEATURE FLAGS
-- =========================

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  feature_key text unique not null,
  display_name text not null,
  enabled boolean not null default true,
  description text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- =========================
-- NOTIFICATIONS
-- =========================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================
-- AUDIT LOGS
-- =========================

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

-- =========================
-- SYSTEM SETTINGS
-- =========================

create table if not exists system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- =========================
-- SEED ADMIN ROLES
-- =========================

insert into admin_roles (name, description)
values
('super_admin', 'Full platform control'),
('user_admin', 'Manage students and teachers'),
('content_admin', 'Manage academic content'),
('ai_admin', 'Manage AI configuration'),
('support_admin', 'Manage feedback and support'),
('auditor', 'Read-only audit access')
on conflict (name) do nothing;

-- =========================
-- SEED FEATURES
-- =========================

insert into feature_flags
(feature_key, display_name, enabled, description)
values
('ai_tutor', 'AI Tutor', true, 'AI learning assistant'),
('pdf_upload', 'PDF Upload', true, 'Teacher material upload'),
('ai_quiz', 'AI Quiz', true, 'AI-generated quizzes'),
('study_plan', 'Study Plan', true, 'AI study planning'),
('smart_notice', 'Smart Notices', true, 'Notice task extraction'),
('web_search', 'Web Search', true, 'Current information search'),
('voice_tutor', 'Voice Tutor', false, 'Voice interaction'),
('analytics', 'Analytics', true, 'Platform analytics')
on conflict (feature_key) do nothing;