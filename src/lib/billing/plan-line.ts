import { planForLookupKey, product } from "@/config/product";

/** The subscription line that carries the plan (the extra-mailbox line never decides the plan). */
export const isPlanLine = (lookupKey: string | null | undefined) => !!lookupKey && lookupKey !== product.extraMailbox.lookupKey && !!planForLookupKey(lookupKey);
