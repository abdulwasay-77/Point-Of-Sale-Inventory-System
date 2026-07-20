
const { PrismaClient } = require('@prisma/client');

// Single shared PrismaClient instance for the whole app. Reused across
// every module/service instead of each file creating its own client.
const prisma = new PrismaClient();

module.exports = prisma;
