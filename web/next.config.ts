import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WhatsApp is hidden (reminders are moving to Teams). The page and its code are kept;
  // remove this redirect (and re-add the menu item in admin/layout.tsx) to bring it back.
  async redirects() {
    return [{ source: "/admin/whatsapp", destination: "/admin", permanent: false }];
  },
};

export default nextConfig;
