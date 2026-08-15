const bcrypt = require('bcryptjs');
const prisma = require('../../config/db');
const { DEFAULT_MODULES, MODULES } = require('../../config/modules');

// Platform-only service — every query here deliberately uses
// prisma.basePrisma (the unscoped client) rather than the ambient
// tenant context, since platform routes never establish one (see
// platformAuthMiddleware.js). Business and PlatformAdmin aren't
// tenant-scoped models anyway (see config/db.js TENANT_MODELS), but
// using basePrisma explicitly here makes that intentional rather than
// incidental.
class BusinessService {
  slugify(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  toDTO(business) {
    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      status: business.status,
      industryType: business.industry_type,
      contactEmail: business.contact_email,
      contactPhone: business.contact_phone,
      enabledModules: business.enabled_modules,
      maxAdminSeats: business.max_admin_seats,
      createdAt: business.created_at,
      stats: business._count
        ? {
            users: business._count.userRows,
            products: business._count.productRows,
          }
        : undefined,
    };
  }

  async getAll() {
    const businesses = await prisma.basePrisma.business.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { userRows: true, productRows: true } } },
    });
    return businesses.map((b) => this.toDTO(b));
  }

  async getById(id) {
    const business = await prisma.basePrisma.business.findUnique({
      where: { id },
      include: { _count: { select: { userRows: true, productRows: true } } },
    });
    if (!business) {
      const err = new Error('Business not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(business);
  }

  // Creates the business AND its first (primary admin) user in one
  // transaction — a business is never left without someone able to log
  // in and manage it. Mirrors exactly what seed.js does for local dev,
  // just triggered by a platform admin instead of a script.
  async createBusiness({ name, industryType, contactEmail, contactPhone, adminName, adminEmail, adminPassword, enabledModules }) {
    const existingEmail = await prisma.basePrisma.user.findUnique({ where: { email: adminEmail } });
    if (existingEmail) {
      const err = new Error('A user with this email already exists');
      err.status = 409;
      throw err;
    }

    const baseSlug = this.slugify(name);
    let slug = baseSlug;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await prisma.basePrisma.business.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const password_hash = await bcrypt.hash(adminPassword, 10);

    const result = await prisma.basePrisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name,
          slug,
          status: 'TRIAL',
          industry_type: industryType || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          enabled_modules: enabledModules && enabledModules.length ? enabledModules : DEFAULT_MODULES,
        },
      });

      const admin = await tx.user.create({
        data: {
          name: adminName,
          email: adminEmail,
          password_hash,
          role: null,
          is_primary_admin: true,
          is_active: true,
          business_id: business.id,
        },
      });

      // Seeds BusinessSettings with what was already captured above,
      // instead of leaving it to be lazily created empty on first visit
      // to the Settings page (see utils/businessSettings.js#getBusinessSettings).
      // Without this, a brand-new business's own name/logo never shows up
      // on its Settings page or its public login page (see
      // settings.service.js#getPublicSettings) until someone manually
      // re-types the name a second time. Everything else on
      // BusinessSettings (currency_symbol, invoice_number_prefix, etc.)
      // keeps its own schema default — only the two fields we already
      // have real values for are set here. Unscoped (tx, not the
      // tenant-scoping `prisma`) since there's no request/tenant context
      // inside this transaction — business_id is set explicitly instead.
      await tx.businessSettings.create({
        data: {
          business_id: business.id,
          company_name: name,
          phone: contactPhone || null,
        },
      });

      return { business, admin };
    });

    return {
      business: this.toDTO(result.business),
      admin: { id: result.admin.id, name: result.admin.name, email: result.admin.email },
    };
  }

  async setStatus(id, status) {
    if (!['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(status)) {
      const err = new Error('Invalid status');
      err.status = 400;
      throw err;
    }
    const business = await prisma.basePrisma.business.update({ where: { id }, data: { status } });
    return this.toDTO(business);
  }

  async setEnabledModules(id, enabledModules) {
    const valid = enabledModules.every((m) => Object.prototype.hasOwnProperty.call(MODULES, m));
    if (!valid) {
      const err = new Error('One or more module names are invalid');
      err.status = 400;
      throw err;
    }
    const business = await prisma.basePrisma.business.update({
      where: { id },
      data: { enabled_modules: enabledModules },
    });
    return this.toDTO(business);
  }

  async setMaxAdminSeats(id, maxAdminSeats) {
    const business = await prisma.basePrisma.business.update({
      where: { id },
      data: { max_admin_seats: maxAdminSeats === null ? null : Number(maxAdminSeats) },
    });
    return this.toDTO(business);
  }

  // Resets the business's primary admin password — the one support
  // action a Super Admin needs when a client is locked out, without
  // ever needing to know or reuse their password.
  async resetPrimaryAdminPassword(businessId, newPassword) {
    const primaryAdmin = await prisma.basePrisma.user.findFirst({
      where: { business_id: businessId, is_primary_admin: true },
    });
    if (!primaryAdmin) {
      const err = new Error('This business has no primary admin account');
      err.status = 404;
      throw err;
    }
    const password_hash = await bcrypt.hash(newPassword, 10);
    await prisma.basePrisma.user.update({ where: { id: primaryAdmin.id }, data: { password_hash } });
    return { email: primaryAdmin.email };
  }

  // Updates the descriptive/contact fields captured at creation time
  // (name, industry, contact email/phone) — everything EXCEPT slug
  // (kept immutable, since it's part of the tenant's identity/URLs and
  // nothing downstream expects it to change) and everything already
  // covered by its own dedicated endpoint (status, enabled modules,
  // admin seats, primary admin password). Purely additive alongside
  // those — doesn't share code paths with any of them.
  async updateBusinessInfo(id, { name, industryType, contactEmail, contactPhone }) {
    if (name !== undefined && !name.trim()) {
      const err = new Error('Business name cannot be empty');
      err.status = 400;
      throw err;
    }
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (industryType !== undefined) data.industry_type = industryType ? industryType.trim() : null;
    if (contactEmail !== undefined) data.contact_email = contactEmail ? contactEmail.trim() : null;
    if (contactPhone !== undefined) data.contact_phone = contactPhone ? contactPhone.trim() : null;

    const business = await prisma.basePrisma.business.update({ where: { id }, data });
    return this.toDTO(business);
  }
}

module.exports = new BusinessService();