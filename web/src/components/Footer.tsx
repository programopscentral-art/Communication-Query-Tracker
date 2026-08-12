export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line bg-canvas">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-3">
          {/* brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/niat-logo.png" alt="NIAT — NxtWave of Innovation in Advanced Technologies" className="h-10 w-auto" />
            <p className="mt-3 font-ui text-sm font-semibold text-ink">Communication Query Tracker</p>
            <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
              WhatsApp reminders that reach every BOA on time — across every university.
            </p>
          </div>

          {/* how it works */}
          <div>
            <p className="eyebrow mb-3">How it works</p>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>• Reminders fire 15 &amp; 10 min before each publish time</li>
              <li>• Each university sees only its own tasks &amp; team</li>
              <li>• Raise a support ticket from your board anytime</li>
            </ul>
          </div>

          {/* program ops */}
          <div>
            <p className="eyebrow mb-3">Program Ops · NxtWave</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              Built for BOA speed. For access requests or issues, contact the Communication team.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-line-soft pt-6 sm:flex-row">
          <p className="font-ui text-xs text-muted">© {year} NxtWave · NIAT — Internal use only.</p>
          <p className="font-ui text-xs text-muted">
            Communication Query Tracker <span className="text-line">·</span> v1.0
          </p>
        </div>
      </div>
    </footer>
  );
}
