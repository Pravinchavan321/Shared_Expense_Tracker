const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
const prisma = new PrismaClient();

/** HTTP status code definitions */
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

/** Named constant for currency conversion */
const USD_TO_INR = 83.0;

/** Validation schema for expense creation split items */
const splitItemSchema = z.object({
  userId: z.number().int(),
  amount: z.number().nonnegative().optional(),
  percentage: z.number().nonnegative().optional(),
  shares: z.number().nonnegative().optional(),
});

/** Validation schema for creating a new expense */
const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().default('INR'),
  splitType: z.enum(['equal', 'exact', 'unequal', 'percentage', 'share']),
  date: z.string().transform((val) => new Date(val)),
  paidById: z.number().int(),
  splitWith: z.array(splitItemSchema).min(1, 'Must split with at least one user'),
  notes: z.string().nullable().optional(),
});

/**
 * POST /api/groups/:groupId/expenses - Creates a new expense under a group and generates individual splits.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { description, amount: inputAmount, currency, splitType, date, paidById, splitWith, notes } = parsed.data;

    // Verify group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    // Verify payer user exists
    const payerExists = await prisma.user.findUnique({ where: { id: paidById } });
    if (!payerExists) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Payer user does not exist.' });
    }

    // Determine exchange rate and target total in INR
    const isUSD = currency.toUpperCase() === 'USD';
    const exchangeRate = isUSD ? USD_TO_INR : 1.0;
    const targetTotalAmount = Math.round((inputAmount * exchangeRate) * 100) / 100;

    const splitAmounts = {};

    // Calculate individual splits based on splitType
    if (splitType === 'equal') {
      const N = splitWith.length;
      const eachAmount = Math.floor((targetTotalAmount / N) * 100) / 100;
      let remainder = targetTotalAmount;

      splitWith.forEach(item => {
        splitAmounts[item.userId] = eachAmount;
        remainder -= eachAmount;
      });

      // Adjust rounding remainder to the payer if they are in the split, otherwise to the first participant
      const adjustId = splitWith.some(item => item.userId === paidById) ? paidById : splitWith[0].userId;
      splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + remainder) * 100) / 100;

    } else if (splitType === 'exact' || splitType === 'unequal') {
      // Validate that input amounts sum to total amount
      const sumInput = splitWith.reduce((sum, item) => sum + (item.amount || 0), 0);
      if (Math.abs(sumInput - inputAmount) > 0.01) {
        return res.status(HTTP_BAD_REQUEST).json({ error: 'Split amounts must sum exactly to the total expense amount.' });
      }

      let totalConvertedSplits = 0;
      splitWith.forEach(item => {
        const converted = Math.round((item.amount * exchangeRate) * 100) / 100;
        splitAmounts[item.userId] = converted;
        totalConvertedSplits += converted;
      });

      const diff = Math.round((targetTotalAmount - totalConvertedSplits) * 100) / 100;
      if (diff !== 0) {
        const adjustId = splitWith.some(item => item.userId === paidById) ? paidById : splitWith[0].userId;
        splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
      }

    } else if (splitType === 'percentage') {
      // Validate percentages sum to 100
      const sumPct = splitWith.reduce((sum, item) => sum + (item.percentage || 0), 0);
      if (Math.abs(sumPct - 100) > 0.01) {
        return res.status(HTTP_BAD_REQUEST).json({ error: 'Split percentages must sum exactly to 100%.' });
      }

      let totalConvertedSplits = 0;
      splitWith.forEach(item => {
        const pct = item.percentage || 0;
        const calculated = Math.round((targetTotalAmount * (pct / 100)) * 100) / 100;
        splitAmounts[item.userId] = calculated;
        totalConvertedSplits += calculated;
      });

      const diff = Math.round((targetTotalAmount - totalConvertedSplits) * 100) / 100;
      if (diff !== 0) {
        const adjustId = splitWith.some(item => item.userId === paidById) ? paidById : splitWith[0].userId;
        splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
      }

    } else if (splitType === 'share') {
      const totalShares = splitWith.reduce((sum, item) => sum + (item.shares || 0), 0);
      if (totalShares <= 0) {
        return res.status(HTTP_BAD_REQUEST).json({ error: 'Total shares must be greater than zero.' });
      }

      let totalConvertedSplits = 0;
      splitWith.forEach(item => {
        const shares = item.shares || 0;
        const calculated = Math.round((targetTotalAmount * (shares / totalShares)) * 100) / 100;
        splitAmounts[item.userId] = calculated;
        totalConvertedSplits += calculated;
      });

      const diff = Math.round((targetTotalAmount - totalConvertedSplits) * 100) / 100;
      if (diff !== 0) {
        const adjustId = splitWith.some(item => item.userId === paidById) ? paidById : splitWith[0].userId;
        splitAmounts[adjustId] = Math.round((splitAmounts[adjustId] + diff) * 100) / 100;
      }
    }

    // Execute expense insertion and split records creation inside a single transaction
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description,
          amount: targetTotalAmount,
          originalAmount: inputAmount,
          currency,
          exchangeRate,
          paidById,
          splitType,
          date,
          notes,
          isSettlement: false
        }
      });

      const splitsData = Object.entries(splitAmounts).map(([userId, shareAmount]) => ({
        expenseId: exp.id,
        userId: parseInt(userId),
        amount: shareAmount
      }));

      await tx.expenseSplit.createMany({
        data: splitsData
      });

      return exp;
    });

    return res.status(HTTP_CREATED).json({ message: 'Expense recorded successfully.', expense });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to create expense.' });
  }
});

/**
 * GET /api/groups/:groupId/expenses - Retrieves all expenses for a group with their split configurations.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId, isSettlement: false },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    return res.status(HTTP_OK).json({ expenses });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to retrieve expenses.' });
  }
});

/**
 * DELETE /api/groups/:groupId/expenses/:eid - Deletes a specific expense and its related splits.
 */
router.delete('/:eid', authMiddleware, async (req, res) => {
  try {
    const expenseId = parseInt(req.params.eid);
    if (isNaN(expenseId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid expense ID.' });
    }

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId }
    });

    if (!expense) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Expense not found.' });
    }

    // Delete both expense splits and the main expense record atomically
    await prisma.$transaction(async (tx) => {
      await tx.expenseSplit.deleteMany({
        where: { expenseId }
      });
      await tx.expense.delete({
        where: { id: expenseId }
      });
    });

    return res.status(HTTP_OK).json({ message: 'Expense and its splits deleted successfully.' });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to delete expense.' });
  }
});

module.exports = router;
