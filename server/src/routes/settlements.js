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

/** Validation schema for creating a settlement */
const createSettlementSchema = z.object({
  paidById: z.number().int(),
  paidToId: z.number().int(),
  amount: z.number().positive('Settlement amount must be positive'),
  date: z.string().transform((val) => new Date(val)),
  notes: z.string().nullable().optional(),
});

/**
 * POST /api/groups/:groupId/settlements - Records a debt settlement between two group members.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const parsed = createSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { paidById, paidToId, amount, date, notes } = parsed.data;

    // Validate the group exists
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    // Validate payer exists
    const payer = await prisma.user.findUnique({ where: { id: paidById } });
    if (!payer) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Payer user not found.' });
    }

    // Validate recipient exists
    const recipient = await prisma.user.findUnique({ where: { id: paidToId } });
    if (!recipient) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Recipient user not found.' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        paidById,
        paidToId,
        amount,
        date,
        notes
      }
    });

    return res.status(HTTP_CREATED).json({ message: 'Settlement recorded successfully.', settlement });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to record settlement.' });
  }
});

/**
 * GET /api/groups/:groupId/settlements - Lists all settlements recorded for a group.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        paidBy: { select: { id: true, name: true } },
        paidTo: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' }
    });

    return res.status(HTTP_OK).json({ settlements });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to retrieve settlements.' });
  }
});

module.exports = router;
