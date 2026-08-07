
const prisma = require('../../config/db');

// Business-managed units of measure — replaces the old fixed UomType
// enum (BOX/SQ_FT/SQ_M/LENGTH/BUNDLE/PIECE). Same shape as
// roles.service.js: no "built-in" unit protected from editing, an admin
// builds whatever list this business actually needs.
class UnitsOfMeasureService {
  async getAll() {
    const units = await prisma.unitOfMeasure.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    return units.map(this.toDTO);
  }

  async create({ name, abbreviation }) {
    const trimmedName = (name || '').trim();
    const trimmedAbbr = (abbreviation || '').trim();
    if (!trimmedName) {
      const err = new Error('Unit name is required.');
      err.status = 400;
      throw err;
    }
    if (!trimmedAbbr) {
      const err = new Error('An abbreviation is required (e.g. "pc" for Piece) — it\'s what actually shows on receipts and the POS cart.');
      err.status = 400;
      throw err;
    }
    const existing = await prisma.unitOfMeasure.findFirst({ where: { name: trimmedName } });
    if (existing) {
      const err = new Error(`A unit named "${trimmedName}" already exists.`);
      err.status = 409;
      throw err;
    }
    const unit = await prisma.unitOfMeasure.create({
      data: { name: trimmedName, abbreviation: trimmedAbbr },
      include: { _count: { select: { products: true } } },
    });
    return this.toDTO(unit);
  }

  async update(id, { name, abbreviation }) {
    const unit = await prisma.unitOfMeasure.findUnique({ where: { id } });
    if (!unit) {
      const err = new Error('Unit not found');
      err.status = 404;
      throw err;
    }
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        const err = new Error('Unit name is required.');
        err.status = 400;
        throw err;
      }
      const conflict = await prisma.unitOfMeasure.findFirst({ where: { name: trimmed } });
      if (conflict && conflict.id !== id) {
        const err = new Error(`A unit named "${trimmed}" already exists.`);
        err.status = 409;
        throw err;
      }
    }
    const updated = await prisma.unitOfMeasure.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(abbreviation !== undefined && { abbreviation: abbreviation.trim() }),
      },
      include: { _count: { select: { products: true } } },
    });
    return this.toDTO(updated);
  }

  async remove(id) {
    const unit = await prisma.unitOfMeasure.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!unit) {
      const err = new Error('Unit not found');
      err.status = 404;
      throw err;
    }
    if (unit._count.products > 0) {
      const err = new Error(
        `Cannot delete — ${unit._count.products} product(s) still use this unit. Change their unit first.`,
      );
      err.status = 409;
      throw err;
    }
    await prisma.unitOfMeasure.delete({ where: { id } });
  }

  toDTO(unit) {
    return {
      id: unit.id,
      name: unit.name,
      abbreviation: unit.abbreviation,
      isActive: unit.is_active,
      productCount: unit._count?.products ?? 0,
    };
  }
}

module.exports = new UnitsOfMeasureService();
