import {ReplaneIcon} from '@/components/replane-icon';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - Replane',
  description: 'Terms of Service for Replane',
};

export default function TermsPage() {
  return (
    <div className="bg-muted min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 font-medium">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <ReplaneIcon className="size-4" />
            </div>
            Replane
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <CardDescription>Last updated: {new Date().toLocaleDateString()}</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none dark:prose-invert">
            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground mb-4">
                By accessing and using Replane (&quot;the Service&quot;), you accept and agree to be
                bound by the terms and provision of this agreement. If you do not agree to these
                terms, please do not use the Service.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
              <p className="text-muted-foreground mb-4">
                Replane provides feature flag and configuration management services. The Service
                allows you to manage feature flags, configuration settings, and deployment controls
                for your applications.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
              <p className="text-muted-foreground mb-4">
                You are responsible for maintaining the confidentiality of your account and
                password. You agree to accept responsibility for all activities that occur under
                your account. You must notify us immediately of any unauthorized use of your
                account.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
              <p className="text-muted-foreground mb-4">
                You agree not to use the Service for any unlawful purpose or in any way that could
                damage, disable, overburden, or impair the Service. You agree not to attempt to gain
                unauthorized access to any part of the Service.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">5. Data and Privacy</h2>
              <p className="text-muted-foreground mb-4">
                Your use of the Service is also governed by our Privacy Policy. Please review our
                Privacy Policy to understand our practices regarding your data.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
              <p className="text-muted-foreground mb-4">
                The Service and its original content, features, and functionality are owned by
                Replane and are protected by international copyright, trademark, patent, trade
                secret, and other intellectual property laws.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">7. Termination</h2>
              <p className="text-muted-foreground mb-4">
                We may terminate or suspend your account and access to the Service immediately,
                without prior notice or liability, for any reason, including if you breach the
                Terms.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">8. Limitation of Liability</h2>
              <p className="text-muted-foreground mb-4">
                In no event shall Replane, nor its directors, employees, partners, agents,
                suppliers, or affiliates, be liable for any indirect, incidental, special,
                consequential or punitive damages, including without limitation, loss of profits,
                data, use, goodwill, or other intangible losses.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">9. Changes to Terms</h2>
              <p className="text-muted-foreground mb-4">
                We reserve the right to modify or replace these Terms at any time. If a revision is
                material, we will provide at least 30 days notice prior to any new terms taking
                effect.
              </p>
            </section>

            <section className="mb-6">
              <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
              <p className="text-muted-foreground mb-4">
                If you have any questions about these Terms, please contact us at tilyupo@gmail.com.
              </p>
            </section>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link
            href="/auth/signin"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
