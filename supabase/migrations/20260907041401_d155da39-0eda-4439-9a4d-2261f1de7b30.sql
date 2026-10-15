ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url text;

CREATE POLICY "business_logos_read" ON storage.objects
FOR SELECT TO anon, authenticated USING (bucket_id = 'business-logos');

CREATE POLICY "business_logos_owner_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-logos' AND public.owns_business(((storage.foldername(name))[1])::uuid));

CREATE POLICY "business_logos_owner_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'business-logos' AND public.owns_business(((storage.foldername(name))[1])::uuid));

CREATE POLICY "business_logos_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'business-logos' AND public.owns_business(((storage.foldername(name))[1])::uuid));