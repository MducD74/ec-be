import jwt from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
export function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;
    if (!token) {
        return res.status(401).json({ success: false, message: "Thiếu mã truy cập." });
    }
    try {
        req.user = jwt.verify(token, getJwtSecret());
        next();
    }
    catch {
        return res.status(401).json({
            success: false,
            message: "Mã truy cập không hợp lệ hoặc đã hết hạn.",
        });
    }
}
export async function requireAdmin(req, res, next) {
    const userId = req.user?.userId ?? req.user?.id;
    if (!userId) {
        return res.status(401).json({ success: false, message: "Vui lòng đăng nhập để tiếp tục." });
    }
    try {
        const user = await prisma.user.findUnique({
            where: {
                id: userId,
            },
            select: {
                role: true,
                isActive: true,
            },
        });
        if (!user) {
            return res.status(401).json({ success: false, message: "Tài khoản không tồn tại." });
        }
        if (user.role !== Role.ADMIN) {
            return res.status(403).json({
                success: false,
                message: "Bạn không có quyền truy cập chức năng quản trị.",
            });
        }
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản quản trị đã bị khóa. Vui lòng liên hệ quản trị viên.",
            });
        }
        if (req.user) {
            req.user.role = user.role;
        }
        return next();
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Không thể kiểm tra quyền truy cập quản trị.",
        });
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
