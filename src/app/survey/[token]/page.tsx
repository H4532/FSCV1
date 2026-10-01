import { supabaseAdmin } from "@/lib/supabase/server";
import { getSettings } from "@/lib/data";
import { SurveyForm } from "./SurveyForm";

export const dynamic = "force-dynamic";

/** Public page for the client - no login. */
export default async function SurveyPage({ params }: { params: { token: string } }) {
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("client_surveys").select("submitted_at, events(booking_name)").eq("token", params.token).maybeSingle();
  const settings = await getSettings(sb);
  return (
    <div className="grid min-h-screen place-items-center bg-corniche-soft px-4 py-10">
      <div className="w-full max-w-md rounded-md bg-white p-6 shadow-lg">
        <p className="text-sm font-semibold text-corniche">{settings.hotel.name}</p>
        {!s ? <p className="mt-3">This link is not valid.</p>
          : s.submitted_at ? <p className="mt-3">Thank you, your feedback has been received.</p>
          : <>
              <h1 className="mb-4 mt-1 text-xl font-semibold">How was {(s.events as any)?.booking_name}?</h1>
              <SurveyForm token={params.token} />
            </>}
      </div>
    </div>
  );
}
