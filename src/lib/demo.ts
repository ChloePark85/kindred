import { cookies } from "next/headers";
import { DEMO_COOKIE } from "@/lib/demoConfig";

export { DEMO } from "@/lib/demoConfig";

/** Whether this browser is in demo mode (see demoConfig.ts). */
export async function isDemo() {
  return (await cookies()).get(DEMO_COOKIE)?.value === "1";
}
