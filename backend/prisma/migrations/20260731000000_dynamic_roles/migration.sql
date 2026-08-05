-- Dynamic roles.
--
-- Ordering matters here and is deliberate: the new roles/role_permissions
-- tables are created and SEEDED with the four existing roles (and their
-- exact current permission sets, copied from ROLE_DEFAULTS in
-- backend/src/config/permissions.js) BEFORE users.role gets its new
-- foreign key added. If the FK were added first, it would immediately
-- fail against every existing user row ('ADMIN', 'ACCOUNTANT', ...)
-- since no matching roles.name would exist yet.
--
-- Net effect for existing data: zero. Every user keeps the exact role
-- name and exact permissions they had before this migration — the only
-- thing that changes is where that role's permission set is stored
-- (a table instead of a hardcoded object), and that new roles can now be
-- created with a Roles admin screen.

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_key" ON "role_permissions"("role_id", "permission");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the four built-in roles as system roles (immutable via the Roles
-- API — see roles.service.js).
INSERT INTO "roles" ("id", "name", "is_system", "updated_at") VALUES
    (gen_random_uuid()::text, 'ADMIN', true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'ACCOUNTANT', true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'SALES_STAFF', true, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'WAREHOUSE_STAFF', true, CURRENT_TIMESTAMP);

-- Seed role_permissions to exactly match the old ROLE_DEFAULTS object,
-- so no existing user's access changes.

-- ADMIN: every permission that exists.
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission
FROM "roles" r
CROSS JOIN (VALUES
    ('PRODUCTS_VIEW'), ('PRODUCTS_EDIT'), ('PRODUCTS_DELETE'), ('PRICING_MANAGE'),
    ('BARCODES_MANAGE'), ('CATEGORIES_MANAGE'), ('VARIATIONS_MANAGE'), ('CUSTOMERS_MANAGE'),
    ('SUPPLIERS_MANAGE'), ('INVENTORY_VIEW'), ('KITS_MANAGE'), ('WAREHOUSES_MANAGE'),
    ('TRANSFERS_CREATE'), ('TRANSFERS_VIEW'), ('PURCHASES_VIEW'), ('PURCHASES_CREATE'),
    ('SALES_VIEW'), ('SALES_CHECKOUT'), ('REPORTS_VIEW'), ('PAYROLL_MANAGE'),
    ('DASHBOARD_VIEW'), ('USERS_MANAGE'), ('CREDIT_MANAGE'), ('INSTALLMENTS_MANAGE'),
    ('SETTINGS_MANAGE'), ('CHATBOT_ACTIONS')
) AS p(permission)
WHERE r.name = 'ADMIN';

-- ACCOUNTANT
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission
FROM "roles" r
CROSS JOIN (VALUES
    ('DASHBOARD_VIEW'), ('PRODUCTS_VIEW'), ('INVENTORY_VIEW'), ('PURCHASES_VIEW'),
    ('CUSTOMERS_MANAGE'), ('SUPPLIERS_MANAGE'), ('SALES_VIEW'), ('REPORTS_VIEW'),
    ('PAYROLL_MANAGE'), ('TRANSFERS_VIEW'), ('CREDIT_MANAGE'), ('INSTALLMENTS_MANAGE')
) AS p(permission)
WHERE r.name = 'ACCOUNTANT';

-- SALES_STAFF
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission
FROM "roles" r
CROSS JOIN (VALUES
    ('DASHBOARD_VIEW'), ('PRODUCTS_VIEW'), ('INVENTORY_VIEW'), ('CUSTOMERS_MANAGE'),
    ('SALES_CHECKOUT'), ('SALES_VIEW'), ('CREDIT_MANAGE'), ('INSTALLMENTS_MANAGE')
) AS p(permission)
WHERE r.name = 'SALES_STAFF';

-- WAREHOUSE_STAFF
INSERT INTO "role_permissions" ("id", "role_id", "permission")
SELECT gen_random_uuid()::text, r.id, p.permission
FROM "roles" r
CROSS JOIN (VALUES
    ('DASHBOARD_VIEW'), ('PRODUCTS_VIEW'), ('PRODUCTS_EDIT'), ('CATEGORIES_MANAGE'),
    ('VARIATIONS_MANAGE'), ('INVENTORY_VIEW'), ('PURCHASES_VIEW'), ('PURCHASES_CREATE'),
    ('SUPPLIERS_MANAGE'), ('KITS_MANAGE'), ('WAREHOUSES_MANAGE'), ('TRANSFERS_VIEW'),
    ('TRANSFERS_CREATE')
) AS p(permission)
WHERE r.name = 'WAREHOUSE_STAFF';

-- Now that every role name a user could hold already exists in "roles",
-- it's safe to convert users.role from the fixed enum to a plain string
-- and point it at "roles"("name"). The USING clause casts each existing
-- enum value (e.g. ADMIN) to its identical text representation — no
-- existing user's role value changes.
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_role_fkey"
    FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The old fixed enum is no longer referenced anywhere.
DROP TYPE "Role";