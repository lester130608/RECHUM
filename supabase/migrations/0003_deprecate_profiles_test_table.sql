-- Migration 0003: Deprecate obsolete profiles test table
-- Date: 2026-06-23
-- profiles came from test setup and is not the source of truth for roles.
-- Real roles live in employees -> user_roles -> roles.
-- This migration does not drop the table because production code cleanup happens separately.

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.profiles IS ''DEPRECATED: test-era table. Do not use for payroll authorization. Use employees -> user_roles -> roles.''';
    EXECUTE 'COMMENT ON COLUMN public.profiles.role IS ''DEPRECATED: test-era role value. Real roles are owner, supervisor_ba, supervisor_cmhc, supervisor_tcm.''';
  END IF;
END $$;
