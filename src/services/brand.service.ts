import { prisma } from "../lib/prisma.js";

export class BrandService {
  async getBrands() {
    return prisma.brand.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
