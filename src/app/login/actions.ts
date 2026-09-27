"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth/auth";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = { error: string | null };

/**
 * Only same-origin paths are honoured. `//evil.example` is a protocol-relative
 * URL that a browser resolves to another host, so a bare startsWith("/") check
 * would be an open redirect.
 */
function safeCallbackUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (error) {
    // One message for both "no such account" and "wrong password". Telling
    // them apart hands out a list of which emails are registered.
    if (error instanceof AuthError) {
      return { error: "login.invalidCredentials" };
    }
    throw error;
  }

  // Must sit outside the try block: redirect() signals by throwing, and the
  // catch above would swallow it and silently leave the user on /login.
  redirect(callbackUrl);
}
