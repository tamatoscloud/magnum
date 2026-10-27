import { prisma } from "@/lib/db/prisma";

export default function setup(): () => Promise<void> {
  return async () => {
    await prisma.$disconnect();
  };
}
