import "dotenv/config";
import { faker } from "@faker-js/faker";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const categoryTree = [
  {
    name: "Điện thoại",
    children: ["Apple", "Samsung", "Xiaomi", "OPPO"],
  },
  {
    name: "Laptop & PC",
    children: ["MacBook", "Laptop Gaming", "Laptop Văn phòng", "Linh kiện PC"],
  },
  {
    name: "Máy tính bảng",
    children: ["iPad", "Galaxy Tab", "Máy đọc sách"],
  },
  {
    name: "Âm thanh",
    children: ["Tai nghe Bluetooth", "Loa di động", "Soundbar"],
  },
  {
    name: "Smartwatch",
    children: ["Apple Watch", "Garmin"],
  },
  {
    name: "Nhà thông minh",
    children: ["Robot hút bụi", "Camera an ninh"],
  },
  {
    name: "Phụ kiện",
    children: ["Củ sạc - Cáp", "Sạc dự phòng", "Bàn phím cơ", "Chuột", "Balo - Túi chống sốc"],
  },
  {
    name: "Màn hình",
    children: ["Màn hình Đồ họa", "Màn hình Gaming"],
  },
];

const productAdjectives = [
  "Pro",
  "Max",
  "Ultra",
  "Air",
  "Studio",
  "Prime",
  "Elite",
  "Plus",
  "Neo",
  "Signature",
];

function buildProductName(categoryName: string, index: number) {
  const adjective = faker.helpers.arrayElement(productAdjectives);
  const model = faker.string.alphanumeric({ length: 4, casing: "upper" });

  return `${categoryName} ${adjective} ${model} ${index}`;
}

function buildSku(index: number) {
  return `SKU-${String(index).padStart(4, "0")}-${faker.string.alphanumeric({
    length: 5,
    casing: "upper",
  })}`;
}

