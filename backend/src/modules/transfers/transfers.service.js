
const prisma = require('../../config/db');

class TransfersService {
  async getAll() {
    const transfers = await prisma.stockTransfer.findMany({
      include: { source_warehouse: true, destination_warehouse: true, product: true, batch: true },
      orderBy: { requested_date: 'desc' },
    });
    return transfers.map(this.toDTO);
  }

  /**
   * FR: multi-location warehouse management — moves stock from one
   * warehouse to another in a single transaction (decrement source,
   * increment/create destination), and completes immediately (no partial
   * "in transit" state, which keeps this usable for a store this size).
   */
  async create({ sourceWarehouseId, destinationWarehouseId, productId, batchId, quantity, createdBy }) {
    if (sourceWarehouseId === destinationWarehouseId) {
      const err = new Error('Source and destination warehouses must be different');
      err.status = 400;
      throw err;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      const err = new Error('Quantity must be greater than zero');
      err.status = 400;
      throw err;
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const sourceLevel = await tx.stockLevel.findFirst({
        where: { product_id: productId, warehouse_id: sourceWarehouseId, batch_id: batchId || null },
      });
      const available = sourceLevel ? Number(sourceLevel.quantity) : 0;
      if (available < qty) {
        const err = new Error(`Insufficient stock at source warehouse. Available: ${available}`);
        err.status = 409;
        throw err;
      }

      await tx.stockLevel.update({ where: { id: sourceLevel.id }, data: { quantity: { decrement: qty } } });

      const destLevel = await tx.stockLevel.findFirst({
        where: { product_id: productId, warehouse_id: destinationWarehouseId, batch_id: batchId || null },
      });
      if (destLevel) {
        await tx.stockLevel.update({ where: { id: destLevel.id }, data: { quantity: { increment: qty } } });
      } else {
        await tx.stockLevel.create({
          data: { product_id: productId, warehouse_id: destinationWarehouseId, batch_id: batchId || null, quantity: qty },
        });
      }

      const created = await tx.stockTransfer.create({
        data: {
          source_warehouse_id: sourceWarehouseId,
          destination_warehouse_id: destinationWarehouseId,
          product_id: productId,
          batch_id: batchId || null,
          quantity: qty,
          status: 'COMPLETED',
          completed_date: new Date(),
          created_by: createdBy,
        },
      });

      await tx.stockMovement.create({
        data: {
          product_id: productId,
          batch_id: batchId || null,
          warehouse_id: sourceWarehouseId,
          movement_type: 'TRANSFER_OUT',
          quantity: -qty,
          created_by: createdBy,
        },
      });
      await tx.stockMovement.create({
        data: {
          product_id: productId,
          batch_id: batchId || null,
          warehouse_id: destinationWarehouseId,
          movement_type: 'TRANSFER_IN',
          quantity: qty,
          created_by: createdBy,
        },
      });

      return created;
    });

    const full = await prisma.stockTransfer.findUnique({
      where: { id: transfer.id },
      include: { source_warehouse: true, destination_warehouse: true, product: true, batch: true },
    });
    return this.toDTO(full);
  }

  toDTO(transfer) {
    return {
      id: transfer.id,
      product: transfer.product?.name,
      productId: transfer.product_id,
      batch: transfer.batch ? `${transfer.batch.batch_number}${transfer.batch.shade_code ? ` (${transfer.batch.shade_code})` : ''}` : null,
      from: transfer.source_warehouse?.name,
      to: transfer.destination_warehouse?.name,
      quantity: Number(transfer.quantity),
      status: transfer.status,
      date: transfer.requested_date,
    };
  }
}

module.exports = new TransfersService();
