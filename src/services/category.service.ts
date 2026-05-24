import { prisma } from "../lib/prisma.js";

export interface CategoryTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  children: CategoryTreeNode[];
}

interface CategoryRecord {
  id: number;
  name: string;
  parentId: number | null;
}

export class CategoryService {
  async getCategoryTree(): Promise<CategoryTreeNode[]> {
    const categories = await prisma.category.findMany({
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });

    return this.buildTree(categories);
  }

  async getCategoryAndDescendantIds(categoryId: number): Promise<number[]> {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    if (!categories.some((category) => category.id === categoryId)) {
      return [];
    }

    const childrenByParentId = new Map<number, number[]>();

    for (const category of categories) {
      if (category.parentId === null) {
        continue;
      }

      const children = childrenByParentId.get(category.parentId) ?? [];
      children.push(category.id);
      childrenByParentId.set(category.parentId, children);
    }

    const categoryIds: number[] = [];
    const stack = [categoryId];

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (typeof currentId !== "number") {
        continue;
      }

      categoryIds.push(currentId);
      stack.push(...(childrenByParentId.get(currentId) ?? []));
    }

    return categoryIds;
  }

  private buildTree(categories: CategoryRecord[]) {
    const nodeById = new Map<number, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const category of categories) {
      nodeById.set(category.id, {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        children: [],
      });
    }

    for (const category of categories) {
      const node = nodeById.get(category.id);

      if (!node) {
        continue;
      }

      if (category.parentId === null) {
        roots.push(node);
        continue;
      }

      const parent = nodeById.get(category.parentId);

      if (!parent) {
        roots.push(node);
        continue;
      }

      parent.children.push(node);
    }

    return roots;
  }
}
