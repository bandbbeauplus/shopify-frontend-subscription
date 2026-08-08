import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { backendTextRequest } from "../lib/backend.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  if (!params.id || !/^\d+$/.test(params.id)) {
    throw new Response("Invalid shipment ID", { status: 400 });
  }

  const result = await backendTextRequest(`/api/shipments/${params.id}/spx-csv`);
  return new Response(result.body, {
    headers: {
      "Content-Type": result.headers.get("content-type") || "text/csv; charset=utf-8",
      "Content-Disposition": result.headers.get("content-disposition") || `attachment; filename=spx-shipment-${params.id}.csv`,
    },
  });
};

export const headers: HeadersFunction = ({ loaderHeaders }) => ({
  "Content-Type": loaderHeaders.get("Content-Type") || "text/csv; charset=utf-8",
  "Content-Disposition": loaderHeaders.get("Content-Disposition") || "attachment; filename=spx-shipment.csv",
});
