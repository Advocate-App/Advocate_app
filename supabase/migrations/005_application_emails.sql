-- 005: application_emails table + test seed data for thread UI verification

ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_sent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS application_emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  email_type      TEXT,
  from_email      TEXT NOT NULL,
  to_email        TEXT NOT NULL,
  subject         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT,
  gmail_thread_id  TEXT,
  sent_at         TIMESTAMPTZ DEFAULT now(),
  comment         TEXT DEFAULT ''
);

ALTER TABLE application_emails ADD COLUMN IF NOT EXISTS comment TEXT DEFAULT '';

ALTER TABLE application_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'application_emails' AND policyname = 'application_emails_own'
  ) THEN
    CREATE POLICY "application_emails_own" ON application_emails
      FOR ALL
      USING (
        application_id IN (
          SELECT a.id FROM applications a
          JOIN advocates adv ON adv.id = a.advocate_id
          WHERE adv.user_id = auth.uid()
        )
      )
      WITH CHECK (
        application_id IN (
          SELECT a.id FROM applications a
          JOIN advocates adv ON adv.id = a.advocate_id
          WHERE adv.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Seed test data: 3 emails for Food Corporation of India (Avi Jain application)
-- application_id d49f03e4-21c2-4650-ad72-35f7f42c95fc
DO $$
DECLARE
  app_id UUID := 'd49f03e4-21c2-4650-ad72-35f7f42c95fc';
BEGIN
  -- Only seed if this application exists and no emails logged yet
  IF EXISTS (SELECT 1 FROM applications WHERE id = app_id)
  AND NOT EXISTS (SELECT 1 FROM application_emails WHERE application_id = app_id) THEN

    -- 1. Our initial application email
    INSERT INTO application_emails (application_id, direction, email_type, from_email, to_email, subject, body, sent_at)
    VALUES (
      app_id, 'sent', 'initial',
      'jainavi.aj@gmail.com', 'legalfci@fci.gov.in',
      'Empanelment Application - Food Corporation of India - Avi Jain',
      'Respected Sir/Madam,

I am writing to apply for empanelment as a Panel Advocate with the Food Corporation of India.

I am enrolled with the Bar Council of Rajasthan (Enrollment No. R/7238/2025) and practice before the courts in Udaipur, Dungarpur, Banswara, Rajsamand, Nathdwara, and Sagwara, covering southern Rajasthan.

My father, Shri Ratnesh Kumar Jain Shah (BCR Enrollment No. 418/1994, 30+ years practice), has been in active legal practice before various courts and tribunals across southern Rajasthan.

I am in a position to handle service matters, civil disputes, arbitration proceedings, contractual disputes, and writ petitions relevant to the Corporation''s legal requirements.

I shall be happy to furnish copies of my enrollment certificate, practice certificate, and identity proof upon request.

Thanking you.

Respectfully yours,
Avi Jain
Advocate, Bar Council of Rajasthan (R/7238/2025)
Chamber No. 39, District Court, Udaipur
Email: jainavi.aj@gmail.com
Mobile: 8824085159',
      '2026-04-23 10:08:46+00'
    );

    -- 2. Reply from FCI Legal Department
    INSERT INTO application_emails (application_id, direction, email_type, from_email, to_email, subject, body, sent_at)
    VALUES (
      app_id, 'received', 'reply',
      'legalfci@fci.gov.in', 'jainavi.aj@gmail.com',
      'Re: Empanelment Application - Food Corporation of India - Avi Jain',
      'Dear Avi Jain,

Thank you for your application for empanelment as Panel Advocate with Food Corporation of India.

We have received your application and it is currently under review by our Legal Department. We shall revert to you upon completion of our internal empanelment process.

Please note that you may be required to submit attested copies of the following documents:
1. Bar Council Enrollment Certificate
2. Practice Certificate
3. Proof of Identity (Aadhar/PAN)
4. Proof of Address

We will contact you at this email address if further information is required.

Regards,
Legal Department
Food Corporation of India',
      '2026-04-24 14:32:00+00'
    );

    -- 3. Our acknowledgment reply
    INSERT INTO application_emails (application_id, direction, email_type, from_email, to_email, subject, body, sent_at)
    VALUES (
      app_id, 'sent', 'acknowledgment',
      'jainavi.aj@gmail.com', 'legalfci@fci.gov.in',
      'Re: Empanelment Application - Food Corporation of India - Avi Jain',
      'Respected Sir/Madam,

Thank you for your response regarding the empanelment application. I have noted your reply and will follow up as needed.

I will arrange all the required documents and shall submit them upon your request.

Respectfully yours,
Avi Jain
Advocate, Bar Council of Rajasthan (R/7238/2025)
Chamber No. 39, District Court, Udaipur
Email: jainavi.aj@gmail.com
Mobile: 8824085159',
      '2026-04-24 15:10:00+00'
    );

    -- Update FCI application status to under_review since they replied
    UPDATE applications
    SET status = 'under_review',
        response_received_at = '2026-04-24 14:32:00+00',
        response_summary = 'Application under review. Legal Dept will contact for documents.',
        response_sentiment = 'positive',
        updated_at = now()
    WHERE id = app_id AND status = 'sent';

  END IF;
END $$;
