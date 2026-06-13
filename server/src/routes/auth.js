const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/** JWT secret loaded from environment */
const JWT_SECRET = process.env.JWT_SECRET;

/** Token expiration duration */
const TOKEN_EXPIRY = '7d';

/** Number of bcrypt salt rounds for password hashing */
const BCRYPT_SALT_ROUNDS = 10;

/** HTTP status codes used in auth routes */
const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

/** Zod schema for validating registration request body */
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 chars or fewer'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/** Zod schema for validating login request body */
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Generates a signed JWT token for a given user.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * POST /api/auth/register - Create a new user account and return a JWT.
 */
router.post('/register', async (req, res) => {
  try {
    // Validate request body against registration schema
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { name, email, password } = parsed.data;

    // Check if user with same email already exists
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { name }] },
    });

    if (existingUser) {
      return res.status(HTTP_CONFLICT).json({ error: 'User with this email or name already exists.' });
    }

    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Create the user record in the database
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    // Generate and return the JWT
    const token = generateToken(user);

    return res.status(HTTP_CREATED).json({
      message: 'User registered successfully.',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login - Authenticate a user and return a JWT.
 */
router.post('/login', async (req, res) => {
  try {
    // Validate request body against login schema
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.errors[0].message });
    }

    const { email, password } = parsed.data;

    // Look up user by email
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid email or password.' });
    }

    // Compare provided password with stored hash
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid email or password.' });
    }

    // Generate and return the JWT
    const token = generateToken(user);

    return res.status(HTTP_OK).json({
      message: 'Login successful.',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Login failed. Please try again.' });
  }
});

/**
 * GET /api/auth/me - Return the currently authenticated user's info.
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // Fetch full user record using the ID from the JWT payload
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      return res.status(HTTP_UNAUTHORIZED).json({ error: 'User not found.' });
    }

    return res.status(HTTP_OK).json({ user });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to fetch user info.' });
  }
});

/**
 * GET /api/auth/users - Retrieve list of all registered users.
 */
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true }
    });
    return res.status(HTTP_OK).json({ users });
  } catch (error) {
    return res.status(HTTP_INTERNAL_ERROR).json({ error: 'Failed to fetch users.' });
  }
});

module.exports = router;
