import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const ContactUsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9+(). -]{7,30}$/, "Enter a valid phone number."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(254)
    .transform((value) => value.toLowerCase()),
  description: z.string().trim().min(10, "Tell us a little more.").max(2000),
  // A hidden honeypot field. Automated submissions that fill it receive a
  // success response without storing any personal data.
  website: z.string().max(0).optional(),
});

/**
 * Intentionally public contact endpoint. It uses the publishable Supabase
 * client, so the database RLS policy remains the enforcement point. Do not
 * add privileged credentials or user-role middleware to this form.
 */
export const submitContactUs = createServerFn({ method: "POST" })
  .validator((input: unknown) => ContactUsSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website) return { accepted: true };

    const { error } = await supabase.from("contact_us").insert({
      name: data.name,
      phone_number: data.phoneNumber,
      email: data.email,
      description: data.description,
    });

    if (error) {
      console.error("Unable to save contact request:", error.code);
      throw new Error("We could not send your message. Please try again.");
    }

    return { accepted: true };
  });
