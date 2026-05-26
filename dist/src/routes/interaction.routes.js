import { Router } from "express";
import { InteractionController } from "../controllers/interaction.controller.js";
const router = Router();
const interactionController = new InteractionController();
router.post("/", interactionController.create.bind(interactionController));
export default router;
