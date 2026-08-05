
-- Remove the built-in/system role concept entirely.
--
-- Roles are now 100% dynamic — every role, without exception, is
-- created, renamed, and deleted through the Roles API (see
-- roles.service.js). Protection against a business locking itself out
-- of user/role management no longer lives on the Role table at all; it
-- moves to a single flag on User (is_primary_admin, added below), which
-- can't be edited, deactivated, or have its permissions overridden by
-- anyone through the app — only a direct seed/migration can set it.
--
-- This migration clears out the four roles seeded as is_system=true by
-- the earlier dynamic_roles migration. Safe to run destructively here
-- because it's intended to be paired with a full `prisma migrate reset`,
-- which replays every migration against an empty database and then
-- reseeds via seed.js — no user has been created yet at the point these
-- DELETEs run, so there's nothing to reassign.

DELETE FROM "role_permissions";
DELETE FROM "roles";

ALTER TABLE "roles" DROP COLUMN "is_system";

-- users.role becomes optional. The primary admin (see below) is the one
-- user who intentionally has no role at all — their access doesn't come
-- from the Role table, so there's nothing to assign them.
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;

-- The one flag that replaces the whole built-in-role mechanism. Set to
-- true ONLY for the single account seed.js creates — never settable
-- through the API (UsersService.create/update never accept this field
-- from a request body). See backend/src/utils/effectivePermissions.js
-- (grants this account every permission, bypassing Role entirely) and
-- backend/src/modules/users/users.service.js (blocks edit/deactivate/
-- permission-override on this account from any other user).
ALTER TABLE "users" ADD COLUMN "is_primary_admin" BOOLEAN NOT NULL DEFAULT false;
