import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "ResearchCheck — Paper Duplicate Checker",
  description: "Search public scholarly records for published papers and preprints.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
