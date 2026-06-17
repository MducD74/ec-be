import { Request, Response } from "express";
import { BrandService } from "../services/brand.service.js";

export class BrandController {
  constructor(private readonly brandService = new BrandService()) {}

  async getBrands(_req: Request, res: Response) {
    const brands = await this.brandService.getBrands();

    return res.json({
      success: true,
      data: brands,
    });
  }
}
