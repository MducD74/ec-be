import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Role } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { getJwtSecret } from "../middleware/auth.js";
const router = Router();
router.post("/register", async (req, res, next) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: "Email is already registered" });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name },
            select: { id: true, email: true, name: true, createdAt: true },
        });
        const token = jwt.sign({ userId: user.id, email: user.email }, getJwtSecret(), {
            expiresIn: "7d",
        });
        return res.status(201).json({ user, token });
    }
    catch (error) {
        next(error);
    }
});
router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.",
            });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid email or password" });
        }
        const token = jwt.sign({ userId: user.id, email: user.email }, getJwtSecret(), {
            expiresIn: "7d",
        });
        return res.json({
            user: { id: user.id, email: user.email, name: user.name },
            token,
        });
    }
    catch (error) {
        next(error);
    }
});
router.post("/admin-login", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập email và mật khẩu.",
            });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không chính xác",
            });
        }
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "Tài khoản quản trị đã bị khóa. Vui lòng liên hệ quản trị viên.",
            });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Email hoặc mật khẩu không chính xác",
            });
        }
        if (user.role !== Role.ADMIN) {
            return res.status(403).json({
                success: false,
                message: "Từ chối truy cập: Bạn không có quyền quản trị",
            });
        }
        const token = jwt.sign({
            id: user.id,
            userId: user.id,
            email: user.email,
            role: user.role,
        }, getJwtSecret(), {
            expiresIn: "1d",
        });
        return res.json({
            success: true,
            message: "Đăng nhập quản trị thành công.",
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            token,
        });
    }
    catch (error) {
        next(error);
    }
});
export default router;
