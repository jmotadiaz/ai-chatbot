// import { NextResponse } from "next/server";
export { auth as middleware } from "@/app/(auth)/auth";

// export default auth((req) => {
//   const { pathname, origin } = req.nextUrl;
//   if (!req.auth && !["/login", "/register"].includes(pathname)) {
//     return NextResponse.redirect(new URL("/login", origin));
//   }

//   if (req.auth && ["/login", "/register"].includes(pathname)) {
//     return NextResponse.redirect(new URL("/", origin));
//   }
//   return NextResponse.next();
// });

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
