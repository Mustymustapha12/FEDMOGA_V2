import { verifyDues } from "../../../../server/dues";
import { appOrigin } from "../../../../server/security";
export async function GET(req: Request) {
  const reference = new URL(req.url).searchParams.get("reference") || "";
  let success = false;
  try {
    await verifyDues(reference);
    success = true;
  } catch {}
  return Response.redirect(
    new URL(
      "/member?dues=" +
        (success ? "success" : "pending") +
        "&reference=" +
        encodeURIComponent(reference),
      appOrigin(),
    ),
    303,
  );
}
