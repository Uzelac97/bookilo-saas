import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Caps what a cross-origin resource on any page receives in its
            // Referer header to this app's own origin, never a full URL path —
            // relevant because public booking URLs carry a bearer token
            // (Booking.cancelToken) in the path.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
