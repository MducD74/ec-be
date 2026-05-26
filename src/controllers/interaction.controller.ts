import { NextFunction, Request, Response } from "express";
import { ActionType, InteractionService } from "../services/interaction.service.js";

const interactionService = new InteractionService();
const actionTypes = new Set<ActionType>(["VIEW", "ADD_TO_CART", "PURCHASE"]);

function toPositiveInteger(value: unknown) {
  const numberValue = Number(value);

  if (Number.isInteger(numberValue) && numberValue > 0) {
    return numberValue;
  }

  return undefined;
}

function toActionType(value: unknown) {
  if (typeof value === "string" && actionTypes.has(value as ActionType)) {
    return value as ActionType;
  }

  return undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

export class InteractionController {
  async create(req: Request, res: Response, _next: NextFunction) {
    try {
      const productId = toPositiveInteger(req.body.productId);
      const userId = toPositiveInteger(req.body.userId);
      const actionType = toActionType(req.body.actionType);

      if (!productId) {
        return res.status(400).json({ message: "productId must be a positive integer" });
      }

      if (!actionType) {
        return res.status(400).json({
          message: "actionType must be one of VIEW, ADD_TO_CART, PURCHASE",
        });
      }

      const interaction = await interactionService.record({
        authorization: req.header("authorization") ?? undefined,
        userId,
        productId,
        actionType,
      });

      return res.status(201).json({
        success: true,
        data: interaction,
        interaction,
      });
    } catch (error) {
      return res.status(400).json({ message: getErrorMessage(error) });
    }
  }
}
