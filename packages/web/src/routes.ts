export type AppRoute = "home" | "camera" | "viewer";

export function resolveRoute(params: URLSearchParams): AppRoute {
  const mode = params.get("mode");
  if (mode === "camera") return "camera";
  if (mode === "viewer" || params.has("room")) return "viewer";
  return "home";
}
