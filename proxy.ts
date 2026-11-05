import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Dominio público para los huéspedes: solo sirve los formularios; cualquier otra ruta (también la raíz) lleva
// al formulario de enlace único.
const DOMINIO_REGISTRO = "registro.botonesmadrid.com";

export async function proxy(request: NextRequest) {
  if (request.headers.get("host")?.split(":")[0] === DOMINIO_REGISTRO) {
    const ruta = request.nextUrl.pathname;
    if (ruta === "/registro" || ruta.startsWith("/f/")) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/registro";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/cuenta/nueva-password") ||
    request.nextUrl.pathname.startsWith("/f/") || // formulario público de huéspedes
    request.nextUrl.pathname === "/registro"; // formulario público de huéspedes (enlace único para todas las reservas)

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Verificación en dos pasos obligatoria: con sesión iniciada pero sin el segundo factor (nivel aal1) solo se puede
  // estar en /cuenta/verificacion. La base de datos tampoco devuelve datos a una sesión aal1 (política "mfa obligatorio").
  const ruta = request.nextUrl.pathname;
  if (user && !isAuthRoute && ruta !== "/cuenta/verificacion") {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/cuenta/verificacion";
      url.search = ruta === "/" ? "" : `?next=${encodeURIComponent(ruta + request.nextUrl.search)}`;
      const redireccion = NextResponse.redirect(url);
      // Conserva las cookies de sesión que haya refrescado Supabase en esta petición.
      response.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
      return redireccion;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons|.*\\.(?:jpg|jpeg|png|svg|webp|ico)$).*)",
  ],
};
