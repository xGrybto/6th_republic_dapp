import "@/app/ui/global.css";
import { Providers } from "./providers";
import Header from "./ui/header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <div className="pr-60">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
