import { Request, Response } from "express";
import { CategoryService } from "../services/category.service.js";

export class CategoryController {
  constructor(private readonly categoryService = new CategoryService()) {}

  async getCategories(_req: Request, res: Response) {
    const categories = await this.categoryService.getCategoryTree();

    return res.json({
      success: true,
      data: categories,
    });
  }
}
