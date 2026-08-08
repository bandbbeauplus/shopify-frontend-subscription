import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { backendTextRequest } from "../lib/backend.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const result = await backendTextRequest("/api/shipments/spx-csv");
  return new Response(result.body, {
    headers: {
      "Content-Type": result.headers.get("content-type") || "text/csv; charset=utf-8",
      "Content-Disposition": result.headers.get("content-disposition") || "attachment; filename=spx-shipments.csv",
    },
  });
};

export const headers: HeadersFunction = ({ loaderHeaders }) => ({
  "Content-Type": loaderHeaders.get("Content-Type") || "text/csv; charset=utf-8",
  "Content-Disposition": loaderHeaders.get("Content-Disposition") || "attachment; filename=spx-shipments.csv",
});
