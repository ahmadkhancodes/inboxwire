import { hookToken } from "@/lib/secrets";
import { SCOPES, redirectUri } from "./oauth";

/** Everything the BYO OAuth wizard shows: exact redirect URIs, scopes and (Google) gcloud commands for Pub/Sub push. */
export function wizardInfo(base: string, envId: string) {
  const origin = base.replace(/\/$/, "");
  const gmailHook = `${origin}/api/hooks/gmail/${envId}?token=${hookToken(envId)}`;
  const graphHook = `${origin}/api/hooks/graph/${envId}`;
  return {
    google: {
      redirectUri: redirectUri(origin, "google"),
      scopes: SCOPES.google,
      hookUrl: gmailHook,
      gcloud: [
        "gcloud services enable gmail.googleapis.com pubsub.googleapis.com",
        "gcloud pubsub topics create inboxwire-gmail",
        "gcloud pubsub topics add-iam-policy-binding inboxwire-gmail --member=serviceAccount:gmail-api-push@system.gserviceaccount.com --role=roles/pubsub.publisher",
        "gcloud iam service-accounts create inboxwire-push",
        `gcloud pubsub subscriptions create inboxwire-gmail-push --topic=inboxwire-gmail --push-endpoint='${gmailHook}' --push-auth-service-account=inboxwire-push@PROJECT_ID.iam.gserviceaccount.com --push-auth-token-audience='${origin}/api/hooks/gmail/${envId}'`,
      ],
    },
    microsoft: { redirectUri: redirectUri(origin, "microsoft"), scopes: SCOPES.microsoft, hookUrl: graphHook, gcloud: [] as string[] },
  };
}

const TOPIC = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/topics\/[A-Za-z][A-Za-z0-9._~%+-]{2,254}$/;
const SA = /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
export function validatePubsub(topic?: string | null, serviceAccount?: string | null): string | null {
  if (topic && !TOPIC.test(topic)) return "The topic must look like projects/<project-id>/topics/<name>.";
  if (serviceAccount && !SA.test(serviceAccount)) return "The service account must end in .iam.gserviceaccount.com.";
  if (topic && !serviceAccount) return "Enter the push service account so we can verify Pub/Sub's signed token.";
  return null;
}
