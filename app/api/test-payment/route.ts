// Legacy preview endpoint deliberately cannot grant access on the public deployment.
export async function POST() {
  return Response.json(
    {
      error: "Simulated payments are unavailable. Use Paystack test checkout.",
    },
    { status: 410 },
  );
}
