import "dotenv/config";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import cors from "cors";
import morgan from "morgan";
import express, { NextFunction, Request, Response } from "express";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import brandRoutes from "./routes/brand.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import interactionRoutes from "./routes/interaction.routes.js";
import orderRoutes from "./routes/order.routes.js";
import productRoutes from "./routes/product.routes.js";
import voucherRoutes from "./routes/voucher.routes.js";
import { aiTrainingQueue, scheduleAiTrainingCronJob } from "./queues/ai-training.queue.js";
import { appLog, httpStream } from "./config/winston.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const apiPrefix = "/api/v1";
const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath(`${apiPrefix}/monitor`);

createBullBoard({
  queues: [new BullMQAdapter(aiTrainingQueue)],
  serverAdapter,
});

app.use(cors());
app.use(express.json());

const REGEX =
  /^(\/api\/queues|\/js|\/css|\/images|\/queue|\/monitor|\/favicon|\/locales)/;

app.use(
  morgan("combined", {
    stream: httpStream,
    skip: function (req) {
      return REGEX.test(req.url);
    }
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/brands`, brandRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/products`, productRoutes);
app.use(`${apiPrefix}/cart`, cartRoutes);
app.use(`${apiPrefix}/orders`, orderRoutes);
app.use(`${apiPrefix}/interactions`, interactionRoutes);
app.use(`${apiPrefix}/vouchers`, voucherRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/monitor`, serverAdapter.getRouter());

void scheduleAiTrainingCronJob().catch((error) => {
  console.error("Failed to schedule AI training cron job:", error);
});

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

  appLog.error(`message - ${err.message}, stack trace - ${err.stack}`);

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
