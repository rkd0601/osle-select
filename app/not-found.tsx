import { tk } from "@/lib/i18n";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="num text-display-l font-semibold text-ink">404</div>
      <p className="mt-2 text-lead text-ink-2">{tk("common.notFound")}</p>
    </main>
  );
}
