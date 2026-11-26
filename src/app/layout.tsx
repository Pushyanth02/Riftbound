import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Riftbound: Echoes of the Fallen",
  description:
    "A dark fantasy pixel-art action roguelike. The seal is weakening - descend the ruined keep, gather what boons the dark offers, and hold the line.",
  applicationName: "Riftbound",
  keywords: ["roguelike", "pixel art", "action RPG", "dark fantasy", "Phaser"],
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0E0A14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Manual Google Fonts link: intentional in the App Router (the
            no-page-custom-font rule targets the Pages Router _document). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Alegreya:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
