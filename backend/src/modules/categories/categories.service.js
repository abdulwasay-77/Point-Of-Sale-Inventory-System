
const prisma = require('../../config/db');

class CategoriesService {
  async getAll() {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return categories.map(this.toDTO);
  }

  async getById(id) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) {
      const err = new Error('Category not found');
      err.status = 404;
      throw err;
    }
    return this.toDTO(category);
  }

  async create(data) {
    const category = await prisma.category.create({
      data: {
        name: data.name,
        description: data.description || null,
        parent_id: data.parent_id || null,
      },
    });
    return this.toDTO({ ...category, _count: { products: 0 } });
  }

  async update(id, data) {
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
      include: { _count: { select: { products: true } } },
    });
    return this.toDTO(category);
  }

  async remove(id) {
    const productCount = await prisma.product.count({ where: { category_id: id } });
    if (productCount > 0) {
      const err = new Error('Cannot delete a category that still has products assigned to it');
      err.status = 409;
      throw err;
    }
    await prisma.category.delete({ where: { id } });
  }

  toDTO(category) {
    return {
      id: category.id,
      name: category.name,
      description: category.description,
      productCount: category._count?.products ?? 0,
    };
  }
}

module.exports = new CategoriesService();
