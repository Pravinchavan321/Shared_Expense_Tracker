const jwt = require('jsonwebtoken');

/** JWT secret loaded from environment variables */
const JWT_SECRET = process.env.JWT_SECRET;

/** HTTP status code for unauthorized access */
const HTTP_UNAUTHORIZED = 401;

/**
 * Middleware that verifies JWT token from Authorization header and attaches user to request.
 */
function authMiddleware(req, res, next) {
  try {
    // Extract token from "Bearer <token>" format
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_UNAUTHORIZED).json({ error: 'Access denied. No token provided.' });
    }

    // Strip the "Bearer " prefix to get the raw token
    const token = authHeader.split(' ')[1];

    // Verify and decode the JWT payload
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach decoded user info (id, name, email) to the request object
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(HTTP_UNAUTHORIZED).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = authMiddleware;
