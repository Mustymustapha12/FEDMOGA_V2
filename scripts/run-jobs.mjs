// Run this with a private env file or environment variables supplied by your scheduler.
const origin = new URL(process.env.APP_URL || "");
if (origin.protocol !== "https:" || !process.env.JOB_SECRET || process.env.JOB_SECRET.length < 32) throw new Error("Set HTTPS APP_URL and JOB_SECRET (32+ characters)");
const response = await fetch(new URL("/api/jobs/run", origin), {method:"POST",headers:{authorization:"Bearer "+process.env.JOB_SECRET},signal:AbortSignal.timeout(100000)});
if (!response.ok) throw new Error("Scheduled job failed: HTTP "+response.status);
console.log(await response.json());
