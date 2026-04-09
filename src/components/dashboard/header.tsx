interface HeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-heading font-poppins sm:text-[2rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-body">{subtitle}</p>}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </header>
  );
}
