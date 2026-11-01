import type { Metadata } from "next";
import "./globals.css";
import { SERVICE } from "@/lib/config";

export const metadata: Metadata = {
  title: SERVICE.name,
  description: "브랜드에 맞는 상품을 직접 보고 찾아 매칭하는 소싱 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
