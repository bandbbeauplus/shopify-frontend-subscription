import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // This is an embedded admin app, so every launch belongs in the protected
  // app area. Preserve Shopify's host/shop parameters when they are present.
  throw redirect(`/app${url.search}`);
};

export default function IndexRoute() {
  return null;
}
