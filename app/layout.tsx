import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Cockipedia", template: "%s - Cockipedia" },
  description: "Create, connect, and keep your own personal encyclopedia locally in your browser.",
  applicationName: "Cockipedia",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
