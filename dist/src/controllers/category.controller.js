import { CategoryService } from "../services/category.service.js";
export class CategoryController {
    categoryService;
    constructor(categoryService = new CategoryService()) {
        this.categoryService = categoryService;
    }
    async getCategories(_req, res) {
        const categories = await this.categoryService.getCategoryTree();
        return res.json({
            success: true,
            data: categories,
        });
    }
}
