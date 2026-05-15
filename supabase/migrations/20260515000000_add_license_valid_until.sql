-- Add license_valid_until to organizations, centres, and profiles.
-- NULL means no expiry (backward compatible with existing rows).
-- Resolution order: profile → centre → organization → unlimited.

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS license_valid_until date;

ALTER TABLE public.centres
ADD COLUMN IF NOT EXISTS license_valid_until date;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS license_valid_until date;

-- RPC function that resolves the effective licence expiry for a given user.
-- Returns { valid, expires_at, days_remaining }.
CREATE OR REPLACE FUNCTION public.validate_license(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_expiry   date;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'profile_not_found');
  END IF;

  -- Cascade: user → centre → organization
  v_expiry := v_profile.license_valid_until;

  IF v_expiry IS NULL AND v_profile.centre_id IS NOT NULL THEN
    SELECT license_valid_until INTO v_expiry
      FROM centres WHERE id = v_profile.centre_id;
  END IF;

  IF v_expiry IS NULL AND v_profile.org_id IS NOT NULL THEN
    SELECT license_valid_until INTO v_expiry
      FROM organizations WHERE id = v_profile.org_id;
  END IF;

  -- NULL = unlimited
  IF v_expiry IS NULL OR v_expiry >= current_date THEN
    RETURN jsonb_build_object(
      'valid',          true,
      'expires_at',     v_expiry,
      'days_remaining', CASE WHEN v_expiry IS NULL THEN NULL
                             ELSE (v_expiry - current_date)
                        END
    );
  END IF;

  RETURN jsonb_build_object(
    'valid',      false,
    'expires_at', v_expiry
  );
END;
$$;
