export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh bg-background">
      {children}
    </div>
  );
}
