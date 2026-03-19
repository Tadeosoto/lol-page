import "./globals.css";

export const metadata = {
  title: "LoL WinRate Stats",
  description: "Find the best win-rate champions and your biggest personal counter for ranked League of Legends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

