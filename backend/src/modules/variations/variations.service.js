const prisma = require('../../config/db');

/**
 * Variations are the reusable, catalog-wide variation TYPES (Color,
 * Diameter, ...) — defined once here, then picked from a dropdown on the
 * Add Product screen, the same way Category already works. This service
 * owns both the Variation itself and its VariationValue children (Red,
 * Blue, ... under Color); products.service.js only ever *reads* these
 * (via getById/getAll below) and links to them, it never creates them.
 */
class VariationsService {
  async getAll() {
    const variations = await prisma.variation.findMany({
      where: { is_active: true },
      include: {
        values: { where: { is_active: true }, orderBy: { value: 'asc' } },
        _count: { select: { product_axes: true } },
      },
      orderBy: { name: 'asc' },
    });
    return variations.map((v) => this.toDTO(v));
  }

  async getById(id) {
    const variation = await prisma.variation.findUnique({
      where: { id },
      include: {
        values: { where: { is_active: true }, orderBy: { value: 'asc' } },
        _count: { select: { product_axes: true } },
      },
    });
    if (!variation) {
      const err = new Error('Variation not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(variation);
  }

  /**
   * `data.values`, if given, is the initial list of values to create
   * alongside the variation itself (e.g. ["Red", "Blue", "Green"] or
   * [{ value: "6", priceAdjustment: 90 }]) — matches the "Add Variation"
   * dialog, which lets the admin add the name and its first values in
   * one step. More values can always be added later via addValue().
   */
  async create(data) {
    if (!data.name || !data.name.trim()) {
      const err = new Error('Variation name is required.');
      err.status = 400;
      throw err;
    }
    const valueType = data.valueType === 'MEASUREMENT' || data.value_type === 'MEASUREMENT' ? 'MEASUREMENT' : 'TEXT';
    const unit = valueType === 'MEASUREMENT' ? (data.unit || null) : null;
    const initialValues = Array.isArray(data.values) ? data.values : [];

    const cleanValues = initialValues
      .map((v) => (typeof v === 'string' ? { value: v } : v))
      .filter((v) => v.value && v.value.toString().trim())
      .map((v) => ({
        value: v.value.toString().trim(),
        price_adjustment: Number(v.priceAdjustment ?? v.price_adjustment ?? 0),
      }));

    // Deliberately NOT a single `prisma.variation.create({ data: { values:
    // { create: [...] } } } })` — the tenant-scoping extension (see
    // config/db.js) only injects business_id onto the top-level model of
    // a query; a nested relation write like `values: { create: [...] } }`
    // creates VariationValue rows the extension never sees as their own
    // operation, so they'd be written with no business_id at all (that
    // column is NOT NULL — this is what broke variation creation after
    // multi-tenancy landed). Instead: create the Variation, then create
    // its values with their own top-level `variationValue.createMany()`
    // call. Wrapped in a transaction purely for atomicity.
    const variation = await prisma.$transaction(async (tx) => {
      const createdVariation = await tx.variation.create({
        data: { name: data.name.trim(), value_type: valueType, unit },
      });
      if (cleanValues.length) {
        await tx.variationValue.createMany({
          data: cleanValues.map((v) => ({ variation_id: createdVariation.id, ...v })),
        });
      }
      return createdVariation;
    });
    return this.getById(variation.id);
  }

  async update(id, data) {
    const valueType = data.valueType || data.value_type;
    const variation = await prisma.variation.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(valueType !== undefined && { value_type: valueType === 'MEASUREMENT' ? 'MEASUREMENT' : 'TEXT' }),
        ...(data.unit !== undefined && { unit: data.unit || null }),
      },
      include: {
        values: { where: { is_active: true }, orderBy: { value: 'asc' } },
        _count: { select: { product_axes: true } },
      },
    });
    return this.toDTO(variation);
  }

  /** Blocked while any product still uses this variation — same
   *  protection categories.service.js already has for category deletes. */
  async remove(id) {
    const productCount = await prisma.productVariationAxis.count({ where: { variation_id: id } });
    if (productCount > 0) {
      const err = new Error('Cannot delete a variation that is still attached to products.');
      err.status = 409;
      throw err;
    }
    await prisma.variation.delete({ where: { id } });
  }

  async addValue(variationId, data) {
    if (!data.value || !data.value.toString().trim()) {
      const err = new Error('Value is required.');
      err.status = 400;
      throw err;
    }
    const value = await prisma.variationValue.create({
      data: {
        variation_id: variationId,
        value: data.value.toString().trim(),
        price_adjustment: Number(data.priceAdjustment ?? data.price_adjustment ?? 0),
      },
    });
    return this.valueToDTO(value);
  }

  async updateValue(valueId, data) {
    const value = await prisma.variationValue.update({
      where: { id: valueId },
      data: {
        ...(data.value !== undefined && { value: data.value.toString().trim() }),
        ...((data.priceAdjustment !== undefined || data.price_adjustment !== undefined) && {
          price_adjustment: Number(data.priceAdjustment ?? data.price_adjustment),
        }),
      },
    });
    return this.valueToDTO(value);
  }

  /** Soft-deletes (deactivates) a value if any product variant already
   *  uses it — same "don't corrupt history" rule products.service.js
   *  uses for deleting a variant itself — otherwise removes it cleanly. */
  async removeValue(valueId) {
    const usageCount = await prisma.productVariantValue.count({ where: { variation_value_id: valueId } });
    if (usageCount > 0) {
      await prisma.variationValue.update({ where: { id: valueId }, data: { is_active: false } });
      return;
    }
    await prisma.variationValue.delete({ where: { id: valueId } });
  }

  toDTO(variation) {
    return {
      id: variation.id,
      name: variation.name,
      valueType: variation.value_type,
      unit: variation.unit,
      productCount: variation._count?.product_axes ?? 0,
      values: (variation.values || []).map((v) => this.valueToDTO(v)),
    };
  }

  valueToDTO(value) {
    return {
      id: value.id,
      variationId: value.variation_id,
      value: value.value,
      priceAdjustment: Number(value.price_adjustment),
      isActive: value.is_active,
    };
  }
}

module.exports = new VariationsService();