function buildSpecifications(categoryName: string) {
  const specsByCategory: Record<string, Record<string, string>> = {
    Apple: {
      "Màn hình": "6.1 inch Super Retina XDR",
      Chip: "A16 Bionic",
      RAM: "6GB",
      "Bộ nhớ": faker.helpers.arrayElement(["128GB", "256GB", "512GB"]),
      Camera: "48MP",
    },
    Samsung: {
      "Màn hình": "6.7 inch Dynamic AMOLED 2X",
      Chip: "Snapdragon 8 Gen 3",
      RAM: faker.helpers.arrayElement(["8GB", "12GB"]),
      "Bộ nhớ": faker.helpers.arrayElement(["256GB", "512GB"]),
      Pin: "5000mAh",
    },
    Xiaomi: {
      "Màn hình": "6.67 inch AMOLED 120Hz",
      Chip: "Snapdragon 7s Gen 2",
      RAM: faker.helpers.arrayElement(["8GB", "12GB"]),
      "Bộ nhớ": "256GB",
      "Sạc nhanh": "67W",
    },
    OPPO: {
      "Màn hình": "6.7 inch AMOLED",
      Chip: "MediaTek Dimensity 7050",
      RAM: "8GB",
      "Bộ nhớ": "256GB",
      Camera: "64MP",
    },
    MacBook: {
      CPU: faker.helpers.arrayElement(["Apple M2", "Apple M3", "Apple M3 Pro"]),
      RAM: faker.helpers.arrayElement(["8GB", "16GB", "24GB"]),
      "Ổ cứng": faker.helpers.arrayElement(["256GB SSD", "512GB SSD", "1TB SSD"]),
      "Màn hình": faker.helpers.arrayElement(["13.6 inch", "14.2 inch", "16.2 inch"]),
      Pin: "Lên đến 18 giờ",
    },
    "Laptop Gaming": {
      CPU: faker.helpers.arrayElement(["Intel Core i7", "AMD Ryzen 7", "Intel Core i9"]),
      GPU: faker.helpers.arrayElement(["RTX 4060", "RTX 4070", "RTX 4080"]),
      RAM: faker.helpers.arrayElement(["16GB", "32GB"]),
      "Ổ cứng": faker.helpers.arrayElement(["512GB SSD", "1TB SSD"]),
      "Tần số quét": "144Hz",
    },
    "Laptop Văn phòng": {
      CPU: faker.helpers.arrayElement(["Intel Core i5", "AMD Ryzen 5", "Intel Core Ultra 5"]),
      RAM: faker.helpers.arrayElement(["8GB", "16GB"]),
      "Ổ cứng": faker.helpers.arrayElement(["512GB SSD", "1TB SSD"]),
      "Màn hình": "14 inch Full HD",
      "Trọng lượng": "1.4kg",
    },
    "Linh kiện PC": {
      Loại: faker.helpers.arrayElement(["CPU", "Mainboard", "RAM", "SSD", "Card đồ họa"]),
      "Chuẩn kết nối": faker.helpers.arrayElement(["PCIe 4.0", "DDR5", "M.2 NVMe"]),
      "Bảo hành": "36 tháng",
    },
    iPad: {
      "Màn hình": faker.helpers.arrayElement(["10.9 inch Liquid Retina", "12.9 inch Liquid Retina XDR"]),
      Chip: faker.helpers.arrayElement(["A14 Bionic", "M1", "M2"]),
      "Bộ nhớ": faker.helpers.arrayElement(["64GB", "128GB", "256GB"]),
      "Hỗ trợ bút": "Apple Pencil",
    },
    "Galaxy Tab": {
      "Màn hình": "11 inch LTPS",
      Chip: "Snapdragon 8 Gen 2",
      RAM: "8GB",
      "Bộ nhớ": "256GB",
      Pin: "8400mAh",
    },
    "Máy đọc sách": {
      "Màn hình": "6.8 inch E-Ink",
      "Bộ nhớ": "16GB",
      "Chống nước": "IPX8",
      Pin: "Lên đến 6 tuần",
    },
    "Tai nghe Bluetooth": {
      Driver: faker.helpers.arrayElement(["10mm", "11mm", "40mm"]),
      "Chống ồn": faker.helpers.arrayElement(["ANC", "Adaptive ANC"]),
      Pin: faker.helpers.arrayElement(["24 giờ", "30 giờ", "40 giờ"]),
      Bluetooth: "5.3",
    },
    "Loa di động": {
      "Công suất": faker.helpers.arrayElement(["20W", "30W", "50W"]),
      Pin: faker.helpers.arrayElement(["12 giờ", "20 giờ", "24 giờ"]),
      "Chống nước": "IP67",
      Bluetooth: "5.3",
    },
    Soundbar: {
      "Công suất": faker.helpers.arrayElement(["200W", "320W", "500W"]),
      "Kênh âm thanh": faker.helpers.arrayElement(["2.1", "3.1.2", "5.1"]),
      "Kết nối": "HDMI ARC, Bluetooth",
      Subwoofer: "Không dây",
    },
    "Apple Watch": {
      "Kích thước": faker.helpers.arrayElement(["41mm", "45mm", "49mm"]),
      "Màn hình": "Always-On Retina",
      "Chống nước": "5ATM",
      Pin: "Lên đến 36 giờ",
    },
    Garmin: {
      GPS: "Multi-band GNSS",
      Pin: faker.helpers.arrayElement(["14 ngày", "21 ngày", "30 ngày"]),
      "Chống nước": "10ATM",
      "Theo dõi sức khỏe": "Nhịp tim, SpO2, giấc ngủ",
    },
    "Robot hút bụi": {
      "Lực hút": faker.helpers.arrayElement(["4000Pa", "5500Pa", "7000Pa"]),
      Pin: faker.helpers.arrayElement(["3200mAh", "5200mAh"]),
      "Lau nhà": "Có",
      "Điều hướng": "LiDAR",
    },
    "Camera an ninh": {
      "Độ phân giải": faker.helpers.arrayElement(["2K", "3MP", "4K"]),
      "Góc nhìn": "130 độ",
      "Lưu trữ": "microSD/Cloud",
      "Chống nước": "IP66",
    },
    "Củ sạc - Cáp": {
      "Công suất": faker.helpers.arrayElement(["20W", "35W", "65W", "100W"]),
      Cổng: faker.helpers.arrayElement(["USB-C", "USB-C + USB-A", "2x USB-C"]),
      "Chuẩn sạc": "PD/PPS",
    },
    "Sạc dự phòng": {
      "Dung lượng": faker.helpers.arrayElement(["10000mAh", "20000mAh", "27000mAh"]),
      "Công suất": faker.helpers.arrayElement(["22.5W", "45W", "65W"]),
      Cổng: "USB-C, USB-A",
    },
    "Bàn phím cơ": {
      Switch: faker.helpers.arrayElement(["Red", "Brown", "Blue", "Silent"]),
      Layout: faker.helpers.arrayElement(["75%", "TKL", "Full-size"]),
      "Kết nối": faker.helpers.arrayElement(["Bluetooth", "2.4GHz", "USB-C"]),
      LED: "RGB",
    },
    Chuột: {
      DPI: faker.helpers.arrayElement(["12000", "26000", "30000"]),
      "Kết nối": faker.helpers.arrayElement(["Bluetooth", "2.4GHz", "USB-C"]),
      "Trọng lượng": faker.helpers.arrayElement(["59g", "75g", "95g"]),
    },
    "Balo - Túi chống sốc": {
      "Kích thước": faker.helpers.arrayElement(["13 inch", "14 inch", "16 inch"]),
      "Chất liệu": "Polyester chống nước",
      "Ngăn laptop": "Có",
    },
    "Màn hình Đồ họa": {
      "Kích thước": faker.helpers.arrayElement(["27 inch", "32 inch"]),
      "Độ phân giải": faker.helpers.arrayElement(["2K", "4K"]),
      "Độ phủ màu": "100% sRGB",
      "Tấm nền": "IPS",
    },
    "Màn hình Gaming": {
      "Kích thước": faker.helpers.arrayElement(["24 inch", "27 inch", "32 inch"]),
      "Tần số quét": faker.helpers.arrayElement(["144Hz", "165Hz", "240Hz"]),
      "Thời gian phản hồi": "1ms",
      "Tấm nền": faker.helpers.arrayElement(["IPS", "VA", "OLED"]),
    },
  };

  return (
    specsByCategory[categoryName] ?? {
      "Bảo hành": "12 tháng",
      "Tình trạng": "Mới 100%",
      "Xuất xứ": faker.helpers.arrayElement(["Việt Nam", "Trung Quốc", "Mỹ", "Nhật Bản"]),
    }
  );
}

