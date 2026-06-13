const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables from server/.env
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

/** Number of bcrypt salt rounds for seed user passwords */
const BCRYPT_SALT_ROUNDS = 10;

/** Default password for all seed users */
const DEFAULT_PASSWORD = 'password123';

/** Seed user definitions: name + email pairs */
const SEED_USERS = [
  { name: 'Aisha', email: 'aisha@example.com' },
  { name: 'Rohan', email: 'rohan@example.com' },
  { name: 'Priya', email: 'priya@example.com' },
  { name: 'Meera', email: 'meera@example.com' },
  { name: 'Dev',   email: 'dev@example.com' },
  { name: 'Sam',   email: 'sam@example.com' },
];

/** Name of the default group created during seeding */
const DEFAULT_GROUP_NAME = 'Flat Expenses';

/**
 * Group membership timeline: defines when each user joined and (optionally) left the group.
 * Dates are in ISO format (UTC) to match Prisma DateTime fields.
 */
const MEMBERSHIP_TIMELINE = [
  // Aisha, Rohan, Priya, Meera — original flatmates from Feb 1, 2025
  { userName: 'Aisha', joinedAt: new Date('2025-02-01T00:00:00.000Z'), leftAt: null },
  { userName: 'Rohan', joinedAt: new Date('2025-02-01T00:00:00.000Z'), leftAt: null },
  { userName: 'Priya', joinedAt: new Date('2025-02-01T00:00:00.000Z'), leftAt: null },
  { userName: 'Meera', joinedAt: new Date('2025-02-01T00:00:00.000Z'), leftAt: new Date('2025-03-31T00:00:00.000Z') },

  // Dev — temporary guest from March 10 to March 20, 2025
  { userName: 'Dev', joinedAt: new Date('2025-03-10T00:00:00.000Z'), leftAt: new Date('2025-03-20T00:00:00.000Z') },

  // Sam — joins as new flatmate from April 15, 2025
  { userName: 'Sam', joinedAt: new Date('2025-04-15T00:00:00.000Z'), leftAt: null },
];

/**
 * Main seed function: creates users, group, and memberships.
 */
async function main() {
  console.log('Seeding database...');

  // Hash the default password once (all seed users share the same password)
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_SALT_ROUNDS);

  // Upsert each user so the seed is idempotent
  const users = {};
  for (const userData of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: { name: userData.name },
      create: {
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
      },
    });
    users[user.name] = user;
    console.log(`  Created/updated user: ${user.name} (${user.email})`);
  }

  // Create the default group (or find existing)
  let group = await prisma.group.findFirst({ where: { name: DEFAULT_GROUP_NAME } });
  if (!group) {
    group = await prisma.group.create({ data: { name: DEFAULT_GROUP_NAME } });
    console.log(`  Created group: ${group.name}`);
  } else {
    console.log(`  Group already exists: ${group.name}`);
  }

  // Create group memberships based on the timeline
  for (const membership of MEMBERSHIP_TIMELINE) {
    const user = users[membership.userName];
    if (!user) {
      console.warn(`  Warning: user "${membership.userName}" not found, skipping membership.`);
      continue;
    }

    // Upsert using the unique constraint (userId + groupId + joinedAt)
    await prisma.groupMembership.upsert({
      where: {
        userId_groupId_joinedAt: {
          userId: user.id,
          groupId: group.id,
          joinedAt: membership.joinedAt,
        },
      },
      update: { leftAt: membership.leftAt },
      create: {
        userId: user.id,
        groupId: group.id,
        joinedAt: membership.joinedAt,
        leftAt: membership.leftAt,
      },
    });

    // Build a readable description of the membership period
    const leftDesc = membership.leftAt
      ? `left ${membership.leftAt.toISOString().split('T')[0]}`
      : 'still active';
    console.log(`  Membership: ${membership.userName} joined ${membership.joinedAt.toISOString().split('T')[0]}, ${leftDesc}`);
  }

  console.log('Seeding complete!');
}

// Execute the seed and handle cleanup
main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    // Always disconnect Prisma client to avoid hanging connections
    await prisma.$disconnect();
  });
