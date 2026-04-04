-- Role enum for user hierarchy
CREATE TYPE public.user_role AS ENUM (
  'platform_admin',
  'org_admin',
  'centre_admin',
  'teacher',
  'student'
);

-- Organization type
CREATE TYPE public.org_type AS ENUM (
  'csr',
  'ngo'
);
