import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function checkUserRole(requiredRole: string) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== requiredRole) {
    return false;
  }

  return true;
}