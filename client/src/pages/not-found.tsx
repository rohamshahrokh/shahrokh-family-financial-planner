import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";
import { Link } from "wouter";

// Sprint 3B H-6 — production-grade 404. Replaces the developer-era message
// with a neutral message and a path back to the Dashboard.
export default function NotFound() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-lg border-border/60 bg-background/70 backdrop-blur">
        <CardContent className="pt-6 pb-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <Compass className="h-10 w-10 text-muted-foreground" aria-hidden />
            <h1 className="text-xl font-semibold tracking-tight">
              Page Not Found
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm">
              The page you tried to open is not part of Family Wealth Lab. The
              URL may have changed, or the link was incomplete. Use the
              navigation to return to a known surface.
            </p>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              <Link href="/dashboard">
                <Button variant="default" size="sm" data-testid="not-found-go-dashboard">
                  Go to Dashboard
                </Button>
              </Link>
              <Link href="/timeline">
                <Button variant="ghost" size="sm">Timeline</Button>
              </Link>
              <Link href="/property">
                <Button variant="ghost" size="sm">Property</Button>
              </Link>
              <Link href="/risk-radar">
                <Button variant="ghost" size="sm">Risk Radar</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
