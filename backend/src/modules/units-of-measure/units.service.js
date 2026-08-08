const prisma = require('../../config/db');

const MEASUREMENT_TYPES = new Set(['COUNT', 'AREA', 'LENGTH', 'WEIGHT', 'VOLUME', 'OTHER']);

class UnitsOfMeasureService {
  async getAll() {
    const units = await prisma.unitOfMeasure.findMany({
      include: {
        _count: { select: { products: true, coverage_products: true } },
      },
      orderBy: { name: 'asc' },
    });
    return units.map((unit) => this.toDTO(unit));
  }

  validate({ name, abbreviation, measurementType }) {
    const trimmedName = (name || '').trim();
    const trimmedAbbreviation = (abbreviation || '').trim();
    const type = measurementType || 'COUNT';
    if (!trimmedName || !trimmedAbbreviation) {
      const error = new Error('Unit name and abbreviation are required.');
      error.status = 400;
      throw error;
    }
    if (!MEASUREMENT_TYPES.has(type)) {
      const error = new Error('Choose a valid measurement type.');
      error.status = 400;
      throw error;
    }
    return { name: trimmedName, abbreviation: trimmedAbbreviation, measurementType: type };
  }

  async create(values) {
    const data = this.validate(values);
    const existing = await prisma.unitOfMeasure.findFirst({ where: { name: data.name } });
    if (existing) {
      const error = new Error(`A unit named "${data.name}" already exists.`);
      error.status = 409;
      throw error;
    }
    const unit = await prisma.unitOfMeasure.create({
      data: { name: data.name, abbreviation: data.abbreviation, measurement_type: data.measurementType },
      include: { _count: { select: { products: true, coverage_products: true } } },
    });
    return this.toDTO(unit);
  }

  async update(id, values) {
    const unit = await prisma.unitOfMeasure.findUnique({
      where: { id },
      include: { _count: { select: { products: true, coverage_products: true } } },
    });
    if (!unit) {
      const error = new Error('Unit not found.');
      error.status = 404;
      throw error;
    }
    const nextType = values.measurementType ?? unit.measurement_type;
    if (!MEASUREMENT_TYPES.has(nextType)) {
      const error = new Error('Choose a valid measurement type.');
      error.status = 400;
      throw error;
    }
    if (nextType !== unit.measurement_type && (unit._count.products > 0 || unit._count.coverage_products > 0)) {
      const error = new Error('The measurement type cannot change after a product uses this unit.');
      error.status = 409;
      throw error;
    }
    const name = values.name === undefined ? unit.name : (values.name || '').trim();
    const abbreviation = values.abbreviation === undefined ? unit.abbreviation : (values.abbreviation || '').trim();
    this.validate({ name, abbreviation, measurementType: nextType });
    const conflict = await prisma.unitOfMeasure.findFirst({ where: { name } });
    if (conflict && conflict.id !== id) {
      const error = new Error(`A unit named "${name}" already exists.`);
      error.status = 409;
      throw error;
    }
    const updated = await prisma.unitOfMeasure.update({
      where: { id },
      data: { name, abbreviation, measurement_type: nextType },
      include: { _count: { select: { products: true, coverage_products: true } } },
    });
    return this.toDTO(updated);
  }

  async remove(id) {
    const unit = await prisma.unitOfMeasure.findUnique({
      where: { id }, include: { _count: { select: { products: true, coverage_products: true } } },
    });
    if (!unit) { const error = new Error('Unit not found.'); error.status = 404; throw error; }
    if (unit._count.products || unit._count.coverage_products) {
      const error = new Error('Cannot delete a unit still used by a product.'); error.status = 409; throw error;
    }
    await prisma.unitOfMeasure.delete({ where: { id } });
  }

  toDTO(unit) {
    return {
      id: unit.id, name: unit.name, abbreviation: unit.abbreviation,
      measurementType: unit.measurement_type, isActive: unit.is_active,
      productCount: unit._count?.products ?? 0, coverageProductCount: unit._count?.coverage_products ?? 0,
    };
  }
}

module.exports = new UnitsOfMeasureService();