import App from "@/components/App";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  // The map and the list are public; only the admin cookie unlocks uploading.
  let admin = false;
  try {
    admin = await isAdmin();
  } catch {
    admin = false; // ADMIN_PASSWORD not configured yet
  }
  return <App initialIsAdmin={admin} />;
}
