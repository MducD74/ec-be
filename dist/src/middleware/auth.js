import jwt from "jsonwebtoken";
export function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;
    if (!token) {
        return res.status(401).json({ message: "Missing access token" });
    }
    try {
        req.user = jwt.verify(token, getJwtSecret());
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid or expired access token" });
    }
}
export function optionalAuthenticateToken(req, _res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;
    if (!token) {
        req.user = undefined;
        return next();
    }
    try {
        req.user = jwt.verify(token, getJwtSecret());
    }
    catch {
        req.user = undefined;
    }
    return next();
}
export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }
    return secret;
}