async function clearExistingData() {
  await prisma.userInteraction.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function seedCategories() {
  const leafCategories: Array<{ id: number; name: string }> = [];

  for (const parentCategory of categoryTree) {
    const parent = await prisma.category.create({
      data: {
        name: parentCategory.name,
      },
    });

    for (const childCategoryName of parentCategory.children) {
      const child = await prisma.category.create({
        data: {
          name: childCategoryName,
          parentId: parent.id,
        },
      });

      leafCategories.push({
        id: child.id,
        name: child.name,
      });
    }
  }

  return leafCategories;
}

async function seedProducts(leafCategories: Array<{ id: number; name: string }>) {
  const productCount = 300;

  for (let index = 1; index <= productCount; index += 1) {
    const category = leafCategories[(index - 1) % leafCategories.length];
    const stockCount = faker.number.int({ min: 3, max: 18 });

    await prisma.product.create({
      data: {
        name: buildProductName(category.name, index),
        description: faker.commerce.productDescription(),
        specifications: buildSpecifications(category.name),
        price: faker.number.int({ min: 200_000, max: 80_000_000 }),
        sku: buildSku(index),
        imageUrl: faker.image.urlLoremFlickr({
          category: "technology,gadgets",
          width: 600,
          height: 600,
        }),
        categoryId: category.id,
        inventory: {
          create: Array.from({ length: stockCount }, (_, stockIndex) => ({
            serialNumber: `SN-${String(index).padStart(4, "0")}-${String(stockIndex + 1).padStart(
              3,
              "0",
            )}-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`,
            imei: faker.string.numeric(15),
            status: "AVAILABLE" as const,
          })),
        },
      },
    });
  }
}

async function main() {
  faker.seed(20260519);

  await clearExistingData();
  const leafCategories = await seedCategories();
  await seedProducts(leafCategories);

  console.log(`Seeded ${categoryTree.length} parent categories.`);
  console.log(`Seeded ${leafCategories.length} child categories.`);
  console.log("Seeded 300 products.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
