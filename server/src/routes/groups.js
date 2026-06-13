const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const balanceService = require('../services/balanceService');

const router = express.Router();
const prisma = new PrismaClient();

/** HTTP status code definitions */
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_ERROR = 500;

/** Schema for validating group creation body */
const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name cannot be empty').max(100, 'Group name must be 100 characters or fewer'),
});

/** Schema for validating add member body */
const addMemberSchema = z.object({
  userId: z.number().int('User ID must be an integer'),
  joinedAt: z.string().transform((val) => new Date(val)).optional(),
});

/** Schema for updating member's leftAt value */
const updateLeftAtSchema = z.object({
  leftAt: z.string().transform((val) => new Date(val)).nullable().optional(),
});

/**
 * POST /api/groups - Creates a new group and automatically joins the creator as a member.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { name } = parsed.data;
    const creatorId = req.user.id;

    // Perform group creation and member registration in a single transaction
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { name }
      });

      await tx.groupMembership.create({
        data: {
          userId: creatorId,
          groupId: g.id,
          joinedAt: new Date()
        }
      });

      return g;
    });

    return res.status(HTTP_CREATED).json({ message: 'Group created successfully.', group });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to create group.' });
  }
});

/**
 * GET /api/groups - Retrieves all groups in which the current user is a member.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const memberships = await prisma.groupMembership.findMany({
      where: { userId },
      include: {
        group: true
      }
    });

    const groups = memberships.map(m => m.group);

    return res.status(HTTP_OK).json({ groups });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to retrieve groups.' });
  }
});

/**
 * GET /api/groups/:id - Retrieves detailed group information including all members.
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    // Map memberships into a clean user array with join and leave timelines
    const members = group.memberships.map(m => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt
    }));

    return res.status(HTTP_OK).json({
      group: {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        members
      }
    });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to fetch group details.' });
  }
});

/**
 * POST /api/groups/:id/members - Adds a user to the specified group.
 */
router.post('/:id/members', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { userId, joinedAt } = parsed.data;

    // Validate the group exists
    const groupExists = await prisma.group.findUnique({ where: { id: groupId } });
    if (!groupExists) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Group not found.' });
    }

    // Validate the user exists
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'User does not exist.' });
    }

    // Check if membership already exists with the exact same joinedAt timestamp
    const joinDate = joinedAt || new Date();
    const existingMembership = await prisma.groupMembership.findFirst({
      where: {
        userId,
        groupId,
        joinedAt: joinDate
      }
    });

    if (existingMembership) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'User is already a member with this join timestamp.' });
    }

    const membership = await prisma.groupMembership.create({
      data: {
        userId,
        groupId,
        joinedAt: joinDate
      }
    });

    return res.status(HTTP_CREATED).json({ message: 'Member added to group successfully.', membership });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to add member to group.' });
  }
});

/**
 * PATCH /api/groups/:id/members/:userId - Updates the leftAt date for a group member.
 */
router.patch('/:id/members/:userId', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID or user ID.' });
    }

    const parsed = updateLeftAtSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const leftAtDate = parsed.data.leftAt !== undefined ? parsed.data.leftAt : new Date();

    // Find the active membership (where leftAt is null or latest)
    const membership = await prisma.groupMembership.findFirst({
      where: { groupId, userId, leftAt: null }
    });

    if (!membership) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Active group membership not found for this user.' });
    }

    const updatedMembership = await prisma.groupMembership.update({
      where: { id: membership.id },
      data: { leftAt: leftAtDate }
    });

    return res.status(HTTP_OK).json({ message: 'Member membership timeline updated.', membership: updatedMembership });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to update member leaving status.' });
  }
});

/**
 * GET /api/groups/:id/balances - Calculates group balances and simplified debts.
 */
router.get('/:id/balances', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID.' });
    }

    const data = await balanceService.getGroupBalances(groupId);
    return res.status(HTTP_OK).json(data);
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to fetch group balances.' });
  }
});

/**
 * GET /api/groups/:id/balances/:uid - Returns itemized balance breakdown for a specific user in a group.
 */
router.get('/:id/balances/:uid', authMiddleware, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const userId = parseInt(req.params.uid);

    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid group ID or user ID.' });
    }

    const data = await balanceService.getUserBreakdown(groupId, userId);
    return res.status(HTTP_OK).json({ breakdown: data });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to fetch user balance breakdown.' });
  }
});

module.exports = router;
