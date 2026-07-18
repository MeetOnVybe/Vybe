import { redirect } from "next/navigation";
import { AdminDashboard } from "@/app/admin/AdminDashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/admin");
  const { data, error } = await supabase.rpc("is_vybe_admin", { check_user: userData.user.id });
  if (error || !data) redirect("/safety?error=Administrator%20access%20required");
  return <AdminDashboard />;
}
