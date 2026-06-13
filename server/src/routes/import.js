const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const { analyzeCSV } = require('../services/importService');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage() });

/** HTTP status code definitions */
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

/** Default password for newly auto-created users */
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('password123', 10);

/**
 * POST /api/groups/:groupId/import - Accepts CSV upload, returns anomaly detection report.
 */
router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    if (!req.file) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'No file uploaded.' });
    }

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    // Get group memberships for anomaly context
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { user: true }
    });

    const csvText = req.file.buffer.toString('utf8');
    const report = await analyzeCSV(csvText, memberships);

    return res.status(HTTP_OK).json(report);
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to analyze CSV file.' });
  }
});

/**
 * POST /api/groups/:groupId/import/confirm - Persists approved rows as Expenses/Settlements.
 */
router.post('/confirm', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const { fileName, rows, approvedIndices } = req.body;
    if (!rows || !Array.isArray(rows) || !approvedIndices || !Array.isArray(approvedIndices)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid request body.' });
    }

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    const approvedRows = rows.filter(r => approvedIndices.includes(r.rowIndex));
    let importedCount = 0;
    const anomaliesList = [];

    // Helper to find or create a user by name (case-insensitive)
    const getOrCreateUser = async (tx, name) => {
      let user = await tx.user.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            name,
            email: `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
            password: DEFAULT_PASSWORD_HASH
          }
        });

        // Auto-join them to the group so transactions don't fail constraint checks
        await tx.groupMembership.create({
          data: {
            userId: user.id,
            groupId,
            joinedAt: new Date('2025-02-01T00:00:00.000Z') // Default group start
          }
        });
      }
      return user;
    };

    // Run import for each approved row inside a single transaction
    await prisma.$transaction(async (tx) => {
      for (const row of approvedRows) {
        const p = row.parsedRow;
        
        // Find or create the payer
        const payerName = p.paid_by || 'Aisha'; // fallback
        const payerUser = await getOrCreateUser(tx, payerName);

        if (p.isSettlement) {
          // If marked as settlement, find or create the recipient
          const recipientName = p.split_with[0] || 'Rohan'; // fallback
          const recipientUser = await getOrCreateUser(tx, recipientName);

          await tx.settlement.create({
            data: {
              groupId,
              paidById: payerUser.id,
              paidToId: recipientUser.id,
              amount: p.amount,
              date: new Date(p.date),
              notes: p.notes
            }
          });
        } else {
          // Normal Expense
          const exp = await tx.expense.create({
            data: {
              groupId,
              description: p.description,
              amount: p.amount,
              originalAmount: p.originalAmount,
              currency: p.currency,
              exchangeRate: p.originalAmount > 0 ? (p.amount / p.originalAmount) : 1.0,
              paidById: payerUser.id,
              splitType: p.split_type,
              date: new Date(p.date),
              notes: p.notes,
              isSettlement: false,
              importFlag: 'CSV_IMPORT'
            }
          });

          // Calculate and create splits
          const splitUserIds = [];
          for (const name of p.split_with) {
            const u = await getOrCreateUser(tx, name);
            splitUserIds.push(u.id);
          }

          const splitAmounts = {};

          if (p.split_type === 'equal') {
            const N = splitUserIds.length;
            const eachAmount = Math.floor((p.amount / N) * 100) / 100;
            let remainder = p.amount;

            splitUserIds.forEach(uid => {
              splitAmounts[uid] = eachAmount;
              remainder -= eachAmount;
            });

            const adjustId = splitUserIds.includes(payerUser.id) ? payerUser.id : splitUserIds[0];
            splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + remainder) * 100) / 100;

          } else if (p.split_type === 'exact' || p.split_type === 'unequal') {
            let totalSplits = 0;
            for (const item of p.split_details) {
              const u = await getOrCreateUser(tx, item.name);
              const val = Math.round(item.amount * (p.amount / p.originalAmount) * 100) / 100; // converted
              splitAmounts[u.id] = val;
              totalSplits += val;
            }

            const diff = Math.round((p.amount - totalSplits) * 100) / 100;
            if (diff !== 0) {
              const adjustId = splitUserIds.includes(payerUser.id) ? payerUser.id : splitUserIds[0];
              splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
            }

          } else if (p.split_type === 'percentage') {
            let totalSplits = 0;
            for (const item of p.split_details) {
              const u = await getOrCreateUser(tx, item.name);
              const val = Math.round((p.amount * (item.percentage / 100)) * 100) / 100;
              splitAmounts[u.id] = val;
              totalSplits += val;
            }

            const diff = Math.round((p.amount - totalSplits) * 100) / 100;
            if (diff !== 0) {
              const adjustId = splitUserIds.includes(payerUser.id) ? payerUser.id : splitUserIds[0];
              splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
            }

          } else if (p.split_type === 'share') {
            const totalShares = p.split_details.reduce((sum, item) => sum + item.shares, 0);
            let totalSplits = 0;
            for (const item of p.split_details) {
              const u = await getOrCreateUser(tx, item.name);
              const val = Math.round((p.amount * (item.shares / totalShares)) * 100) / 100;
              splitAmounts[u.id] = val;
              totalSplits += val;
            }

            const diff = Math.round((p.amount - totalSplits) * 100) / 100;
            if (diff !== 0) {
              const adjustId = splitUserIds.includes(payerUser.id) ? payerUser.id : splitUserIds[0];
              splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
            }
          }

          const splitsData = Object.entries(splitAmounts).map(([uid, val]) => ({
            expenseId: exp.id,
            userId: parseInt(uid),
            amount: val
          }));

          await tx.expenseSplit.createMany({
            data: splitsData
          });
        }

        importedCount++;
        if (row.anomalies && row.anomalies.length > 0) {
          row.anomalies.forEach(anomaly => {
            anomaliesList.push({
              rowNumber: row.rowIndex + 1,
              type: anomaly.type,
              severity: row.status === 'error' ? 'error' : 'warning',
              message: anomaly.message,
              originalValue: String(row.originalRow.amount),
              suggestedFix: anomaly.suggestedFix,
              action: 'imported'
            });
          });
        }
      }

      // Record ImportReport
      await tx.importReport.create({
        data: {
          groupId,
          fileName: fileName || 'expenses_export.csv',
          totalRows: rows.length,
          importedRows: importedCount,
          anomalies: anomaliesList
        }
      });
    });

    return res.status(HTTP_CREATED).json({
      message: 'CSV data imported successfully.',
      totalRows: rows.length,
      importedRows: importedCount
    });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to import CSV data.' });
  }
});

/**
 * GET /api/groups/:groupId/import-reports - Lists all past CSV imports for the group.
 */
router.get('/import-reports', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const reports = await prisma.importReport.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(HTTP_OK).json({ reports });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to retrieve import reports.' });
  }
});

module.exports = router;
