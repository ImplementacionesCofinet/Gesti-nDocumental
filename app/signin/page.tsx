import { signIn } from "@/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8f7] px-6">
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/" });
        }}
        className="w-full max-w-sm rounded-lg border border-[#dce5e1] bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-[#173a32]">Gestión de facturas</h1>
        <p className="mt-2 text-sm text-[#52645f]">Inicia sesión con tu cuenta corporativa.</p>
        <button className="mt-6 w-full rounded-md bg-[#176c59] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#125847]" type="submit">
          Continuar con Microsoft
        </button>
      </form>
    </main>
  );
}