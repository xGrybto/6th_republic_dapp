import "@/app/ui/global.css";
import type { Viewport } from "next";
import { Providers } from "./providers";
import Header from "./ui/header";

export const viewport: Viewport = {
  userScalable: false,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        <Providers>
          <Header />
          <div className="pt-16 lg:pt-0 lg:pr-60">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
