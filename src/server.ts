import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import interactionRoutes from "./routes/interaction.routes.js";
import orderRoutes from "./routes/order.routes.js";
import productRoutes from "./routes/product.routes.js";
import voucherRoutes from "./routes/voucher.routes.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const apiPrefix = "/api/v1";

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/products`, productRoutes);
app.use(`${apiPrefix}/cart`, cartRoutes);
app.use(`${apiPrefix}/orders`, orderRoutes);
app.use(`${apiPrefix}/interactions`, interactionRoutes);
app.use(`${apiPrefix}/vouchers`, voucherRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});

app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = err.statusCode ?? 500;

  console.error(err);
  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: statusCode >= 500 ? "Internal server error" : err.message,
    },
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
