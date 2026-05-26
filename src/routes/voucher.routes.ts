import { Router } from "express";
import { VoucherController } from "../controllers/voucher.controller.js";

const router = Router();
const voucherController = new VoucherController();

router.get("/", voucherController.getActiveVouchers.bind(voucherController));
router.get("/recommend/:productId", voucherController.recommendByProduct.bind(voucherController));
router.post("/validate", voucherController.validate.bind(voucherController));

export default router;
