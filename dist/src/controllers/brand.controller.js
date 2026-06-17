import { BrandService } from "../services/brand.service.js";
export class BrandController {
    brandService;
    constructor(brandService = new BrandService()) {
        this.brandService = brandService;
    }
    async getBrands(_req, res) {
        const brands = await this.brandService.getBrands();
        return res.json({
            success: true,
            data: brands,
        });
    }
}
