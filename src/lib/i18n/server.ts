import { getLocale } from "@/lib/preferences-server";

import { createTranslator, type Translator } from "./translate";

/** The request's translator, for server components and generateMetadata. */
export async function getT(): Promise<Translator> {
  return createTranslator(await getLocale());
}
