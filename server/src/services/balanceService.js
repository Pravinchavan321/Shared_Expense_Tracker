const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculates net balances per user in a group and returns a list of simplified debts using a greedy algorithm.
 */
async function getGroupBalances(groupId) {
  // Get all members of the group to initialize their balances to 0
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId },
    include: { user: true }
  });

  const balances = {};
  for (const m of memberships) {
    balances[m.userId] = {
      userId: m.userId,
      userName: m.user.name,
      netBalance: 0.0
    };
  }

  // Get all expenses for the group (excluding settlements)
  const expenses = await prisma.expense.findMany({
    where: { groupId, isSettlement: false },
    include: { splits: true }
  });

  // Credit the payer and debit the split participants
  for (const exp of expenses) {
    if (!balances[exp.paidById]) {
      const u = await prisma.user.findUnique({ where: { id: exp.paidById } });
      balances[exp.paidById] = { userId: exp.paidById, userName: u ? u.name : `User ${exp.paidById}`, netBalance: 0.0 };
    }
    balances[exp.paidById].netBalance += exp.amount;

    for (const split of exp.splits) {
      if (!balances[split.userId]) {
        const u = await prisma.user.findUnique({ where: { id: split.userId } });
        balances[split.userId] = { userId: split.userId, userName: u ? u.name : `User ${split.userId}`, netBalance: 0.0 };
      }
      balances[split.userId].netBalance -= split.amount;
    }
  }

  // Get all settlements recorded in the group
  const settlements = await prisma.settlement.findMany({
    where: { groupId }
  });

  // Debit the paidBy (payer) and credit the paidTo (recipient)
  for (const set of settlements) {
    if (!balances[set.paidById]) {
      const u = await prisma.user.findUnique({ where: { id: set.paidById } });
      balances[set.paidById] = { userId: set.paidById, userName: u ? u.name : `User ${set.paidById}`, netBalance: 0.0 };
    }
    balances[set.paidById].netBalance += set.amount;

    if (!balances[set.paidToId]) {
      const u = await prisma.user.findUnique({ where: { id: set.paidToId } });
      balances[set.paidToId] = { userId: set.paidToId, userName: u ? u.name : `User ${set.paidToId}`, netBalance: 0.0 };
    }
    balances[set.paidToId].netBalance -= set.amount;
  }

  // Extract creditors and debtors for the simplified debts greedy algorithm
  const creditors = [];
  const debtors = [];
  const formattedBalances = [];

  for (const userId in balances) {
    const rounded = Math.round(balances[userId].netBalance * 100) / 100;
    balances[userId].netBalance = rounded;
    formattedBalances.push(balances[userId]);

    if (rounded > 0.01) {
      creditors.push({ userId: parseInt(userId), userName: balances[userId].userName, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ userId: parseInt(userId), userName: balances[userId].userName, amount: -rounded });
    }
  }

  // Sort descending by outstanding amount to ensure greedy matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const simplifiedDebts = [];
  let i = 0;
  let j = 0;

  // Match largest debtor with largest creditor iteratively
  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    const payment = Math.min(creditor.amount, debtor.amount);

    if (payment > 0.01) {
      simplifiedDebts.push({
        fromId: debtor.userId,
        fromName: debtor.userName,
        toId: creditor.userId,
        toName: creditor.userName,
        amount: Math.round(payment * 100) / 100
      });
    }

    creditor.amount -= payment;
    debtor.amount -= payment;

    if (creditor.amount < 0.01) {
      i++;
    }
    if (debtor.amount < 0.01) {
      j++;
    }
  }

  return {
    balances: formattedBalances,
    simplifiedDebts
  };
}

/**
 * Returns every expense and settlement that affects a specific user in a group with itemized net effects.
 */
async function getUserBreakdown(groupId, userId) {
  // Fetch expenses paid by or split with the user
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      isSettlement: false,
      OR: [
        { paidById: userId },
        { splits: { some: { userId: userId } } }
      ]
    },
    include: {
      paidBy: { select: { id: true, name: true } },
      splits: {
        where: { userId: userId },
        select: { amount: true }
      }
    },
    orderBy: { date: 'desc' }
  });

  // Fetch settlements paid by or to the user
  const settlements = await prisma.settlement.findMany({
    where: {
      groupId,
      OR: [
        { paidById: userId },
        { paidToId: userId }
      ]
    },
    include: {
      paidBy: { select: { id: true, name: true } },
      paidTo: { select: { id: true, name: true } }
    },
    orderBy: { date: 'desc' }
  });

  const breakdown = [];

  // Add expenses to the itemized list
  for (const exp of expenses) {
    const isPayer = exp.paidById === userId;
    const splitShare = exp.splits[0] ? exp.splits[0].amount : 0.0;
    let netEffect = 0.0;
    if (isPayer) {
      netEffect += exp.amount;
    }
    netEffect -= splitShare;

    breakdown.push({
      type: 'expense',
      id: exp.id,
      description: exp.description,
      amount: exp.amount,
      currency: exp.currency,
      originalAmount: exp.originalAmount,
      exchangeRate: exp.exchangeRate,
      date: exp.date,
      paidById: exp.paidById,
      paidByName: exp.paidBy.name,
      isPayer,
      shareAmount: Math.round(splitShare * 100) / 100,
      netEffect: Math.round(netEffect * 100) / 100
    });
  }

  // Add settlements to the itemized list
  for (const set of settlements) {
    const isPayer = set.paidById === userId;
    const netEffect = isPayer ? set.amount : -set.amount;

    breakdown.push({
      type: 'settlement',
      id: set.id,
      description: isPayer ? `Repayment to ${set.paidTo.name}` : `Received settlement from ${set.paidBy.name}`,
      amount: set.amount,
      date: set.date,
      paidById: set.paidById,
      paidByName: set.paidBy.name,
      paidToId: set.paidToId,
      paidToName: set.paidTo.name,
      isPayer,
      netEffect: Math.round(netEffect * 100) / 100
    });
  }

  // Sort everything by transaction date descending
  breakdown.sort((a, b) => new Date(b.date) - new Date(a.date));

  return breakdown;
}

module.exports = {
  getGroupBalances,
  getUserBreakdown
};
